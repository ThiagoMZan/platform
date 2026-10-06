import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { config } from "./config.js";
import { createDbClient } from "./core/dbClient.js";
import { createI18nService, loadBaseLabelsFromDir } from "./core/i18nService.js";
import { attachModuleApi } from "./core/moduleApi.js";
import { createHttpClient } from "./core/httpClient.js";
import { modulesRepo } from "./repositories/modulesRepo.js";
import { settingsRepo } from "./repositories/settingsRepo.js";
import { authService } from "./services/authService.js";

import dbPlugin from "./plugins/db.js";
import cachePlugin from "./plugins/cache.js";
import authPlugin from "./plugins/auth.js";
import { authRoutes } from "./modules/auth/routes.js";
import { modulesRoutes } from "./modules/modules/routes.js";
import { formsRoutes } from "./modules/forms/routes.js";
import { loadLocalModuleBackendRoutes } from "./services/modulesBackendService.js";
import { usersRoutes } from "./modules/users/routes.js";
import { rolesRoutes } from "./modules/roles/routes.js";
import { settingsRoutes } from "./modules/settings/routes.js";
import { createHookBus } from "./services/hookBus.js";
import { createModuleHooksService } from "./services/moduleHooksService.js";
import { createModuleI18nService } from "./services/moduleI18nService.js";
import { createModuleScheduleService } from "./services/moduleScheduleService.js";
import { createScheduleRegistry } from "./services/scheduleRegistry.js";
import { registerCoreHooks } from "./services/hookService.js";
import { createFilesService } from "./services/filesService.js";
import { createJobQueue } from "./services/jobQueue.js";
import { filesRoutes } from "./modules/files/routes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const coreLabelsDir = path.resolve(__dirname, "..", "labels");

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      transport: config.NODE_ENV === "development" ? { target: "pino-pretty" } : undefined,
    },
  });

  app.decorate("config", config);
  app.decorate("authService", authService(config));
  const hookBus = createHookBus({ logger: app.log });
  const scheduleRegistry = createScheduleRegistry();
  const dbClient = createDbClient({ getBaseDb: () => app.db });
  const httpClient = createHttpClient({ logger: app.log });
  const i18nService = createI18nService({
    getDefaultLocale: () => app.currentLocale || "pt-BR",
  });
  const moduleHooks = createModuleHooksService({ hookBus, logger: app.log });
  const moduleI18n = createModuleI18nService({ i18nService });
  const moduleSchedule = createModuleScheduleService({ scheduleRegistry, getDb: () => app.db, logger: app.log });
  const filesService = createFilesService({ db: dbClient, config, logger: app.log });
  const jobs = createJobQueue({
    connectionString: config.DATABASE_URL,
    logger: app.log,
    autoMigrate: config.JOBS_AUTO_MIGRATE,
  });
  app.decorate("hookBus", hookBus);
  app.decorate("scheduleRegistry", scheduleRegistry);
  app.decorate("moduleDb", dbClient);
  app.decorate("moduleHooks", moduleHooks);
  app.decorate("i18nService", i18nService);
  app.decorate("moduleI18n", moduleI18n);
  app.decorate("moduleSchedule", moduleSchedule);
  app.decorate("filesService", filesService);
  app.decorate("jobs", jobs);
  app.decorate("currentLocale", "pt-BR");
  attachModuleApi({ hookBus, logger: app.log, httpClient, i18nService, dbClient, scheduleRegistry, filesService, jobQueue: jobs });
  registerCoreHooks(hookBus);

  app.register(cookie);
  app.register(helmet);
  app.register(cors, {
    origin: config.CORS_ORIGIN,
    credentials: true,
  });

  app.register(rateLimit, {
    max: config.RATE_LIMIT_MAX,
    timeWindow: config.RATE_LIMIT_TIME_WINDOW_MS,
    hook: "onRequest",
    keyGenerator: (req) => req.ip,
    allowList: [],
  });

  app.addHook("onRequest", async (req, reply) => {
    reply.header("x-request-id", req.id);
  });

  app.register(dbPlugin);
  app.register(cachePlugin);
  app.register(authPlugin);

  app.addHook("onReady", async () => {
    const baseLabels = await loadBaseLabelsFromDir(coreLabelsDir);
    i18nService.setBaseMessages(baseLabels);

    const repoSettings = settingsRepo(app.db);
    const logLevel = await repoSettings.getAppLogLevel(config.LOG_LEVEL);
    const locale = await repoSettings.getAppLocale();
    app.log.level = logLevel;
    app.currentLocale = locale || "pt-BR";

    const repoModules = modulesRepo(app.db);
    const activeModules = await repoModules.listActiveInstalledModules();
    await moduleHooks.syncActiveModules(activeModules);
    await moduleI18n.syncActiveModules(activeModules);
    await moduleSchedule.syncActiveModules(activeModules);
    await jobs.start();
  });

  app.addHook("onClose", async () => {
    await jobs.close();
  });

  app.get("/health", async () => ({ ok: true }));

  app.register(authRoutes);
  app.register(modulesRoutes);
  app.register(formsRoutes);
  app.register(usersRoutes);
  app.register(rolesRoutes);
  app.register(settingsRoutes);
  app.register(filesRoutes);

  const moduleBackendRoutes = await loadLocalModuleBackendRoutes();
  for (const entry of moduleBackendRoutes) {
    app.register(entry.plugin, { prefix: entry.prefix });
  }

  return app;
}

if (process.argv[1] && process.argv[1].endsWith("server.js")) {
  let appInstance = null;
  buildApp()
    .then((app) => {
      appInstance = app;
      return app.listen({ port: config.PORT, host: "0.0.0.0" });
    })
    .then((addr) => appInstance.log.info({ addr }, "API listening"))
    .catch((err) => {
      if (appInstance) {
        appInstance.log.error(err);
      } else {
        console.error(err);
      }
      process.exit(1);
    });
}
