import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { modulesRepo } from "../../repositories/modulesRepo.js";
import { permissionsRepo } from "../../repositories/permissionsRepo.js";
import { buildModulesRuntime, getDefaultModuleBaseDirs, scanLocalModules } from "../../services/modulesRuntimeService.js";
import { requireAuth } from "../../http/guards.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..", "..", "..", "..");

export async function modulesRoutes(fastify) {
  const repoModules = modulesRepo(fastify.db);
  const repoPermissions = permissionsRepo(fastify.db);
  const platformManifestPath = path.resolve(repoRoot, "platform-projects", "local-dev", "platform.json");
  const apiPackageJsonPath = path.resolve(repoRoot, "platform-core", "api", "package.json");
  const webPackageJsonPath = path.resolve(repoRoot, "platform-core", "web", "package.json");
  const ensureAuthenticated = requireAuth;

  function readPackageDependencies(packageJsonPath) {
    if (!fs.existsSync(packageJsonPath)) {
      return {};
    }

    const raw = fs.readFileSync(packageJsonPath, "utf8");
    const manifest = JSON.parse(raw);
    return {
      ...(manifest.dependencies || {}),
      ...(manifest.devDependencies || {}),
    };
  }

  function findMissingDeclaredDependencies(required = {}, available = {}) {
    return Object.entries(required || {})
      .filter(([name]) => !available[name])
      .map(([name, version]) => ({
        name,
        version,
      }));
  }

  async function validateModuleActivationDependencies({ moduleKey, version }) {
    const catalog = await repoModules.listCatalog();
    const entry = catalog.find((item) => item.module_key === moduleKey && item.version === version);
    if (!entry) return null;

    const manifest = typeof entry.manifest === "string" ? JSON.parse(entry.manifest) : entry.manifest || {};
    const apiDependencies = readPackageDependencies(apiPackageJsonPath);
    const webDependencies = readPackageDependencies(webPackageJsonPath);

    const missingApiDependencies = findMissingDeclaredDependencies(manifest.apiDependencies, apiDependencies);
    const missingWebDependencies = findMissingDeclaredDependencies(manifest.webDependencies, webDependencies);

    if (!missingApiDependencies.length && !missingWebDependencies.length) {
      return null;
    }

    return {
      module_key: moduleKey,
      version,
      missing_api_dependencies: missingApiDependencies,
      missing_web_dependencies: missingWebDependencies,
    };
  }

  async function syncModulePermissions(scannedModules) {
    for (const entry of scannedModules) {
      const permissions = entry.manifest?.runtime?.permissions || [];
      for (const permission of permissions) {
        const key = String(permission?.key || "").trim();
        if (!key) continue;

        const exists = await repoPermissions.findByKey(key);
        if (exists) continue;

        await repoPermissions.create({
          key,
          description: permission?.description || permission?.label || null,
        });
      }
    }
  }

  fastify.post("/modules/sync-local", { preHandler: ensureAuthenticated }, async (req, reply) => {
    const bodySchema = z.object({ base_dir: z.string().trim().min(1).optional() });
    const parsedBody = bodySchema.safeParse(req.body || {});
    if (!parsedBody.success) {
      return reply.code(400).send({ error: "invalid_payload", details: parsedBody.error.flatten() });
    }

    const baseDir = parsedBody.data.base_dir || null;
    const scanned = baseDir ? await scanLocalModules(baseDir) : await scanLocalModules(getDefaultModuleBaseDirs());
    const items = [];
    await syncModulePermissions(scanned);

    for (const entry of scanned) {
      const saved = await repoModules.upsertModuleVersion({
        key: entry.manifest.id,
        name: entry.manifest.name,
        version: entry.manifest.version,
        baseOrder: entry.manifest.order,
        manifest: entry.manifest,
        installPath: entry.installPath,
      });
      items.push(saved);
    }

    const activeModules = await repoModules.listActiveInstalledModules();
    await fastify.moduleHooks.syncActiveModules(activeModules);
    await fastify.moduleI18n.syncActiveModules(activeModules);
    await fastify.moduleSchedule.syncActiveModules(activeModules);

    return reply.send({ synced: items.length, items });
  });

  fastify.get("/modules/catalog", { preHandler: ensureAuthenticated }, async (_req, reply) => {
    const items = await repoModules.listCatalog();
    return reply.send({ items });
  });

  fastify.get("/modules/installed", { preHandler: ensureAuthenticated }, async (_req, reply) => {
    const items = await repoModules.listInstalled();
    return reply.send({ items });
  });

  fastify.post("/modules/activate", { preHandler: ensureAuthenticated }, async (req, reply) => {
    const bodySchema = z.object({
      module_key: z.string().trim().min(2).max(120),
      version: z.string().trim().min(1).max(40),
      order_override: z.number().int().min(0).optional().nullable(),
    });

    const parsedBody = bodySchema.safeParse(req.body);
    if (!parsedBody.success) {
      return reply.code(400).send({ error: "invalid_payload", details: parsedBody.error.flatten() });
    }

    const dependencyValidation = await validateModuleActivationDependencies({
      moduleKey: parsedBody.data.module_key,
      version: parsedBody.data.version,
    });
    if (dependencyValidation) {
      return reply.code(409).send({
        error: "module_dependencies_missing",
        details: dependencyValidation,
      });
    }

    const installed = await repoModules.activateInstalled({
      moduleKey: parsedBody.data.module_key,
      version: parsedBody.data.version,
      orderOverride: parsedBody.data.order_override,
    });
    if (!installed) return reply.code(404).send({ error: "module_version_not_found" });

    const activeModules = await repoModules.listActiveInstalledModules();
    await fastify.moduleHooks.syncActiveModules(activeModules);
    await fastify.moduleI18n.syncActiveModules(activeModules);
    await fastify.moduleSchedule.syncActiveModules(activeModules);

    return reply.send({ installed_module: installed });
  });

  fastify.post("/modules/deactivate", { preHandler: ensureAuthenticated }, async (req, reply) => {
    const bodySchema = z.object({
      module_key: z.string().trim().min(2).max(120),
    });

    const parsedBody = bodySchema.safeParse(req.body);
    if (!parsedBody.success) {
      return reply.code(400).send({ error: "invalid_payload", details: parsedBody.error.flatten() });
    }

    const installed = await repoModules.deactivateInstalled({
      moduleKey: parsedBody.data.module_key,
    });
    if (!installed) return reply.code(404).send({ error: "installed_module_not_found" });

    const activeModules = await repoModules.listActiveInstalledModules();
    await fastify.moduleHooks.syncActiveModules(activeModules);
    await fastify.moduleI18n.syncActiveModules(activeModules);
    await fastify.moduleSchedule.syncActiveModules(activeModules);

    return reply.send({ installed_module: installed });
  });

  fastify.post("/modules/uninstall", { preHandler: ensureAuthenticated }, async (req, reply) => {
    const bodySchema = z.object({
      module_key: z.string().trim().min(2).max(120),
      version: z.string().trim().min(1).max(40),
    });

    const parsedBody = bodySchema.safeParse(req.body);
    if (!parsedBody.success) {
      return reply.code(400).send({ error: "invalid_payload", details: parsedBody.error.flatten() });
    }

    const result = await repoModules.uninstallVersion({
      moduleKey: parsedBody.data.module_key,
      version: parsedBody.data.version,
    });

    if (result.status === "not_found") return reply.code(404).send({ error: "module_version_not_found" });
    if (result.status === "active") return reply.code(409).send({ error: "module_version_is_active" });

    const activeModules = await repoModules.listActiveInstalledModules();
    await fastify.moduleHooks.syncActiveModules(activeModules);
    await fastify.moduleI18n.syncActiveModules(activeModules);
    await fastify.moduleSchedule.syncActiveModules(activeModules);

    return reply.send({ ok: true });
  });

  fastify.get("/modules/runtime", { preHandler: ensureAuthenticated }, async (_req, reply) => {
    const activeModules = await repoModules.listActiveInstalledModules();
    const runtime = buildModulesRuntime(activeModules);
    return reply.send({ runtime });
  });

  fastify.get("/modules/platform", { preHandler: ensureAuthenticated }, async (_req, reply) => {
    const raw = fs.readFileSync(platformManifestPath, "utf8");
    const platform = JSON.parse(raw);
    return reply.send({ platform });
  });
}
