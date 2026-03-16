import argon2 from "argon2";
import { z } from "zod";
import { apiClientsRepo } from "../../repositories/apiClientsRepo.js";
import { apiClientPermissionsRepo } from "../../repositories/apiClientPermissionsRepo.js";
import { apiClientTokensRepo } from "../../repositories/apiClientTokensRepo.js";
import { apiClientAuthLogRepo } from "../../repositories/apiClientAuthLogRepo.js";
import { usersRepo } from "../../repositories/usersRepo.js";
import { authLoginAttemptsRepo } from "../../repositories/authLoginAttemptsRepo.js";
import { authLoginsRepo } from "../../repositories/authLoginsRepo.js";
import { sessionsRepo } from "../../repositories/sessionsRepo.js";
import { permissionsRepo } from "../../repositories/permissionsRepo.js";
import { rolesRepo } from "../../repositories/rolesRepo.js";
import { settingsRepo } from "../../repositories/settingsRepo.js";
import { authService } from "../../services/authService.js";
import { requireAuth } from "../../http/guards.js";

export async function authRoutes(fastify) {
  const ensureAuthenticated = requireAuth;
  const uRepo = usersRepo(fastify.db);
  const apiClients = apiClientsRepo(fastify.db);
  const apiClientPermissions = apiClientPermissionsRepo(fastify.db);
  const apiClientTokens = apiClientTokensRepo(fastify.db);
  const apiClientAuthLog = apiClientAuthLogRepo(fastify.db);
  const attemptsRepo = authLoginAttemptsRepo(fastify.db);
  const loginHistoryRepo = authLoginsRepo(fastify.db);
  const sRepo = sessionsRepo(fastify.db);
  const pRepo = permissionsRepo(fastify.db);
  const rRepo = rolesRepo(fastify.db);
  const cfgRepo = settingsRepo(fastify.db);
  const service = authService(fastify.config);

  async function recordFailedAttempt({ attemptedEmail, userId = null, ip = null, userAgent = null, failureReason = "invalid_credentials" }) {
    const windowStart = service.buildLoginAttemptWindowStart();
    const recentFailures = await attemptsRepo.countRecentFailures({
      attempted_email: attemptedEmail,
      since: windowStart,
    });
    const policy = service.getLoginAttemptPolicy();
    const blockedUntil = recentFailures + 1 >= policy.limit ? service.buildLoginAttemptBlockedUntil() : null;

    await attemptsRepo.createFailure({
      attempted_email: attemptedEmail,
      user_id: userId,
      ip,
      user_agent: userAgent,
      failure_reason: failureReason,
      blocked_until: blockedUntil,
    });

    return blockedUntil;
  }

  fastify.post("/auth/login", async (req, reply) => {
    const schema = z.object({
      email: z.string().email(),
      password: z.string().min(6).max(120),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
    }

    const attemptedEmail = String(parsed.data.email || "").trim().toLowerCase();
    const userAgent = req.headers["user-agent"] || null;
    const activeBlock = await attemptsRepo.findActiveBlock({ attempted_email: attemptedEmail });
    if (activeBlock?.blocked_until) {
      await attemptsRepo.createFailure({
        attempted_email: attemptedEmail,
        user_id: null,
        ip: req.ip,
        user_agent: userAgent,
        failure_reason: "blocked",
        blocked_until: activeBlock.blocked_until,
      });
      return reply.code(429).send({
        error: "too_many_login_attempts",
        blocked_until: activeBlock.blocked_until,
      });
    }

    const user = await uRepo.findByEmail(attemptedEmail);
    if (!user || !user.password_hash || user.inactive) {
      const blockedUntil = await recordFailedAttempt({
        attemptedEmail,
        userId: user?.id || null,
        ip: req.ip,
        userAgent,
      });
      if (blockedUntil) {
        return reply.code(429).send({ error: "too_many_login_attempts", blocked_until: blockedUntil });
      }
      return reply.code(401).send({ error: "invalid_credentials" });
    }

    const ok = await argon2.verify(user.password_hash, parsed.data.password);
    if (!ok) {
      const blockedUntil = await recordFailedAttempt({
        attemptedEmail,
        userId: user.id,
        ip: req.ip,
        userAgent,
      });
      if (blockedUntil) {
        return reply.code(429).send({ error: "too_many_login_attempts", blocked_until: blockedUntil });
      }
      return reply.code(401).send({ error: "invalid_credentials" });
    }

    const sid = service.generateSessionToken();
    const sessionTtlMinutes = await cfgRepo.getSessionTtlMinutes();
    const expiresAt = service.buildSessionExpiry(sessionTtlMinutes);

    await fastify.db.transaction(async (trx) => {
      const trxSessionsRepo = sessionsRepo(trx);
      const trxLoginsRepo = authLoginsRepo(trx);

      await trxSessionsRepo.revokeActiveByUserId(user.id);
      await trxLoginsRepo.revokeActiveByUserId(user.id);

      await trxSessionsRepo.create({
        id: sid,
        user_id: user.id,
        expires_at: expiresAt,
        ip: req.ip,
        user_agent: userAgent,
      });

      await trxLoginsRepo.create({
        user_id: user.id,
        session_id: sid,
        email: user.email,
        ip: req.ip,
        user_agent: userAgent,
      });
    });

    reply.setCookie(fastify.config.SESSION_COOKIE_NAME, sid, {
      httpOnly: true,
      secure: fastify.config.SESSION_COOKIE_SECURE,
      sameSite: fastify.config.SESSION_COOKIE_SAMESITE,
      path: "/",
      expires: expiresAt,
    });

    const [permissions, roles] = await Promise.all([
      pRepo.listEffectiveByUserId(user.id),
      rRepo.listByUserId(user.id),
    ]);

    return reply.send({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        inactive: user.inactive,
        permissions,
        roles,
      },
    });
  });

  fastify.post("/auth/logout", { preHandler: ensureAuthenticated }, async (req, reply) => {
    if (!req.user) {
      return reply.code(400).send({ error: "logout_not_supported_for_api_client" });
    }

    if (req.sessionId) {
      await Promise.all([
        sRepo.revokeById(req.sessionId),
        loginHistoryRepo.revokeBySessionId(req.sessionId),
      ]);
    }

    reply.clearCookie(fastify.config.SESSION_COOKIE_NAME, {
      path: "/",
      httpOnly: true,
      secure: fastify.config.SESSION_COOKIE_SECURE,
      sameSite: fastify.config.SESSION_COOKIE_SAMESITE,
    });

    return reply.code(204).send();
  });

  fastify.get("/auth/me", { preHandler: ensureAuthenticated }, async (req, reply) => {
    if (req.apiClient) {
      return reply.send({
        auth_type: "api_client",
        api_client: req.apiClient,
      });
    }

    return reply.send({ auth_type: "user", user: req.user });
  });

  fastify.post("/auth/api-clients/token", async (req, reply) => {
    const schema = z.object({
      client_key: z.string().trim().min(8).max(120),
      client_secret: z.string().trim().min(16).max(512),
    });

    const parsed = schema.safeParse(req.body || {});
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
    }

    const userAgent = req.headers["user-agent"] || null;
    const client = await apiClients.findByClientKey(parsed.data.client_key);
    if (!client || !client.active) {
      await apiClientAuthLog.create({
        api_client_id: client?.id || null,
        user_id: null,
        event_type: "auth_failed",
        ip: req.ip,
        user_agent: userAgent,
      });
      return reply.code(401).send({ error: "invalid_client_credentials" });
    }

    if (client.expires_at && new Date(client.expires_at).getTime() <= Date.now()) {
      await apiClientAuthLog.create({
        api_client_id: client.id,
        user_id: null,
        event_type: "auth_failed",
        ip: req.ip,
        user_agent: userAgent,
      });
      return reply.code(401).send({ error: "api_client_expired" });
    }

    const secretOk = await argon2.verify(client.client_secret_hash, parsed.data.client_secret);
    if (!secretOk) {
      await apiClientAuthLog.create({
        api_client_id: client.id,
        user_id: null,
        event_type: "auth_failed",
        ip: req.ip,
        user_agent: userAgent,
      });
      return reply.code(401).send({ error: "invalid_client_credentials" });
    }

    const accessToken = service.generateApiAccessToken();
    const tokenHash = service.hashOpaqueToken(accessToken);
    const expiresAt = service.buildApiTokenExpiry();

    await fastify.db.transaction(async (trx) => {
      const trxTokens = apiClientTokensRepo(trx);
      const trxClients = apiClientsRepo(trx);
      const trxAuthLog = apiClientAuthLogRepo(trx);

      await trxTokens.revokeActiveByClientId(client.id);
      await trxTokens.create({
        api_client_id: client.id,
        token_hash: tokenHash,
        expires_at: expiresAt,
      });
      await trxClients.update(client.id, { last_used_at: trx.fn.now() });
      await trxAuthLog.create({
        api_client_id: client.id,
        user_id: null,
        event_type: "token_issued",
        ip: req.ip,
        user_agent: userAgent,
      });
    });

    const permissions = await apiClientPermissions.listByClientId(client.id);
    return reply.send({
      token_type: "Bearer",
      access_token: accessToken,
      expires_at: expiresAt,
      api_client: {
        id: client.id,
        key: client.client_key,
        name: client.name,
        permissions,
      },
    });
  });
}
