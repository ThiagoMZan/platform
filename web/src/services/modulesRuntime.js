import {
  AddOutline,
  CreateOutline,
  GitBranchOutline,
  HomeOutline,
  IdCardOutline,
  KeyOutline,
  PeopleOutline,
  PersonOutline,
  PricetagsOutline,
  SettingsOutline,
  ShieldCheckmarkOutline,
} from "@vicons/ionicons5";
import { h } from "vue";
import { NIcon } from "naive-ui";
import { api } from "./api";

let runtimePromise = null;

export function resetModulesRuntimeCache() {
  runtimePromise = null;
}

const iconMap = {
  "add-outline": AddOutline,
  "create-outline": CreateOutline,
  "git-branch-outline": GitBranchOutline,
  "home-outline": HomeOutline,
  "id-card-outline": IdCardOutline,
  "key-outline": KeyOutline,
  "people-outline": PeopleOutline,
  "person-outline": PersonOutline,
  "pricetags-outline": PricetagsOutline,
  "settings-outline": SettingsOutline,
  "shield-checkmark-outline": ShieldCheckmarkOutline,
};

function renderIcon(icon) {
  return () => h(NIcon, null, { default: () => h(icon) });
}

function normalizeAdminPath(path) {
  if (!path) return "";
  if (path.startsWith("/admin")) return path;
  return `/admin${path.startsWith("/") ? path : `/${path}`}`;
}

function normalizePortalPath(path) {
  if (!path) return "";
  return path.startsWith("/") ? path : `/${path}`;
}

function compareMenuOrder(a, b) {
  const orderA = Number.isFinite(Number(a?.order)) ? Number(a.order) : 0;
  const orderB = Number.isFinite(Number(b?.order)) ? Number(b.order) : 0;
  if (orderA !== orderB) return orderA - orderB;
  return String(a?.label || a?.key || "").localeCompare(String(b?.label || b?.key || ""));
}

function normalizeMenuEntry(entry, inherited = {}) {
  const icon = typeof entry.icon === "string" ? iconMap[entry.icon] : entry.icon;
  const location = entry.location || inherited.location || "admin";
  const normalizedPath = entry.path
    ? location === "portal"
      ? normalizePortalPath(entry.path)
      : normalizeAdminPath(entry.path)
    : entry.to;
  return {
    ...entry,
    location,
    parent_key: entry.parent_key || inherited.parent_key || null,
    to: normalizedPath,
    icon,
  };
}

function flattenLegacyMenu(entries = [], inherited = {}) {
  const output = [];

  for (const entry of entries) {
    const normalized = normalizeMenuEntry(entry, inherited);
    const { children = [], ...self } = normalized;
    output.push(self);

    if (Array.isArray(entry.children) && entry.children.length) {
      output.push(
        ...flattenLegacyMenu(entry.children, {
          location: normalized.location,
          parent_key: normalized.key,
        })
      );
    }
  }

  return output;
}

function buildMenuTree(entries = []) {
  const nodes = new Map();
  const roots = [];

  for (const entry of entries) {
    nodes.set(entry.key, { ...entry, children: [] });
  }

  for (const entry of entries) {
    const node = nodes.get(entry.key);
    if (!node) continue;

    if (entry.parent_key) {
      const parent = nodes.get(entry.parent_key);
      if (parent) {
        parent.children.push(node);
        continue;
      }
    }

    roots.push(node);
  }

  function sortTree(items) {
    items.sort(compareMenuOrder);
    for (const item of items) {
      if (item.children?.length) {
        sortTree(item.children);
      } else {
        delete item.children;
      }
    }
    return items;
  }

  return sortTree(roots);
}

function resolveMenuOverrides(entries = []) {
  const deduped = new Map();

  for (const entry of entries) {
    if (!entry?.key) continue;

    if (entry.enabled === false) {
      deduped.delete(entry.key);
      continue;
    }

    deduped.set(entry.key, entry);
  }

  return Array.from(deduped.values());
}

function normalizeMenu(entries = [], location) {
  const flattened = flattenLegacyMenu(entries).filter((entry) => entry.location === location);
  const resolved = resolveMenuOverrides(flattened);
  return buildMenuTree(resolved);
}

export async function loadModulesRuntime({ force = false } = {}) {
  if (!runtimePromise || force) {
    runtimePromise = api("/modules/runtime")
      .then((data) => data.runtime || { modules: [], resources: {} })
      .catch((err) => {
        runtimePromise = null;
        throw err;
      });
  }

  return runtimePromise;
}

export function isModuleActive(runtime, moduleKey) {
  if (!moduleKey) return true;
  const modules = runtime?.modules || [];
  return modules.some((item) => item.key === moduleKey);
}

export async function loadAdminModuleMenu({ force = false } = {}) {
  const runtime = await loadModulesRuntime({ force });
  const menu = runtime.resources?.menu || [];
  return normalizeMenu(menu, "admin");
}

export async function loadPortalModuleMenu({ force = false } = {}) {
  const runtime = await loadModulesRuntime({ force });
  const menu = runtime.resources?.menu || [];
  return normalizeMenu(menu, "portal");
}

export function mapMenuIcons(options) {
  return options.map((option) => ({
    ...option,
    icon: option.icon ? renderIcon(option.icon) : undefined,
    children: option.children ? mapMenuIcons(option.children) : undefined,
  }));
}

export function flattenMenu(options, parents = []) {
  const rows = [];

  for (const option of options) {
    const currentParents = [...parents, option];
    rows.push({ option, parents });
    if (option.children?.length) {
      rows.push(...flattenMenu(option.children, currentParents));
    }
  }

  return rows;
}

export function getIconByName(name, fallback = HomeOutline) {
  return iconMap[name] || fallback;
}

export const sharedIcons = {
  AddOutline,
  CreateOutline,
  GitBranchOutline,
  HomeOutline,
  IdCardOutline,
  KeyOutline,
  PeopleOutline,
  PersonOutline,
  PricetagsOutline,
  SettingsOutline,
  ShieldCheckmarkOutline,
};
