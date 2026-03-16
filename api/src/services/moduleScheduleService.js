import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { runWithModuleContext } from "../core/moduleApi.js";

let importCounter = 0;

function buildScheduleFilePath(moduleRow) {
  const installPath = String(moduleRow?.install_path || moduleRow?.installPath || "").trim();
  if (!installPath) {
    throw new Error(`module_schedule_install_path_missing:${moduleRow?.module_key || moduleRow?.key || "unknown"}`);
  }
  return path.join(installPath, "api", "schedule.js");
}

function buildModuleSignature(moduleRow) {
  const moduleKey = String(moduleRow?.module_key || moduleRow?.key || "").trim();
  const version = String(moduleRow?.version || "").trim();
  const installPath = String(moduleRow?.install_path || moduleRow?.installPath || "").trim();
  return `${moduleKey}:${version}:${installPath}`;
}

function buildImportRef(filePath) {
  importCounter += 1;
  return `${pathToFileURL(filePath).href}?v=${importCounter}`;
}

const JOB_HANDLERS_TABLE = "schedule.job_handlers";

export function createModuleScheduleService({ scheduleRegistry, getDb, logger = console } = {}) {
  const loadedModules = new Map();

  async function syncRegistryToDatabase() {
    const db = typeof getDb === "function" ? getDb() : null;
    if (!db) return;
    try {
      const handlers = scheduleRegistry.list();
      const activeKeys = new Set(handlers.map((item) => item.key));

      for (const handler of handlers) {
        const existing = await db(JOB_HANDLERS_TABLE).where({ key: handler.key }).first();
        if (existing) {
          await db(JOB_HANDLERS_TABLE)
            .where({ key: handler.key })
            .update({
              module_key: handler.module_key,
              label: handler.label || handler.key,
              description: handler.description || null,
              active: true,
            });
          continue;
        }

        await db(JOB_HANDLERS_TABLE).insert({
          key: handler.key,
          module_key: handler.module_key,
          label: handler.label || handler.key,
          description: handler.description || null,
          active: true,
        });
      }

      const existingRows = await db(JOB_HANDLERS_TABLE).select("key");
      for (const row of existingRows) {
        if (activeKeys.has(row.key)) continue;
        await db(JOB_HANDLERS_TABLE).where({ key: row.key }).update({ active: false });
      }
    } catch (err) {
      if (err?.code === "42P01") {
        logger?.warn?.("schedule job_handlers table not available yet");
        return;
      }
      throw err;
    }
  }

  async function activateModule(moduleRow) {
    const moduleKey = String(moduleRow?.module_key || moduleRow?.key || "").trim();
    if (!moduleKey) {
      throw new Error("module_schedule_module_key_missing");
    }

    const signature = buildModuleSignature(moduleRow);
    const current = loadedModules.get(moduleKey);
    if (current?.signature === signature && current.loaded) {
      return { moduleKey, loaded: current.loaded, skipped: true };
    }

    if (current) {
      deactivateModule(moduleKey);
    }

    const scheduleFilePath = buildScheduleFilePath(moduleRow);
    if (!fs.existsSync(scheduleFilePath)) {
      loadedModules.set(moduleKey, { signature, loaded: false });
      return { moduleKey, loaded: false, skipped: false };
    }

    await runWithModuleContext(moduleKey, async () => {
      await import(buildImportRef(scheduleFilePath));
    });

    loadedModules.set(moduleKey, { signature, loaded: true });
    await syncRegistryToDatabase();
    logger?.info?.({ moduleKey }, "module schedule activated");
    return { moduleKey, loaded: true, skipped: false };
  }

  function deactivateModule(moduleKey) {
    const normalizedModuleKey = String(moduleKey || "").trim();
    if (!normalizedModuleKey) return 0;

    const removed = scheduleRegistry.unregisterByModule(normalizedModuleKey);
    loadedModules.delete(normalizedModuleKey);
    void syncRegistryToDatabase();
    logger?.info?.({ moduleKey: normalizedModuleKey, removed }, "module schedule deactivated");
    return removed;
  }

  async function syncActiveModules(activeModules) {
    const desiredModules = new Map(
      (activeModules || []).map((moduleRow) => [String(moduleRow.module_key || moduleRow.key || "").trim(), moduleRow]),
    );

    for (const moduleKey of Array.from(loadedModules.keys())) {
      if (!desiredModules.has(moduleKey)) {
        deactivateModule(moduleKey);
      }
    }

    for (const moduleRow of desiredModules.values()) {
      await activateModule(moduleRow);
    }
  }

  return {
    activateModule,
    deactivateModule,
    syncActiveModules,
    syncRegistryToDatabase,
  };
}
