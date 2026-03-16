import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { scanLocalModules } from "./modulesRuntimeService.js";

function resolveBackendPlugin(moduleExports, routeFilePath) {
  if (typeof moduleExports.default === "function") {
    return moduleExports.default;
  }

  if (typeof moduleExports.routes === "function") {
    return moduleExports.routes;
  }

  const candidate = Object.entries(moduleExports).find(
    ([key, value]) => key.endsWith("Routes") && typeof value === "function"
  );
  if (candidate) {
    return candidate[1];
  }

  throw new Error(`No backend route plugin export found in ${routeFilePath}`);
}

function resolveRoutePrefix(moduleExports, routeFilePath) {
  const prefix = String(moduleExports.routePrefix).trim();
  if (!prefix) {
    throw new Error(`Missing routePrefix in ${routeFilePath}. Module APIs must export a prefix starting with /api/.`);
  }
  if (!prefix.startsWith("/api/")) {
    throw new Error(`Invalid routePrefix in ${routeFilePath}. Module API prefixes must start with /api/.`);
  }

  return prefix;
}

export async function loadLocalModuleBackendRoutes() {
  const modules = await scanLocalModules();
  const sortedModules = modules
    .slice()
    .sort((a, b) => Number(a.manifest?.order || 0) - Number(b.manifest?.order || 0));

  const plugins = [];

  for (const moduleEntry of sortedModules) {
    const routeFilePath = `${moduleEntry.apiPath}/routes.js`;
    if (!fs.existsSync(routeFilePath)) continue;

    const moduleExports = await import(pathToFileURL(routeFilePath).href);
    const plugin = resolveBackendPlugin(moduleExports, routeFilePath);
    const prefix = resolveRoutePrefix(moduleExports, routeFilePath);
    plugins.push({
      key: moduleEntry.manifest.id,
      plugin,
      prefix,
    });
  }

  return plugins;
}
