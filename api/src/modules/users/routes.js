import argon2 from "argon2";
import { z } from "zod";
import { usersRepo } from "../../repositories/usersRepo.js";
import { passwordHistoryRepo } from "../../repositories/passwordHistoryRepo.js";
import { permissionsRepo } from "../../repositories/permissionsRepo.js";
import { requireAuth, requirePermission } from "../../http/guards.js";

export async function usersRoutes(fastify) {
  const repo = usersRepo(fastify.db);
  const repoPermissions = permissionsRepo(fastify.db);
  const hiddenPermissionPrefixes = ["cases."];
  const hiddenPermissionKeys = ["*"];
  const ensureAuthenticated = requireAuth;
  const requireUsersRead = requirePermission("users.read");
  const requireUsersWrite = requirePermission("users.write");
  const requireUsersDelete = requirePermission("users.delete");

  fastify.get("/users", { preHandler: [ensureAuthenticated, requireUsersRead] }, async (req, reply) => {
    const querySchema = z.object({
      page: z.coerce.number().int().min(1).default(1),
      page_size: z.coerce.number().int().min(1).max(200).default(20),
      search: z.string().trim().max(200).optional().default(""),
      sort_by: z.enum(["name", "email", "inactive", "created_at"]).optional().default("created_at"),
      sort_dir: z.enum(["asc", "desc"]).optional().default("desc"),
    });

    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_query", details: parsed.error.flatten() });
    }

    const { page, page_size, search, sort_by, sort_dir } = parsed.data;
    const { items, total } = await repo.list({
      page,
      pageSize: page_size,
      search,
      sortBy: sort_by,
      sortDir: sort_dir,
    });

    return reply.send({
      items,
      pagination: {
        page,
        page_size,
        total,
        total_pages: Math.max(1, Math.ceil(total / page_size)),
      },
    });
  });

  fastify.get("/users/:id", { preHandler: [ensureAuthenticated, requireUsersRead] }, async (req, reply) => {
    const paramsSchema = z.object({ id: z.string().uuid() });
    const parsed = paramsSchema.safeParse(req.params);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_payload" });

    const user = await repo.findById(parsed.data.id);
    if (!user) return reply.code(404).send({ error: "user_not_found" });

    return reply.send({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        inactive: user.inactive,
        created_at: user.created_at,
        updated_at: user.updated_at,
      },
    });
  });

  fastify.post("/users", { preHandler: [ensureAuthenticated, requireUsersWrite] }, async (req, reply) => {
    const bodySchema = z.object({
      email: z.string().email(),
      name: z.string().trim().min(2).max(200),
      password: z.string().min(6).max(120),
      inactive: z.boolean().default(false),
    });

    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_payload", details: parsed.error.flatten() });
    }

    const existing = await repo.findByEmail(parsed.data.email);
    if (existing) return reply.code(409).send({ error: "email_already_exists" });

    const password_hash = await argon2.hash(parsed.data.password);
    let user = null;
    await fastify.db.transaction(async (trx) => {
      const trxUsersRepo = usersRepo(trx);
      const trxPasswordHistoryRepo = passwordHistoryRepo(trx);

      user = await trxUsersRepo.create({
        email: parsed.data.email,
        name: parsed.data.name,
        password_hash,
        inactive: parsed.data.inactive,
      });
      await trxPasswordHistoryRepo.create({
        user_id: user.id,
        password_hash,
      });
    });

    return reply.code(201).send({ user });
  });

  fastify.put("/users/:id", { preHandler: [ensureAuthenticated, requireUsersWrite] }, async (req, reply) => {
    const paramsSchema = z.object({ id: z.string().uuid() });
    const bodySchema = z.object({
      email: z.string().email(),
      name: z.string().trim().min(2).max(200),
      password: z.string().min(6).max(120).optional(),
      inactive: z.boolean().default(false),
    });

    const parsedParams = paramsSchema.safeParse(req.params);
    const parsedBody = bodySchema.safeParse(req.body);
    if (!parsedParams.success || !parsedBody.success) {
      return reply.code(400).send({ error: "invalid_payload", details: parsedBody.error?.flatten?.() });
    }

    const found = await repo.findById(parsedParams.data.id);
    if (!found) return reply.code(404).send({ error: "user_not_found" });

    const existing = await repo.findByEmailExcludingId(parsedBody.data.email, parsedParams.data.id);
    if (existing) return reply.code(409).send({ error: "email_already_exists" });

    const password_hash = parsedBody.data.password ? await argon2.hash(parsedBody.data.password) : undefined;

    let user = null;
    await fastify.db.transaction(async (trx) => {
      const trxUsersRepo = usersRepo(trx);
      const trxPasswordHistoryRepo = passwordHistoryRepo(trx);

      user = await trxUsersRepo.update(parsedParams.data.id, {
        email: parsedBody.data.email,
        name: parsedBody.data.name,
        inactive: parsedBody.data.inactive,
        password_hash,
      });

      if (password_hash) {
        await trxPasswordHistoryRepo.create({
          user_id: parsedParams.data.id,
          password_hash,
        });
      }
    });

    return reply.send({ user });
  });

  fastify.delete("/users/:id", { preHandler: [ensureAuthenticated, requireUsersDelete] }, async (req, reply) => {
    const paramsSchema = z.object({ id: z.string().uuid() });
    const parsed = paramsSchema.safeParse(req.params);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_payload" });

    const found = await repo.findById(parsed.data.id);
    if (!found) return reply.code(404).send({ error: "user_not_found" });

    await repo.remove(parsed.data.id);
    return reply.code(204).send();
  });

  // Catalogo central de permissoes; usado na tela de roles.
  fastify.get("/permissions", { preHandler: [ensureAuthenticated, requireUsersRead] }, async (_req, reply) => {
    const items = await repoPermissions.listCatalog({
      excludePrefixes: hiddenPermissionPrefixes,
      excludeKeys: hiddenPermissionKeys,
    });
    return reply.send({ items });
  });

  // Diagnostico: permissao efetiva (roles + legado direto, enquanto houver transicao).
  fastify.get("/users/:id/effective-permissions", { preHandler: [ensureAuthenticated, requireUsersRead] }, async (req, reply) => {
    const paramsSchema = z.object({ id: z.string().uuid() });
    const parsedParams = paramsSchema.safeParse(req.params);
    if (!parsedParams.success) return reply.code(400).send({ error: "invalid_payload" });

    const found = await repo.findById(parsedParams.data.id);
    if (!found) return reply.code(404).send({ error: "user_not_found" });

    const permissions = await repoPermissions.listEffectiveByUserId(parsedParams.data.id);
    return reply.send({ permissions });
  });
}
