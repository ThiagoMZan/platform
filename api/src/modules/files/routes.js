import { z } from "zod";
import { requireAuth } from "../../http/guards.js";

const ensureAuthenticated = requireAuth;

function parseUploadHeaders(headers = {}) {
  const schema = z.object({
    "x-file-name": z.string().trim().min(1).max(255),
    "x-file-content-type": z.string().trim().min(1).max(255).optional(),
  });

  return schema.safeParse({
    "x-file-name": headers["x-file-name"],
    "x-file-content-type": headers["x-file-content-type"],
  });
}

export async function filesRoutes(fastify) {
  if (!fastify.hasContentTypeParser("application/octet-stream")) {
    fastify.addContentTypeParser("application/octet-stream", { parseAs: "buffer" }, (_req, body, done) => {
      done(null, body);
    });
  }

  fastify.post("/api/files/upload", { preHandler: [ensureAuthenticated] }, async (req, reply) => {
    const parsedHeaders = parseUploadHeaders(req.headers || {});
    if (!parsedHeaders.success) {
      return reply.code(400).send({ error: "invalid_payload" });
    }

    if (!Buffer.isBuffer(req.body)) {
      return reply.code(400).send({ error: "invalid_payload" });
    }

    const file = await fastify.filesService.upload({
      fileName: parsedHeaders.data["x-file-name"],
      contentType: parsedHeaders.data["x-file-content-type"] || "application/octet-stream",
      buffer: req.body,
      uploadedBy: req.user?.id || null,
    });

    return reply.code(201).send({ file });
  });

  fastify.get("/api/files/:id/metadata", { preHandler: [ensureAuthenticated] }, async (req, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(req.params || {});
    if (!params.success) return reply.code(400).send({ error: "invalid_payload" });

    try {
      const file = await fastify.filesService.metadata(params.data.id);
      return reply.send({ file });
    } catch (err) {
      if (err?.message === "file_not_found") {
        return reply.code(404).send({ error: "file_not_found" });
      }
      throw err;
    }
  });

  fastify.get("/api/files/:id/download", { preHandler: [ensureAuthenticated] }, async (req, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(req.params || {});
    if (!params.success) return reply.code(400).send({ error: "invalid_payload" });

    try {
      const { file, stream } = await fastify.filesService.download(params.data.id, { responseType: "stream" });
      reply.header("content-type", file.content_type || "application/octet-stream");
      reply.header("content-length", String(file.size || 0));
      reply.header("content-disposition", `attachment; filename="${encodeURIComponent(file.file_name)}"`);
      return reply.send(stream);
    } catch (err) {
      if (err?.message === "file_not_found" || err?.message === "file_blob_not_found") {
        return reply.code(404).send({ error: err.message });
      }
      throw err;
    }
  });
}
