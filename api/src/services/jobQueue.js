import { makeWorkerUtils } from "graphile-worker";

const GRAPHILE_TASK = "platform_job";

function normalizeOptions(options = {}) {
  return {
    queueName: options.queueName || undefined,
    runAt: options.runAt ? new Date(options.runAt) : undefined,
    maxAttempts: options.maxAttempts ?? undefined,
    jobKey: options.jobKey || undefined,
    jobKeyMode: options.jobKeyMode || undefined,
    priority: options.priority ?? undefined,
    flags: Array.isArray(options.flags) ? options.flags : undefined,
  };
}

function buildEnvelope(handlerKey, payload, options = {}) {
  return {
    handlerKey,
    payload: payload ?? {},
    moduleKey: options.moduleKey || null,
  };
}

export function createJobQueue({
  connectionString,
  logger = console,
  autoMigrate = true,
} = {}) {
  if (!connectionString) {
    throw new Error("job_queue_connection_string_required");
  }

  let workerUtils = null;
  let starting = null;

  async function start() {
    if (workerUtils) return workerUtils;
    if (starting) return starting;

    starting = (async () => {
      const utils = await makeWorkerUtils({ connectionString });
      if (autoMigrate) {
        await utils.migrate();
      }
      workerUtils = utils;
      logger?.info?.("job queue ready");
      return utils;
    })();

    try {
      return await starting;
    } finally {
      starting = null;
    }
  }

  async function add(handlerKey, payload = {}, options = {}) {
    if (!handlerKey || typeof handlerKey !== "string") {
      throw new Error("job_handler_key_invalid");
    }

    const utils = await start();
    return utils.addJob(
      GRAPHILE_TASK,
      buildEnvelope(handlerKey, payload, options),
      normalizeOptions(options),
    );
  }

  async function addWithDb(db, handlerKey, payload = {}, options = {}) {
    if (!db || typeof db.raw !== "function") {
      throw new Error("job_queue_db_required");
    }
    if (!handlerKey || typeof handlerKey !== "string") {
      throw new Error("job_handler_key_invalid");
    }

    const envelope = buildEnvelope(handlerKey, payload, options);
    const runAt = options.runAt ? new Date(options.runAt).toISOString() : null;
    const maxAttempts = options.maxAttempts ?? 25;
    const priority = options.priority ?? 0;

    const result = await db.raw(
      \`
        SELECT graphile_worker.add_job(
          ?,
          payload := ?::json,
          queue_name := ?,
          run_at := COALESCE(?::timestamptz, NOW()),
          max_attempts := ?::smallint,
          job_key := ?,
          priority := ?::smallint
        ) AS job
      \`,
      [
        GRAPHILE_TASK,
        JSON.stringify(envelope),
        options.queueName || null,
        runAt,
        maxAttempts,
        options.jobKey || null,
        priority,
      ],
    );

    return result?.rows?.[0]?.job ?? null;
  }

  async function close() {
    if (!workerUtils) return;
    const utils = workerUtils;
    workerUtils = null;
    await utils.release();
  }

  return {
    start,
    add,
    addWithDb,
    close,
    taskIdentifier: GRAPHILE_TASK,
  };
}
