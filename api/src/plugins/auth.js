import fp from "fastify-plugin";
import { apiClientsRepo } from "../repositories/apiClientsRepo.js";
import { apiClientPermissionsRepo } from "../repositories/apiClientPermissionsRepo.js";
import { apiClientTokensRepo } from "../repositories/apiClientTokensRepo.js";
import { sessionsRepo } from "../repositories/sessionsRepo.js";
import { usersRepo } from "../repositories/usersRepo.js";
import { permissionsRepo } from "../repositories/permissionsRepo.js";
import { rolesRepo } from "../repositories/rolesRepo.js";
import { getRequestContext, patchRequestContext } from "../services/requestContext.js";

export default fp(async function authPlugin(fastify) {
  const cookieName = fastify.config.SESSION_COOKIE_NAME;

  fastify.decorateRequest("user", null);
  fastify.decorateRequest("sessionId", null);
  fastify.decorateRequest("apiClient", null);
  fastify.decorateRequest("authType", null);
  fastify.decorateRequest("authPermissions", null);

  fastify.addHook("preHandler", async (req) => {
    const authHeader = String(req.headers?.authorization || "").trim();
    if (authHeader.toLowerCase().startsWith("bearer ")) {
      const token = authHeader.slice(7).trim();
      if (!token) return;

      const tokensRepo = apiClientTokensRepo(fastify.db);
      const clientsRepo = apiClientsRepo(fastify.db);
      const clientPermissions = apiClientPermissionsRepo(fastify.db);
      const authSvc = fastify.authService;
      const tokenHash = authSvc.hashOpaqueToken(token);
      const tokenRow = await tokensRepo.findValidByHash(tokenHash);
      if (!tokenRow) return;

      const client = await clientsRepo.findById(tokenRow.api_client_id);
      if (!client || !client.active) return;
      if (client.expires_at && new Date(client.expires_at).getTime() <= Date.now()) return;

      const permissions = await clientPermissions.listByClientId(client.id);
      req.apiClient = {
        id: client.id,
        key: client.client_key,
        name: client.name,
        owner_user_id: client.owner_user_id,
        permissions,
      };
      req.authType = "api_client";
      req.authPermissions = permissions;

      patchRequestContext({
        userId: null,
        sessionId: null,
        apiClientId: client.id,
      });

      const context = getRequestContext();
      if (context?.auditTrx) {
        await context.auditTrx.raw(
          "select set_config('app.user_id', ?, true), set_config('app.session_id', ?, true), set_config('app.api_client_id', ?, true)",
          ["", "", String(client.id)],
        );
      }

      await Promise.all([
        tokensRepo.touch(tokenRow.id),
        clientsRepo.update(client.id, { last_used_at: fastify.db.fn.now() }),
      ]);
      return;
    }

    const sid = req.cookies?.[cookieName];
    if (!sid) return;

    const sRepo = sessionsRepo(fastify.db);
    const uRepo = usersRepo(fastify.db);
    const pRepo = permissionsRepo(fastify.db);
    const rRepo = rolesRepo(fastify.db);

    const session = await sRepo.findValidById(sid);
    if (!session) return;

    const user = await uRepo.findById(session.user_id);
    if (!user) return;

    const [permissions, roles] = await Promise.all([
      pRepo.listEffectiveByUserId(user.id),
      rRepo.listByUserId(user.id),
    ]);

    req.sessionId = sid;
    req.authType = "user";
    req.authPermissions = permissions;
    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      inactive: user.inactive,
      permissions,
      roles,
    };
    patchRequestContext({
      userId: user.id,
      sessionId: sid,
      apiClientId: null,
    });

    const context = getRequestContext();
    if (context?.auditTrx) {
      await context.auditTrx.raw(
        "select set_config('app.user_id', ?, true), set_config('app.session_id', ?, true), set_config('app.api_client_id', ?, true)",
        [String(user.id), String(sid), ""],
      );
    }
  });

});
