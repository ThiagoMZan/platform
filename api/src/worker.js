import Fastify from "fastify";
import { run } from "graphile-worker";

import { config } from "./config.js";
import { createDbClient } from "./core/dbClient.js";
import { createHttpClient } from "./core/httpClient.js";
import { createI18nService } from "./core/i18nService.js";
import { attachModuleApi, runWithModuleContext } from "./core/moduleApi.js";
import { createKnex } from "./db/knex.js";
import { modulesRepo } from "./repositories/modulesRepo.js";
import { createFilesService } from "./services/filesService.js";
import { createHookBus } from "./services/hookBus.js";
import { createJobQueue } from "./services/jobQueue.js";
import { createModuleScheduleService } from "./services/moduleScheduleService.js";
import { createScheduleRegistry } from "./services/scheduleRegistry.js";

export async function buildWorker() {
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      transport:
        config.NODE_ENV === "development"
          ? { target: "pino-pretty" }
          : undefined,
    },
  });

  const db = createKnex();
  const dbClient = createDbClient({ getBaseDb: () => db });
  const hookBus = createHookBus({ logger: app.log });
  const scheduleRegistry = createScheduleRegistry();
  const httpClient = createHttpClient({ logger: app.log });
  const i18nService = createI18nService({
    getDefaultLocale: () => "pt-BR",
  });
  const filesService = createFilesService({
    db: dbClient,
    config,
    logger: app.log,
  });
  const jobs = createJobQueue({
    connectionString: config.DATABASE_URL,
    logger: app.log,
    autoMigrate: config.JOBS_AUTO_MIGRATE,
  });
  const moduleSchedule = createModuleScheduleService({
    scheduleRegistry,
    getDb: () => db,
    logger: app.log,
  });

  attachModuleApi({
    hookBus,
    logger: app.log,
    httpClient,
    i18nService,
    dbClient,
    scheduleRegistry,
    filesService,
    jobQueue: jobs,
  });

  async function syncHandlers() {
    const activeModules = await modulesRepo(db).listActiveInstalledModules();
    await moduleSchedule.syncActiveModules(activeModules);
  }

  await jobs.start();
  await syncHandlers();

  const refreshTimer = setInterval(() => {
    void syncHandlers().catch((err) => {
      app.log.error({ err }, "failed to refresh worker module handlers");
    });
  }, config.JOBS_MODULE_REFRESH_MS);
  refreshTimer.unref();

  const taskList = {
    [jobs.taskIdentifier]: async (envelope, helpers) => {
      const handlerKey = String(envelope?.handlerKey || "").trim();
      if (!handlerKey) {
        throw new Error("job_handler_key_missing");
      }

      let entry = scheduleRegistry.get(handlerKey);

      if (!entry) {
        await syncHandlers();
        entry = scheduleRegistry.get(handlerKey);
      }

      if (!entry) {
        throw new Error(\`job_handler_not_registered:\${handlerKey}\`);
      }

      const moduleKey = envelope?.moduleKey || entry.moduleKey || null;
      const payload = envelope?.payload ?? {};

      app.log.info(
        {
          handlerKey,
          moduleKey,
          jobId: helpers?.job?.id ?? null,
        },
        "job started",
      );

      const result = await runWithModuleContext(moduleKey, () =>
        entry.handler(payload, {
          handlerKey,
          moduleKey,
          job: helpers?.job ?? null,
          logger: helpers?.logger ?? app.log,
        }),
      );

      app.log.info(
        {
          handlerKey,
          moduleKey,
          jobId: helpers?.job?.id ?? null,
        },
        "job completed",
      );

      return result;
    },
  };

  const runner = await run({
    connectionString: config.DATABASE_URL,
    concurrency: config.JOBS_CONCURRENCY,
    pollInterval: config.JOBS_POLL_INTERVAL_MS,
    noHandleSignals: true,
    taskList,
  });

  async function stop() {
    clearInterval(refreshTimer);
    await runner.stop();
    await jobs.close();
    await db.destroy();
    await app.close();
  }

  return {
    app,
    runner,
    stop,
  };
}

if (process.argv[1] && process.argv[1].endsWith("worker.js")) {
  let worker = null;
  let stopping = false;

  async function shutdown(signal) {
    if (stopping) return;
    stopping = true;

    try {
      worker?.app?.log?.info({ signal }, "worker shutting down");
      await worker?.stop?.();
      process.exit(0);
    } catch (err) {
      console.error(err);
      process.exit(1);
    }
  }

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  buildWorker()
    .then((instance) => {
      worker = instance;
      instance.app.log.info(
        {
          concurrency: config.JOBS_CONCURRENCY,
          pollIntervalMs: config.JOBS_POLL_INTERVAL_MS,
        },
        "worker started",
      );
      return instance.runner.promise;
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
