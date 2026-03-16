import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..", "..", "..");

const manifestSchema = z.object({
  id: z.string().trim().min(2).max(120),
  name: z.string().trim().min(2).max(200),
  version: z.string().trim().min(1).max(40),
  order: z.coerce.number().int().min(0).default(100),
  dependencies: z.record(z.string().trim().min(1), z.string().trim().min(1)).default({}),
  apiDependencies: z.record(z.string().trim().min(1), z.string().trim().min(1)).default({}),
  webDependencies: z.record(z.string().trim().min(1), z.string().trim().min(1)).default({}),
});

async function readJsonIfExists(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    if (err?.code === "ENOENT") return fallback;
    throw err;
  }
}

async function readJsonFilesInDir(dirPath) {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const files = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".json"));
    const output = {};

    for (const file of files) {
      const absolutePath = path.join(dirPath, file.name);
      const raw = await fs.readFile(absolutePath, "utf8");
      const key = file.name.replace(/\.json$/i, "");
      output[key] = JSON.parse(raw);
    }

    return output;
  } catch (err) {
    if (err?.code === "ENOENT") return {};
    throw err;
  }
}

async function loadRuntimeResources(moduleDir) {
  const menu = await readJsonIfExists(path.join(moduleDir, "menu.json"), []);
  const permissions = await readJsonIfExists(path.join(moduleDir, "permissions.json"), []);
  const labels = await readJsonFilesInDir(path.join(moduleDir, "labels"));
  const forms = await readJsonFilesInDir(path.join(moduleDir, "forms"));
  const sources = await readJsonFilesInDir(path.join(moduleDir, "sources"));

  return { menu, permissions, labels, forms, sources };
}

async function directoryExists(dirPath) {
  try {
    const stat = await fs.stat(dirPath);
    return stat.isDirectory();
  } catch (err) {
    if (err?.code === "ENOENT") return false;
    throw err;
  }
}

async function resolveModuleStructure(moduleDir) {
  const apiDir = path.join(moduleDir, "api");
  const hasApiDir = await directoryExists(apiDir);
  return {
    moduleDir,
    apiDir: hasApiDir ? apiDir : moduleDir,
    webDir: path.join(moduleDir, "web"),
  };
}

function normalizeCatalogRow(row) {
  const manifest = typeof row.manifest === "string" ? JSON.parse(row.manifest) : row.manifest;
  return {
    module_key: row.module_key,
    module_name: row.module_name,
    version: row.version,
    base_order: row.base_order,
    order: row.order_override ?? row.base_order,
    manifest,
  };
}

export function getDefaultModuleBaseDirs() {
  return [path.resolve(repoRoot, "platform-modules")];
}

async function scanModulesInDirectory(baseDir) {
  const absoluteBaseDir = path.resolve(baseDir);
  const entries = await fs.readdir(absoluteBaseDir, { withFileTypes: true });
  const directories = entries.filter((entry) => entry.isDirectory());
  const modules = [];

  for (const dir of directories) {
    const moduleDir = path.join(absoluteBaseDir, dir.name);
    const manifestPath = path.join(moduleDir, "module.json");
    const rawManifest = await readJsonIfExists(manifestPath, null);
    if (!rawManifest) continue;

    const parsed = manifestSchema.safeParse(rawManifest);
    if (!parsed.success) {
      throw new Error(`Invalid manifest in ${manifestPath}`);
    }

    const structure = await resolveModuleStructure(moduleDir);
    const runtime = await loadRuntimeResources(structure.apiDir);
    modules.push({
      manifest: { ...parsed.data, runtime },
      installPath: moduleDir,
      apiPath: structure.apiDir,
      webPath: structure.webDir,
    });
  }

  return modules;
}

export async function scanLocalModules(baseDir = null) {
  const baseDirs = Array.isArray(baseDir)
    ? baseDir
    : baseDir
      ? [baseDir]
      : getDefaultModuleBaseDirs();

  const modulesById = new Map();

  for (const dir of baseDirs) {
    try {
      const modules = await scanModulesInDirectory(dir);
      for (const moduleEntry of modules) {
        if (!modulesById.has(moduleEntry.manifest.id)) {
          modulesById.set(moduleEntry.manifest.id, moduleEntry);
        }
      }
    } catch (err) {
      if (err?.code === "ENOENT") continue;
      throw err;
    }
  }

  return Array.from(modulesById.values());
}

function mergeLabels(target, source) {
  const output = { ...target };
  for (const [locale, labels] of Object.entries(source || {})) {
    output[locale] = {
      ...(output[locale] || {}),
      ...(labels || {}),
    };
  }
  return output;
}

function mergeByKey(current, incoming) {
  return {
    ...current,
    ...(incoming || {}),
  };
}

function mergePermissions(current, incoming) {
  const all = [...current, ...(incoming || [])];
  const map = new Map();
  for (const permission of all) {
    const key = permission?.key || JSON.stringify(permission);
    map.set(key, permission);
  }
  return Array.from(map.values());
}

function mergeMenus(current, incoming) {
  return [...current, ...(incoming || [])];
}

export function buildModulesRuntime(activeModuleRows) {
  const modules = activeModuleRows.map(normalizeCatalogRow).sort((a, b) => a.order - b.order);

  const merged = {
    menu: [],
    permissions: [],
    labels: {},
    forms: {},
    sources: {},
  };

  for (const mod of modules) {
    const runtime = mod.manifest?.runtime || {};
    merged.menu = mergeMenus(merged.menu, runtime.menu);
    merged.permissions = mergePermissions(merged.permissions, runtime.permissions);
    merged.labels = mergeLabels(merged.labels, runtime.labels);
    merged.forms = mergeByKey(merged.forms, runtime.forms);
    merged.sources = mergeByKey(merged.sources, runtime.sources);
  }

  return {
    modules: modules.map((mod) => ({
      key: mod.module_key,
      name: mod.module_name,
      version: mod.version,
      order: mod.order,
      dependencies: mod.manifest.dependencies || {},
      apiDependencies: mod.manifest.apiDependencies || {},
      webDependencies: mod.manifest.webDependencies || {},
    })),
    resources: merged,
  };
}

export const buildTenantRuntime = buildModulesRuntime;
