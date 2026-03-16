import { z } from "zod";
import { formsEngine } from "../../services/formsEngine.js";
import { requireAuth } from "../../http/guards.js";

const jsonObject = z.record(z.any()).default({});
const recordIdSchema = z.union([z.string().min(1), z.number().int().positive()]);

function isSuperAllowed(req) {
  return Array.isArray(req.user?.permissions) && req.user.permissions.includes("*");
}

export async function formsRoutes(fastify) {
  const engine = formsEngine(fastify.moduleDb, { hookBus: fastify.hookBus });
  const ensureAuthenticated = requireAuth;

  fastify.get("/forms/:formKey/render", { preHandler: ensureAuthenticated }, async (req, reply) => {
    const paramsSchema = z.object({ formKey: z.string().min(2).max(120) });
    const querySchema = z.object({ tenant_id: z.string().uuid().optional().nullable() });

    const parsedParams = paramsSchema.safeParse(req.params);
    const parsedQuery = querySchema.safeParse(req.query || {});
    if (!parsedParams.success || !parsedQuery.success) {
      return reply.code(400).send({ error: "invalid_payload" });
    }

    try {
      const rendered = await engine.render({
        formKey: parsedParams.data.formKey,
        userId: req.user.id,
        tenantId: parsedQuery.data.tenant_id || null,
        context: {},
      });
      return reply.send({ form: rendered });
    } catch (err) {
      if (err.code === "form_not_found") return reply.code(404).send({ error: err.code });
      if (err.code === "forbidden") return reply.code(403).send({ error: err.code });
      throw err;
    }
  });

  fastify.get("/forms/:formKey/records", { preHandler: ensureAuthenticated }, async (req, reply) => {
    const paramsSchema = z.object({ formKey: z.string().min(2).max(120) });
    const querySchema = z.object({
      tenant_id: z.string().uuid().optional().nullable(),
      page: z.coerce.number().int().min(1).default(1),
      page_size: z.coerce.number().int().min(1).max(200).default(20),
      search: z.string().trim().max(200).optional().default(""),
      sort_by: z.string().trim().min(1).max(120).optional().default("id"),
      sort_dir: z.enum(["asc", "desc"]).optional().default("desc"),
      limit: z.coerce.number().int().min(1).max(200).default(50),
      offset: z.coerce.number().int().min(0).default(0),
    });

    const parsedParams = paramsSchema.safeParse(req.params);
    const parsedQuery = querySchema.safeParse(req.query || {});
    if (!parsedParams.success || !parsedQuery.success) {
      return reply.code(400).send({ error: "invalid_payload" });
    }

    try {
      const form = await engine.render({
        formKey: parsedParams.data.formKey,
        userId: req.user.id,
        tenantId: parsedQuery.data.tenant_id || null,
      });

      const items = await engine.listRecords({
        entityKey: form.entity_key,
        tenantId: parsedQuery.data.tenant_id || null,
        limit: parsedQuery.data.limit,
        offset: parsedQuery.data.offset,
        page: parsedQuery.data.page,
        pageSize: parsedQuery.data.page_size,
        search: parsedQuery.data.search,
        sortBy: parsedQuery.data.sort_by,
        sortDir: parsedQuery.data.sort_dir,
      });

      if (Array.isArray(items)) {
        return reply.send({ items });
      }

      return reply.send({
        items: items.items || [],
        pagination: {
          page: parsedQuery.data.page,
          page_size: parsedQuery.data.page_size,
          total: Number(items.total || 0),
          total_pages: Math.max(1, Math.ceil(Number(items.total || 0) / parsedQuery.data.page_size)),
        },
      });
    } catch (err) {
      if (err.code === "form_not_found") return reply.code(404).send({ error: err.code });
      if (err.code === "forbidden") return reply.code(403).send({ error: err.code });
      throw err;
    }
  });

  fastify.get("/forms/:formKey/records/:recordId", { preHandler: ensureAuthenticated }, async (req, reply) => {
    const paramsSchema = z.object({
      formKey: z.string().min(2).max(120),
      recordId: recordIdSchema,
    });
    const querySchema = z.object({ tenant_id: z.string().uuid().optional().nullable() });

    const parsedParams = paramsSchema.safeParse(req.params);
    const parsedQuery = querySchema.safeParse(req.query || {});
    if (!parsedParams.success || !parsedQuery.success) {
      return reply.code(400).send({ error: "invalid_payload" });
    }

    try {
      const record = await engine.findRecord({
        formKey: parsedParams.data.formKey,
        userId: req.user.id,
        tenantId: parsedQuery.data.tenant_id || null,
        recordId: parsedParams.data.recordId,
      });

      return reply.send({ record });
    } catch (err) {
      if (err.code === "form_not_found") return reply.code(404).send({ error: err.code });
      if (err.code === "forbidden") return reply.code(403).send({ error: err.code });
      if (err.code === "record_not_found") return reply.code(404).send({ error: err.code });
      throw err;
    }
  });

  fastify.post("/forms/:formKey/save", { preHandler: ensureAuthenticated }, async (req, reply) => {
    const paramsSchema = z.object({ formKey: z.string().min(2).max(120) });
    const bodySchema = z.object({
      tenant_id: z.string().uuid().optional().nullable(),
      record_id: recordIdSchema.optional().nullable(),
      data: jsonObject,
      context: jsonObject.optional(),
    });

    const parsedParams = paramsSchema.safeParse(req.params);
    const parsedBody = bodySchema.safeParse(req.body || {});
    if (!parsedParams.success || !parsedBody.success) {
      return reply.code(400).send({ error: "invalid_payload", details: parsedBody.error?.flatten?.() });
    }

    try {
      const record = await engine.save({
        formKey: parsedParams.data.formKey,
        userId: req.user.id,
        tenantId: parsedBody.data.tenant_id || null,
        recordId: parsedBody.data.record_id || null,
        data: parsedBody.data.data,
        context: parsedBody.data.context || {},
      });
      return reply.send({ record });
    } catch (err) {
      if (err.code === "form_not_found") return reply.code(404).send({ error: err.code });
      if (err.code === "forbidden") return reply.code(403).send({ error: err.code });
      if (err.code === "required_fields_missing") return reply.code(400).send({ error: err.code });
      if (err.code === "invalid_payload") return reply.code(400).send({ error: err.code });
      if (err.code === "record_not_found") return reply.code(404).send({ error: err.code });
      if (err.code === "document_already_exists") return reply.code(409).send({ error: err.code });
      if (err.code === "email_already_exists") return reply.code(409).send({ error: err.code });
      if (err.code === "role_key_exists") return reply.code(409).send({ error: err.code });
      if (err.code === "audience_type_not_found") return reply.code(404).send({ error: err.code });
      throw err;
    }
  });

  fastify.post("/forms/:formKey/delete", { preHandler: ensureAuthenticated }, async (req, reply) => {
    const paramsSchema = z.object({ formKey: z.string().min(2).max(120) });
    const bodySchema = z.object({
      tenant_id: z.string().uuid().optional().nullable(),
      record_id: recordIdSchema,
      context: jsonObject.optional(),
    });

    const parsedParams = paramsSchema.safeParse(req.params);
    const parsedBody = bodySchema.safeParse(req.body || {});
    if (!parsedParams.success || !parsedBody.success) {
      return reply.code(400).send({ error: "invalid_payload", details: parsedBody.error?.flatten?.() });
    }

    try {
      const record = await engine.remove({
        formKey: parsedParams.data.formKey,
        userId: req.user.id,
        tenantId: parsedBody.data.tenant_id || null,
        recordId: parsedBody.data.record_id,
        context: parsedBody.data.context || {},
      });
      return reply.send({ record });
    } catch (err) {
      if (err.code === "form_not_found") return reply.code(404).send({ error: err.code });
      if (err.code === "forbidden") return reply.code(403).send({ error: err.code });
      if (err.code === "record_not_found") return reply.code(404).send({ error: err.code });
      throw err;
    }
  });

  fastify.post("/forms/:formKey/action/:actionKey", { preHandler: ensureAuthenticated }, async (req, reply) => {
    const paramsSchema = z.object({
      formKey: z.string().min(2).max(120),
      actionKey: z.string().min(2).max(120),
    });
    const bodySchema = z.object({
      tenant_id: z.string().uuid().optional().nullable(),
      payload: jsonObject.optional(),
      context: jsonObject.optional(),
    });

    const parsedParams = paramsSchema.safeParse(req.params);
    const parsedBody = bodySchema.safeParse(req.body || {});
    if (!parsedParams.success || !parsedBody.success) {
      return reply.code(400).send({ error: "invalid_payload", details: parsedBody.error?.flatten?.() });
    }

    try {
      const result = await engine.action({
        formKey: parsedParams.data.formKey,
        actionKey: parsedParams.data.actionKey,
        userId: req.user.id,
        tenantId: parsedBody.data.tenant_id || null,
        payload: parsedBody.data.payload || {},
        context: parsedBody.data.context || {},
      });
      return reply.send({ result });
    } catch (err) {
      if (err.code === "form_not_found") return reply.code(404).send({ error: err.code });
      if (err.code === "forbidden") return reply.code(403).send({ error: err.code });
      throw err;
    }
  });

  fastify.post("/forms/extensions", { preHandler: ensureAuthenticated }, async (req, reply) => {
    const bodySchema = z.object({
      tenant_id: z.string().uuid().optional().nullable(),
      module_key: z.string().trim().min(2).max(120),
      form_key: z.string().trim().min(2).max(120),
      priority: z.number().int().min(0).default(100),
      patches: z.array(z.any()).default([]),
    });

    const parsedBody = bodySchema.safeParse(req.body || {});
    if (!parsedBody.success) {
      return reply.code(400).send({ error: "invalid_payload", details: parsedBody.error.flatten() });
    }

    if (!isSuperAllowed(req)) return reply.code(403).send({ error: "forbidden" });

    const created = await engine.createExtension({
      ...parsedBody.data,
      created_by: req.user.id,
    });
    return reply.code(201).send({ extension: created });
  });

  fastify.put("/forms/:formKey/definition", { preHandler: ensureAuthenticated }, async (req, reply) => {
    const paramsSchema = z.object({ formKey: z.string().trim().min(2).max(120) });
    const bodySchema = z.object({
      name: z.string().trim().min(2).max(200),
      entity_key: z.string().trim().min(2).max(120),
      schema: z.record(z.any()),
      permission_read: z.string().trim().min(2).max(120),
      permission_write: z.string().trim().min(2).max(120),
      permission_delete: z.string().trim().min(2).max(120),
    });

    const parsedParams = paramsSchema.safeParse(req.params || {});
    const parsedBody = bodySchema.safeParse(req.body || {});
    if (!parsedParams.success || !parsedBody.success) {
      return reply.code(400).send({ error: "invalid_payload", details: parsedBody.error?.flatten?.() });
    }

    if (!isSuperAllowed(req)) return reply.code(403).send({ error: "forbidden" });

    const updated = await engine.updateFormDefinition(parsedParams.data.formKey, parsedBody.data, req.user.id);
    if (!updated) return reply.code(404).send({ error: "form_not_found" });

    return reply.send({ form: updated });
  });

  fastify.get("/forms/:formKey/versions", { preHandler: ensureAuthenticated }, async (req, reply) => {
    const paramsSchema = z.object({ formKey: z.string().trim().min(2).max(120) });
    const querySchema = z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) });

    const parsedParams = paramsSchema.safeParse(req.params || {});
    const parsedQuery = querySchema.safeParse(req.query || {});
    if (!parsedParams.success || !parsedQuery.success) {
      return reply.code(400).send({ error: "invalid_payload" });
    }

    if (!isSuperAllowed(req)) return reply.code(403).send({ error: "forbidden" });

    const items = await engine.listFormVersions(parsedParams.data.formKey, parsedQuery.data.limit);
    return reply.send({ items });
  });

  fastify.post("/forms/:formKey/versions/:version/rollback", { preHandler: ensureAuthenticated }, async (req, reply) => {
    const paramsSchema = z.object({
      formKey: z.string().trim().min(2).max(120),
      version: z.coerce.number().int().min(1),
    });

    const parsedParams = paramsSchema.safeParse(req.params || {});
    if (!parsedParams.success) return reply.code(400).send({ error: "invalid_payload" });

    if (!isSuperAllowed(req)) return reply.code(403).send({ error: "forbidden" });

    const restored = await engine.rollbackFormVersion(
      parsedParams.data.formKey,
      parsedParams.data.version,
      req.user.id
    );

    if (!restored) return reply.code(404).send({ error: "form_version_not_found" });

    return reply.send({ form: restored });
  });

  fastify.get("/forms/:formKey/extensions", { preHandler: ensureAuthenticated }, async (req, reply) => {
    const paramsSchema = z.object({ formKey: z.string().trim().min(2).max(120) });

    const parsedParams = paramsSchema.safeParse(req.params || {});
    if (!parsedParams.success) {
      return reply.code(400).send({ error: "invalid_payload" });
    }

    if (!isSuperAllowed(req)) return reply.code(403).send({ error: "forbidden" });

    const items = await engine.listExtensionsByFormKey(parsedParams.data.formKey);
    return reply.send({ items });
  });

  fastify.put("/forms/extensions/:id", { preHandler: ensureAuthenticated }, async (req, reply) => {
    const paramsSchema = z.object({ id: z.string().uuid() });
    const bodySchema = z.object({
      priority: z.number().int().min(0),
      enabled: z.boolean(),
      patches: z.array(z.any()),
    });

    const parsedParams = paramsSchema.safeParse(req.params || {});
    const parsedBody = bodySchema.safeParse(req.body || {});
    if (!parsedParams.success || !parsedBody.success) {
      return reply.code(400).send({ error: "invalid_payload", details: parsedBody.error?.flatten?.() });
    }

    if (!isSuperAllowed(req)) return reply.code(403).send({ error: "forbidden" });

    const updated = await engine.updateExtensionById(parsedParams.data.id, parsedBody.data, req.user.id);
    if (!updated) return reply.code(404).send({ error: "extension_not_found" });

    return reply.send({ extension: updated });
  });

  fastify.get("/forms/extensions/:id/versions", { preHandler: ensureAuthenticated }, async (req, reply) => {
    const paramsSchema = z.object({ id: z.string().uuid() });
    const querySchema = z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) });

    const parsedParams = paramsSchema.safeParse(req.params || {});
    const parsedQuery = querySchema.safeParse(req.query || {});
    if (!parsedParams.success || !parsedQuery.success) {
      return reply.code(400).send({ error: "invalid_payload" });
    }

    if (!isSuperAllowed(req)) return reply.code(403).send({ error: "forbidden" });

    const extension = await engine.findExtensionById(parsedParams.data.id);
    if (!extension) return reply.code(404).send({ error: "extension_not_found" });

    const items = await engine.listExtensionVersions(parsedParams.data.id, parsedQuery.data.limit);
    return reply.send({ items });
  });

  fastify.post(
    "/forms/extensions/:id/versions/:version/rollback",
    { preHandler: ensureAuthenticated },
    async (req, reply) => {
      const paramsSchema = z.object({
        id: z.string().uuid(),
        version: z.coerce.number().int().min(1),
      });

      const parsedParams = paramsSchema.safeParse(req.params || {});
      if (!parsedParams.success) return reply.code(400).send({ error: "invalid_payload" });

      if (!isSuperAllowed(req)) return reply.code(403).send({ error: "forbidden" });

      const restored = await engine.rollbackExtensionVersion(
        parsedParams.data.id,
        parsedParams.data.version,
        req.user.id
      );

      if (!restored) return reply.code(404).send({ error: "extension_version_not_found" });

      return reply.send({ extension: restored });
    }
  );
}
