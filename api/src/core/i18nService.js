import fs from "node:fs/promises";
import path from "node:path";

function isPlainObject(value) {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return false;
  return Object.getPrototypeOf(value) === Object.prototype;
}

function interpolate(template, params = {}) {
  return String(template).replace(/\{([^}]+)\}/g, (_match, key) => {
    const value = params?.[key];
    return value == null ? `{${key}}` : String(value);
  });
}

function sortModules(activeModules = []) {
  return [...activeModules].sort((a, b) => {
    const orderA = Number(a?.order_override ?? a?.base_order ?? 100);
    const orderB = Number(b?.order_override ?? b?.base_order ?? 100);
    return orderA - orderB;
  });
}

async function readJsonIfExists(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    if (err?.code === "ENOENT") return fallback;
    throw err;
  }
}

export async function loadBaseLabelsFromDir(labelsDir) {
  try {
    const entries = await fs.readdir(labelsDir, { withFileTypes: true });
    const files = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".json"));
    const output = {};

    for (const file of files) {
      const locale = file.name.replace(/\.json$/i, "");
      output[locale] = await readJsonIfExists(path.join(labelsDir, file.name), {});
    }

    return output;
  } catch (err) {
    if (err?.code === "ENOENT") return {};
    throw err;
  }
}

export function createI18nService({ getDefaultLocale = () => "pt-BR" } = {}) {
  let messagesByLocale = {};
  let baseMessagesByLocale = {};

  function setBaseMessages(messages = {}) {
    baseMessagesByLocale = messages || {};
  }

  function rebuild(activeModules = []) {
    const next = {};

    for (const [locale, messages] of Object.entries(baseMessagesByLocale || {})) {
      if (!isPlainObject(messages)) continue;
      next[locale] = {
        ...(next[locale] || {}),
        ...messages,
      };
    }

    for (const moduleRow of sortModules(activeModules)) {
      const manifest = typeof moduleRow?.manifest === "string" ? JSON.parse(moduleRow.manifest) : moduleRow?.manifest || {};
      const labels = manifest?.runtime?.labels || {};

      for (const [locale, messages] of Object.entries(labels)) {
        if (!isPlainObject(messages)) continue;
        next[locale] = {
          ...(next[locale] || {}),
          ...messages,
        };
      }
    }

    messagesByLocale = next;
  }

  function t(key, fallback = null, params = {}, options = {}) {
    const locale = options?.locale || getDefaultLocale() || "pt-BR";
    const fallbackLocale = options?.fallbackLocale || "pt-BR";
    const defaultValue = fallback ?? options?.fallback ?? key;

    const value =
      messagesByLocale?.[locale]?.[key] ??
      messagesByLocale?.[fallbackLocale]?.[key] ??
      defaultValue;

    if (typeof value !== "string") return value;
    return interpolate(value, params);
  }

  function has(key, locale = null) {
    const resolvedLocale = locale || getDefaultLocale() || "pt-BR";
    return key in (messagesByLocale?.[resolvedLocale] || {});
  }

  function getMessages(locale = null) {
    const resolvedLocale = locale || getDefaultLocale() || "pt-BR";
    return { ...(messagesByLocale?.[resolvedLocale] || {}) };
  }

  return {
    setBaseMessages,
    rebuild,
    t,
    has,
    getMessages,
  };
}
