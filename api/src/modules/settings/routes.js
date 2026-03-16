import { z } from "zod";
import argon2 from "argon2";
import { apiClientsRepo } from "../../repositories/apiClientsRepo.js";
import { apiClientPermissionsRepo } from "../../repositories/apiClientPermissionsRepo.js";
import { usersRepo } from "../../repositories/usersRepo.js";
import { permissionsRepo } from "../../repositories/permissionsRepo.js";
import { sessionsRepo } from "../../repositories/sessionsRepo.js";
import { authLoginsRepo } from "../../repositories/authLoginsRepo.js";
import {
  settingsRepo,
  DEFAULT_APP_LOCALE,
  DEFAULT_APP_LOG_LEVEL,
  DEFAULT_SESSION_TTL_MINUTES,
} from "../../repositories/settingsRepo.js";
import { requireAuth } from "../../http/guards.js";

const permissionKeySchema = z
  .string()
  .trim()
  .min(3)
  .max(120)
  .regex(/^[a-z0-9]+(?:\.[a-z0-9_]+)+$/, "invalid_permission_key_format");

const generalSettingsSchema = z.object({
  session_ttl_minutes: z.coerce.number().int().min(5).max(24 * 60),
  locale: z.enum(["pt_BR", "en_US"]).default(DEFAULT_APP_LOCALE),
  log_level: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default(DEFAULT_APP_LOG_LEVEL),
});

function isSuperAllowed(req) {
  return Array.isArray(req.user?.permissions) && req.user.permissions.includes("*");
}

function parseUserAgent(userAgent = "") {
  const ua = String(userAgent || "");
  const uaLower = ua.toLowerCase();

  let os = "Unknown";
  if (uaLower.includes("windows nt 10")) os = "Windows 10";
  else if (uaLower.includes("windows nt 11")) os = "Windows 11";
  else if (uaLower.includes("windows")) os = "Windows";
  else if (uaLower.includes("android")) os = "Android";
  else if (uaLower.includes("iphone") || uaLower.includes("ipad") || uaLower.includes("ios")) os = "iOS";
  else if (uaLower.includes("mac os x") || uaLower.includes("macintosh")) os = "macOS";
  else if (uaLower.includes("linux")) os = "Linux";

  let browser = "Unknown";
  if (uaLower.includes("edg/")) browser = "Edge";
  else if (uaLower.includes("chrome/")) browser = "Chrome";
  else if (uaLower.includes("firefox/")) browser = "Firefox";
  else if (uaLower.includes("safari/") && !uaLower.includes("chrome/")) browser = "Safari";

  return { os, browser };
}

