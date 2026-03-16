import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { runWithModuleContext } from "../core/moduleApi.js";

let importCounter = 0;

function buildHooksFilePath(moduleRow) {
  const installPath = String(moduleRow?.install_path || moduleRow?.installPath || "").trim();
  if (!installPath) {
    throw new Error(`module_hooks_install_path_missing:${moduleRow?.module_key || moduleRow?.key || "unknown"}`);
  }
  return path.join(installPath, "api", "hooks.js");
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

export function createModuleHooksService({ hookBus, logger = console } = {}) {
  const loadedModules = new Map();

  async function activateModule(moduleRow) {
    const moduleKey = String(moduleRow?.module_key || moduleRow?.key || "").trim();
    if (!moduleKey) {
      throw new Error("module_hooks_module_key_missing");
    }

    const signature = buildModuleSignature(moduleRow);
    const current = loadedModules.get(moduleKey);
    if (current?.signature === signature && current.loaded) {
      return { moduleKey, loaded: current.loaded, skipped: true };
    }

    if (current) {
      deactivateModule(moduleKey);
    }

    const hooksFilePath = buildHooksFilePath(moduleRow);
    if (!fs.existsSync(hooksFilePath)) {
      loadedModules.set(moduleKey, { signature, loaded: false });
      return { moduleKey, loaded: false, skipped: false };
    }

    await runWithModuleContext(moduleKey, async () => {
      await import(buildImportRef(hooksFilePath));
    });

    loadedModules.set(moduleKey, { signature, loaded: true });
    logger?.info?.({ moduleKey }, "module hooks activated");
    return { moduleKey, loaded: true, skipped: false };
  }

  function deactivateModule(moduleKey) {
    const normalizedModuleKey = String(moduleKey || "").trim();
    if (!normalizedModuleKey) return 0;

    const removed = hookBus.offByModule(normalizedModuleKey);
    loadedModules.delete(normalizedModuleKey);
    logger?.info?.({ moduleKey: normalizedModuleKey, removed }, "module hooks deactivated");
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

  function listLoadedModules() {
    return Array.from(loadedModules.entries()).map(([moduleKey, state]) => ({
      moduleKey,
      ...state,
    }));
  }

  return {
    activateModule,
    deactivateModule,
    syncActiveModules,
    listLoadedModules,
  };
}
