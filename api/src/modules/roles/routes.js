import { z } from "zod";
import { rolesRepo } from "../../repositories/rolesRepo.js";
import { permissionsRepo } from "../../repositories/permissionsRepo.js";
import { requireAuth, requirePermission } from "../../http/guards.js";

export async function rolesRoutes(fastify) {
  const repoRoles = rolesRepo(fastify.db);
  const repoPermissions = permissionsRepo(fastify.db);
  const hiddenPermissionKeys = ["*"];
  const ensureAuthenticated = requireAuth;
  const requireRolesRead = requirePermission("roles.read");
  const requireRolesWrite = requirePermission("roles.write");
  const requireRolesDelete = requirePermission("roles.delete");
  const requireUsersRead = requirePermission("users.read");
  const requireUsersWrite = requirePermission("users.write");

  fastify.get("/roles", { preHandler: [ensureAuthenticated, requireRolesRead] }, async (_req, reply) => {
    const items = await repoRoles.list();
    return reply.send({ items });
  });

  fastify.get("/roles/:id", { preHandler: [ensureAuthenticated, requireRolesRead] }, async (req, reply) => {
    const paramsSchema = z.object({ id: z.string().uuid() });
    const parsedParams = paramsSchema.safeParse(req.params);
    if (!parsedParams.success) return reply.code(400).send({ error: "invalid_payload" });

    const role = await repoRoles.findById(parsedParams.data.id);
    if (!role) return reply.code(404).send({ error: "role_not_found" });

    return reply.send({ role });
  });

  fastify.post("/roles", { preHandler: [ensureAuthenticated, requireRolesWrite] }, async (req, reply) => {
    const bodySchema = z.object({
      key: z.string().trim().min(2).max(120),
      name: z.string().trim().min(2).max(200),
      description: z.string().trim().max(255).optional().nullable(),
      inactive: z.boolean().default(false),
    });

    const parsedBody = bodySchema.safeParse(req.body || {});
    if (!parsedBody.success) {
      return reply.code(400).send({ error: "invalid_payload", details: parsedBody.error.flatten() });
    }

    const exists = await repoRoles.findByKey(parsedBody.data.key);
    if (exists) return reply.code(409).send({ error: "role_key_exists" });

    const role = await repoRoles.create(parsedBody.data);
    return reply.code(201).send({ role });
  });

  fastify.put("/roles/:id", { preHandler: [ensureAuthenticated, requireRolesWrite] }, async (req, reply) => {
    const paramsSchema = z.object({ id: z.string().uuid() });
    const bodySchema = z.object({
      key: z.string().trim().min(2).max(120),
      name: z.string().trim().min(2).max(200),
      description: z.string().trim().max(255).optional().nullable(),
      inactive: z.boolean().default(false),
    });

    const parsedParams = paramsSchema.safeParse(req.params);
    const parsedBody = bodySchema.safeParse(req.body || {});
    if (!parsedParams.success || !parsedBody.success) {
      return reply.code(400).send({ error: "invalid_payload", details: parsedBody.error?.flatten?.() });
    }

    const found = await repoRoles.findById(parsedParams.data.id);
    if (!found) return reply.code(404).send({ error: "role_not_found" });

    const exists = await repoRoles.findByKeyExcludingId(parsedBody.data.key, parsedParams.data.id);
    if (exists) return reply.code(409).send({ error: "role_key_exists" });

    const role = await repoRoles.update(parsedParams.data.id, parsedBody.data);
    return reply.send({ role });
  });

  fastify.delete("/roles/:id", { preHandler: [ensureAuthenticated, requireRolesDelete] }, async (req, reply) => {
    const paramsSchema = z.object({ id: z.string().uuid() });
    const parsedParams = paramsSchema.safeParse(req.params);
    if (!parsedParams.success) return reply.code(400).send({ error: "invalid_payload" });

    const found = await repoRoles.findById(parsedParams.data.id);
    if (!found) return reply.code(404).send({ error: "role_not_found" });

    await repoRoles.remove(parsedParams.data.id);
    return reply.code(204).send();
  });

  fastify.get("/roles/:id/permissions", { preHandler: [ensureAuthenticated, requireRolesRead] }, async (req, reply) => {
    const paramsSchema = z.object({ id: z.string().uuid() });
    const parsedParams = paramsSchema.safeParse(req.params);
    if (!parsedParams.success) return reply.code(400).send({ error: "invalid_payload" });

    const found = await repoRoles.findById(parsedParams.data.id);
    if (!found) return reply.code(404).send({ error: "role_not_found" });

    const permissions = await repoPermissions.listByRoleId(parsedParams.data.id);
    return reply.send({ permissions });
  });

  fastify.put("/roles/:id/permissions", { preHandler: [ensureAuthenticated, requireRolesWrite] }, async (req, reply) => {
    const paramsSchema = z.object({ id: z.string().uuid() });
    const bodySchema = z.object({ permissions: z.array(z.string().min(1)).default([]) });

    const parsedParams = paramsSchema.safeParse(req.params);
    const parsedBody = bodySchema.safeParse(req.body || {});
    if (!parsedParams.success || !parsedBody.success) {
      return reply.code(400).send({ error: "invalid_payload", details: parsedBody.error?.flatten?.() });
    }

    const found = await repoRoles.findById(parsedParams.data.id);
    if (!found) return reply.code(404).send({ error: "role_not_found" });

    const catalog = await repoPermissions.listCatalog({ excludeKeys: hiddenPermissionKeys });
    const validSet = new Set(catalog.map((item) => item.key));
    const invalid = parsedBody.data.permissions.filter((key) => !validSet.has(key));
    if (invalid.length) {
      return reply.code(400).send({ error: "invalid_permissions", invalid });
    }

    await repoPermissions.replaceForRole(parsedParams.data.id, parsedBody.data.permissions);
    const permissions = await repoPermissions.listByRoleId(parsedParams.data.id);
    return reply.send({ permissions });
  });

  fastify.get("/users/:id/roles", { preHandler: [ensureAuthenticated, requireUsersRead] }, async (req, reply) => {
    const paramsSchema = z.object({ id: z.string().uuid() });
    const parsedParams = paramsSchema.safeParse(req.params);
    if (!parsedParams.success) return reply.code(400).send({ error: "invalid_payload" });

    const items = await repoRoles.listByUserId(parsedParams.data.id);
    return reply.send({ items });
  });

  fastify.put("/users/:id/roles", { preHandler: [ensureAuthenticated, requireUsersWrite] }, async (req, reply) => {
    const paramsSchema = z.object({ id: z.string().uuid() });
    const bodySchema = z.object({ role_ids: z.array(z.string().uuid()).default([]) });

    const parsedParams = paramsSchema.safeParse(req.params);
    const parsedBody = bodySchema.safeParse(req.body || {});
    if (!parsedParams.success || !parsedBody.success) {
      return reply.code(400).send({ error: "invalid_payload", details: parsedBody.error?.flatten?.() });
    }

    const catalog = await repoRoles.list();
    const validSet = new Set(catalog.map((item) => item.id));
    const invalid = parsedBody.data.role_ids.filter((id) => !validSet.has(id));
    if (invalid.length) return reply.code(400).send({ error: "invalid_role_ids", invalid });

    await repoRoles.replaceRolesForUser(parsedParams.data.id, parsedBody.data.role_ids);
    const items = await repoRoles.listByUserId(parsedParams.data.id);
    return reply.send({ items });
  });
}