export async function settingsRoutes(fastify) {
  const repoApiClients = apiClientsRepo(fastify.db);
  const repoApiClientPermissions = apiClientPermissionsRepo(fastify.db);
  const repoUsers = usersRepo(fastify.db);
  const repoPermissions = permissionsRepo(fastify.db);
  const repoSessions = sessionsRepo(fastify.db);
  const repoAuthLogins = authLoginsRepo(fastify.db);
  const repoSettings = settingsRepo(fastify.db);
  const authSvc = fastify.authService;
  const hiddenPermissionPrefixes = ["cases.", "settings."];
  const ensureAuthenticated = requireAuth;

  fastify.get("/settings/general", { preHandler: ensureAuthenticated }, async (req, reply) => {
    if (!isSuperAllowed(req)) return reply.code(403).send({ error: "forbidden" });

    const [sessionTtlMinutes, locale, logLevel] = await Promise.all([
      repoSettings.getSessionTtlMinutes(),
      repoSettings.getAppLocale(),
      repoSettings.getAppLogLevel(fastify.log.level || fastify.config.LOG_LEVEL || DEFAULT_APP_LOG_LEVEL),
    ]);
    return reply.send({
      settings: {
        session_ttl_minutes: sessionTtlMinutes || DEFAULT_SESSION_TTL_MINUTES,
        locale: locale || DEFAULT_APP_LOCALE,
        log_level: logLevel || DEFAULT_APP_LOG_LEVEL,
      },
    });
  });

  fastify.put("/settings/general", { preHandler: ensureAuthenticated }, async (req, reply) => {
    if (!isSuperAllowed(req)) return reply.code(403).send({ error: "forbidden" });

    const parsedBody = generalSettingsSchema.safeParse(req.body || {});
    if (!parsedBody.success) {
      return reply.code(400).send({ error: "invalid_payload", details: parsedBody.error.flatten() });
    }

    await Promise.all([
      repoSettings.setSessionTtlMinutes(parsedBody.data.session_ttl_minutes),
      repoSettings.setAppLocale(parsedBody.data.locale),
      repoSettings.setAppLogLevel(parsedBody.data.log_level),
    ]);
    fastify.log.level = parsedBody.data.log_level;
    fastify.currentLocale = parsedBody.data.locale;
    return reply.send({
      settings: {
        session_ttl_minutes: parsedBody.data.session_ttl_minutes,
        locale: parsedBody.data.locale,
        log_level: parsedBody.data.log_level,
      },
    });
  });

  fastify.get(
    "/settings/permissions",
    { preHandler: ensureAuthenticated },
    async (req, reply) => {
      if (!isSuperAllowed(req)) return reply.code(403).send({ error: "forbidden" });
      const items = await repoPermissions.listCatalog({ excludePrefixes: hiddenPermissionPrefixes });
      return reply.send({ items });
    }
  );

  fastify.post(
    "/settings/permissions",
    { preHandler: ensureAuthenticated },
    async (req, reply) => {
      if (!isSuperAllowed(req)) return reply.code(403).send({ error: "forbidden" });
      const bodySchema = z.object({
        key: permissionKeySchema,
        description: z.string().trim().max(255).nullable().optional(),
      });

      const parsedBody = bodySchema.safeParse(req.body || {});
      if (!parsedBody.success) {
        return reply.code(400).send({ error: "invalid_payload", details: parsedBody.error.flatten() });
      }

      const payload = {
        key: parsedBody.data.key,
        description: parsedBody.data.description || null,
      };

      const existing = await repoPermissions.findByKey(payload.key);
      if (existing) return reply.code(409).send({ error: "permission_key_already_exists" });

      const created = await repoPermissions.create(payload);
      return reply.code(201).send({ permission: created });
    }
  );

  fastify.put(
    "/settings/permissions/:key",
    { preHandler: ensureAuthenticated },
    async (req, reply) => {
      if (!isSuperAllowed(req)) return reply.code(403).send({ error: "forbidden" });
      const paramsSchema = z.object({ key: z.string().trim().min(1).max(120) });
      const bodySchema = z.object({
        description: z.string().trim().max(255).nullable().optional(),
      });

      const parsedParams = paramsSchema.safeParse(req.params || {});
      const parsedBody = bodySchema.safeParse(req.body || {});
      if (!parsedParams.success || !parsedBody.success) {
        return reply.code(400).send({ error: "invalid_payload", details: parsedBody.error?.flatten?.() });
      }

      const key = parsedParams.data.key;
      const existing = await repoPermissions.findByKey(key);
      if (!existing) return reply.code(404).send({ error: "permission_not_found" });

      const updated = await repoPermissions.updateDescription(key, parsedBody.data.description || null);
      return reply.send({ permission: updated });
    }
  );

  fastify.delete(
    "/settings/permissions/:key",
    { preHandler: ensureAuthenticated },
    async (req, reply) => {
      if (!isSuperAllowed(req)) return reply.code(403).send({ error: "forbidden" });
      const paramsSchema = z.object({ key: z.string().trim().min(1).max(120) });
      const parsedParams = paramsSchema.safeParse(req.params || {});
      if (!parsedParams.success) return reply.code(400).send({ error: "invalid_payload" });

      const key = parsedParams.data.key;
      if (key === "*") return reply.code(400).send({ error: "cannot_delete_super_permission" });

      const existing = await repoPermissions.findByKey(key);
      if (!existing) return reply.code(404).send({ error: "permission_not_found" });

      await repoPermissions.remove(key);
      return reply.code(204).send();
    }
  );

  fastify.get(
    "/settings/sessions",
    { preHandler: ensureAuthenticated },
    async (req, reply) => {
      if (!isSuperAllowed(req)) return reply.code(403).send({ error: "forbidden" });
      const rows = await repoSessions.listActive();
      const items = rows.map((row) => {
        const parsed = parseUserAgent(row.user_agent);
        return {
          id: row.id,
          user_id: row.user_id,
          user_name: row.user_name,
          user_email: row.user_email,
          ip: row.ip,
          os: parsed.os,
          browser: parsed.browser,
          user_agent: row.user_agent,
          created_at: row.created_at,
          expires_at: row.expires_at,
          is_current: row.id === req.sessionId,
        };
      });

      return reply.send({ items });
    }
  );

  fastify.post(
    "/settings/sessions/:id/revoke",
    { preHandler: ensureAuthenticated },
    async (req, reply) => {
      if (!isSuperAllowed(req)) return reply.code(403).send({ error: "forbidden" });
      const paramsSchema = z.object({ id: z.string().trim().min(8).max(128) });
      const parsedParams = paramsSchema.safeParse(req.params || {});
      if (!parsedParams.success) return reply.code(400).send({ error: "invalid_payload" });

      const targetId = parsedParams.data.id;
      if (targetId === req.sessionId) {
        return reply.code(400).send({ error: "cannot_revoke_current_session" });
      }

      const updatedCount = await repoSessions.revokeById(targetId);
      if (!updatedCount) return reply.code(404).send({ error: "session_not_found" });
      await repoAuthLogins.revokeBySessionId(targetId);

      return reply.code(204).send();
    }
  );

  fastify.get("/settings/api-clients", { preHandler: ensureAuthenticated }, async (req, reply) => {
    if (!isSuperAllowed(req)) return reply.code(403).send({ error: "forbidden" });

    const items = await repoApiClients.list();
    const enriched = await Promise.all(
      items.map(async (item) => ({
        ...item,
        permissions: await repoApiClientPermissions.listByClientId(item.id),
      }))
    );

    return reply.send({ items: enriched });
  });

  fastify.get("/settings/api-clients/owners", { preHandler: ensureAuthenticated }, async (req, reply) => {
    if (!isSuperAllowed(req)) return reply.code(403).send({ error: "forbidden" });

    const rows = await repoUsers.list({
      page: 1,
      pageSize: 200,
      search: "",
      sortBy: "name",
      sortDir: "asc",
    });

    return reply.send({
      items: (rows.items || []).map((item) => ({
        id: item.id,
        name: item.name,
        email: item.email,
        inactive: item.inactive,
      })),
    });
  });

  fastify.post("/settings/api-clients", { preHandler: ensureAuthenticated }, async (req, reply) => {
    if (!isSuperAllowed(req)) return reply.code(403).send({ error: "forbidden" });

    const bodySchema = z.object({
      name: z.string().trim().min(2).max(200),
      description: z.string().trim().max(1000).nullable().optional(),
      owner_user_id: z.string().uuid().nullable().optional(),
      expires_at: z.string().datetime().nullable().optional(),
      permission_keys: z.array(permissionKeySchema).default([]),
    });

    const parsed = bodySchema.safeParse(req.body || {});
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
    }

    if (parsed.data.owner_user_id) {
      const owner = await repoUsers.findById(parsed.data.owner_user_id);
      if (!owner) return reply.code(400).send({ error: "owner_user_not_found" });
    }

    for (const permissionKey of parsed.data.permission_keys) {
      const found = await repoPermissions.findByKey(permissionKey);
      if (!found) return reply.code(400).send({ error: "permission_not_found", permission: permissionKey });
    }

    const clientKey = authSvc.generateApiClientKey();
    const clientSecret = authSvc.generateApiClientSecret();
    const clientSecretHash = await argon2.hash(clientSecret);

    let created = null;
    await fastify.db.transaction(async (trx) => {
      const trxClients = apiClientsRepo(trx);
      const trxPermissions = apiClientPermissionsRepo(trx);

      created = await trxClients.create({
        name: parsed.data.name,
        description: parsed.data.description || null,
        client_key: clientKey,
        client_secret_hash: clientSecretHash,
        active: true,
        owner_user_id: parsed.data.owner_user_id || null,
        expires_at: parsed.data.expires_at ? new Date(parsed.data.expires_at) : null,
      });
      await trxPermissions.replaceForClient(created.id, parsed.data.permission_keys);
    });

    return reply.code(201).send({
      api_client: {
        ...created,
        client_secret: clientSecret,
        permissions: parsed.data.permission_keys,
      },
    });
  });

  fastify.put("/settings/api-clients/:id", { preHandler: ensureAuthenticated }, async (req, reply) => {
    if (!isSuperAllowed(req)) return reply.code(403).send({ error: "forbidden" });

    const params = z.object({ id: z.string().uuid() }).safeParse(req.params || {});
    const bodySchema = z.object({
      name: z.string().trim().min(2).max(200),
      description: z.string().trim().max(1000).nullable().optional(),
      active: z.boolean().default(true),
      owner_user_id: z.string().uuid().nullable().optional(),
      expires_at: z.string().datetime().nullable().optional(),
      permission_keys: z.array(permissionKeySchema).default([]),
    });
    const parsed = bodySchema.safeParse(req.body || {});
    if (!params.success || !parsed.success) {
      return reply.code(400).send({ error: "invalid_payload", details: parsed.error?.flatten?.() });
    }

    const existing = await repoApiClients.findById(params.data.id);
    if (!existing) return reply.code(404).send({ error: "api_client_not_found" });

    if (parsed.data.owner_user_id) {
      const owner = await repoUsers.findById(parsed.data.owner_user_id);
      if (!owner) return reply.code(400).send({ error: "owner_user_not_found" });
    }

    for (const permissionKey of parsed.data.permission_keys) {
      const found = await repoPermissions.findByKey(permissionKey);
      if (!found) return reply.code(400).send({ error: "permission_not_found", permission: permissionKey });
    }

    let updated = null;
    await fastify.db.transaction(async (trx) => {
      const trxClients = apiClientsRepo(trx);
      const trxPermissions = apiClientPermissionsRepo(trx);

      updated = await trxClients.update(params.data.id, {
        name: parsed.data.name,
        description: parsed.data.description || null,
        active: parsed.data.active,
        owner_user_id: parsed.data.owner_user_id || null,
        expires_at: parsed.data.expires_at ? new Date(parsed.data.expires_at) : null,
      });
      await trxPermissions.replaceForClient(params.data.id, parsed.data.permission_keys);
    });

    return reply.send({
      api_client: {
        ...updated,
        permissions: parsed.data.permission_keys,
      },
    });
  });

  fastify.post("/settings/api-clients/:id/rotate-secret", { preHandler: ensureAuthenticated }, async (req, reply) => {
    if (!isSuperAllowed(req)) return reply.code(403).send({ error: "forbidden" });

    const params = z.object({ id: z.string().uuid() }).safeParse(req.params || {});
    if (!params.success) return reply.code(400).send({ error: "invalid_payload" });

    const existing = await repoApiClients.findById(params.data.id);
    if (!existing) return reply.code(404).send({ error: "api_client_not_found" });

    const clientSecret = authSvc.generateApiClientSecret();
    const clientSecretHash = await argon2.hash(clientSecret);

    let updated = null;
    await fastify.db.transaction(async (trx) => {
      const trxClients = apiClientsRepo(trx);
      const trxTokens = apiClientTokensRepo(trx);

      updated = await trxClients.update(params.data.id, {
        client_secret_hash: clientSecretHash,
      });
      await trxTokens.revokeActiveByClientId(params.data.id);
    });

    return reply.send({
      api_client: updated,
      client_secret: clientSecret,
    });
  });

  fastify.delete("/settings/api-clients/:id", { preHandler: ensureAuthenticated }, async (req, reply) => {
    if (!isSuperAllowed(req)) return reply.code(403).send({ error: "forbidden" });

    const params = z.object({ id: z.string().uuid() }).safeParse(req.params || {});
    if (!params.success) return reply.code(400).send({ error: "invalid_payload" });

    const existing = await repoApiClients.findById(params.data.id);
    if (!existing) return reply.code(404).send({ error: "api_client_not_found" });

    await repoApiClients.remove(params.data.id);
    return reply.code(204).send();
  });
}
