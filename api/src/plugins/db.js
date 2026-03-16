import fp from "fastify-plugin";
import { createKnex } from "../db/knex.js";
import { getRequestContext, patchRequestContext, runWithRequestContext } from "../services/requestContext.js";

export default fp(async function dbPlugin(fastify) {
  const db = createKnex();
  fastify.decorate("db", db);

  async function setAuditContext(trx, context) {
    const userId = context?.userId ? String(context.userId) : "";
    const sessionId = context?.sessionId ? String(context.sessionId) : "";
    const apiClientId = context?.apiClientId ? String(context.apiClientId) : "";

    await trx.raw(
      "select set_config('app.user_id', ?, true), set_config('app.session_id', ?, true), set_config('app.api_client_id', ?, true)",
      [userId, sessionId, apiClientId],
    );
  }

  fastify.addHook("onRequest", (req, _reply, done) => {
    runWithRequestContext(
      {
        requestId: req.id,
        userId: null,
        sessionId: null,
        apiClientId: null,
        auditTrx: null,
        auditCompleted: false,
        failed: false,
      },
      async () => {
        try {
          const context = getRequestContext();
          const trx = await db.transaction();
          context.auditTrx = trx;
          await setAuditContext(trx, context);
          done();
        } catch (err) {
          done(err);
        }
      },
    );
  });

  fastify.addHook("onError", async () => {
    patchRequestContext({ failed: true });
  });

  fastify.addHook("onSend", async (_req, reply, payload) => {
    const context = getRequestContext();
    if (!context?.auditTrx || context.auditCompleted) {
      return payload;
    }

    const trx = context.auditTrx;
    context.auditCompleted = true;

    if (context.failed || reply.statusCode >= 400) {
      await trx.rollback();
      return payload;
    }

    await trx.commit();
    return payload;
  });

  fastify.addHook("onClose", async () => {
    await db.destroy();
  });
});
