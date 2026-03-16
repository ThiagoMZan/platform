import util from "node:util";

let currentHookBus = null;
let currentLogger = null;
let currentHttpClient = null;
let currentI18nService = null;
let currentDbClient = null;
let currentScheduleRegistry = null;
let currentFilesService = null;
const pendingRegistrations = [];
const pendingScheduleRegistrations = [];
const moduleContextStack = [];

function ensureHookBus() {
  if (!currentHookBus) {
    throw new Error("module_api_not_initialized");
  }
  return currentHookBus;
}

function ensureLogger() {
  if (!currentLogger) {
    throw new Error("module_api_not_initialized");
  }
  return currentLogger;
}

function ensureHttpClient() {
  if (!currentHttpClient) {
    throw new Error("module_api_not_initialized");
  }
  return currentHttpClient;
}

function ensureI18nService() {
  if (!currentI18nService) {
    throw new Error("module_api_not_initialized");
  }
  return currentI18nService;
}

function ensureDbClient() {
  if (!currentDbClient) {
    throw new Error("module_api_not_initialized");
  }
  return currentDbClient;
}

function ensureScheduleRegistry() {
  if (!currentScheduleRegistry) {
    throw new Error("module_api_not_initialized");
  }
  return currentScheduleRegistry;
}

function ensureFilesService() {
  if (!currentFilesService) {
    throw new Error("module_api_not_initialized");
  }
  return currentFilesService;
}

function getCurrentModuleKey() {
  return moduleContextStack[moduleContextStack.length - 1] || null;
}

function decorateOptions(options = {}) {
  const moduleKey = options.moduleKey || getCurrentModuleKey();
  if (!moduleKey) return options;

  return {
    ...options,
    moduleKey,
    source: options.source || `module:${moduleKey}`,
  };
}

function buildLogBindings(bindings = null) {
  const moduleKey = getCurrentModuleKey();
  if (!moduleKey && !bindings) return null;

  return {
    ...(bindings && typeof bindings === "object" && !Array.isArray(bindings) ? bindings : {}),
    ...(moduleKey ? { moduleKey } : {}),
  };
}

function normalizeLogArgs(args) {
  if (!args.length) {
    return { bindings: null, message: "" };
  }

  const [first, ...rest] = args;

  if (typeof first === "string") {
    return {
      bindings: null,
      message: util.format(first, ...rest),
    };
  }

  if (first && typeof first === "object" && !Array.isArray(first)) {
    if (typeof rest[0] === "string") {
      return {
        bindings: first,
        message: util.format(rest[0], ...rest.slice(1)),
      };
    }

    return {
      bindings: first,
      message: "",
    };
  }

  return {
    bindings: null,
    message: util.format(first, ...rest),
  };
}

function logAtLevel(level, args) {
  const logger = ensureLogger();
  const method = typeof logger[level] === "function" ? logger[level].bind(logger) : logger.info.bind(logger);
  const { bindings, message } = normalizeLogArgs(args);
  const payload = buildLogBindings(bindings);

  if (payload && message) {
    method(payload, message);
    return;
  }

  if (payload) {
    method(payload);
    return;
  }

  method(message);
}

function bindOrQueue(method, args) {
  if (currentHookBus) {
    const [eventName, handler, options] = args;
    return currentHookBus[method](eventName, handler, decorateOptions(options));
  }

  if (method === "on" || method === "once") {
    const [eventName, handler, options] = args;
    pendingRegistrations.push({ method, args: [eventName, handler, decorateOptions(options)] });
    const token = `pending_${pendingRegistrations.length}`;
    const unsubscribe = () => false;
    unsubscribe.token = token;
    return unsubscribe;
  }

  throw new Error("module_api_not_initialized");
}

export function attachModuleApi({ hookBus, logger, httpClient, i18nService, dbClient, scheduleRegistry, filesService }) {
  currentHookBus = hookBus;
  currentLogger = logger;
  currentHttpClient = httpClient;
  currentI18nService = i18nService;
  currentDbClient = dbClient;
  currentScheduleRegistry = scheduleRegistry;
  currentFilesService = filesService;
  for (const registration of pendingRegistrations.splice(0)) {
    currentHookBus[registration.method](...registration.args);
  }
  for (const registration of pendingScheduleRegistrations.splice(0)) {
    currentScheduleRegistry.register(...registration.args);
  }
}

export async function runWithModuleContext(moduleKey, fn) {
  moduleContextStack.push(moduleKey);
  try {
    return await fn();
  } finally {
    moduleContextStack.pop();
  }
}

export const hooks = {
  on(eventName, handler, options) {
    return bindOrQueue("on", [eventName, handler, options]);
  },
  once(eventName, handler, options) {
    return bindOrQueue("once", [eventName, handler, options]);
  },
  off(eventName, handlerOrToken) {
    return ensureHookBus().off(eventName, handlerOrToken);
  },
  trigger(eventName, payload, meta) {
    return ensureHookBus().trigger(eventName, payload, meta);
  },
  emit(eventName, payload, meta) {
    return ensureHookBus().emit(eventName, payload, meta);
  },
};

export const logging = {
  info(...args) {
    return logAtLevel("info", args);
  },
  warn(...args) {
    return logAtLevel("warn", args);
  },
  error(...args) {
    return logAtLevel("error", args);
  },
};

function withModuleHttpOptions(options = {}) {
  const moduleKey = getCurrentModuleKey();
  if (!moduleKey) return options;
  return {
    ...options,
    moduleKey,
  };
}

export const http = {
  request(options) {
    return ensureHttpClient().request(withModuleHttpOptions(options || {}));
  },
  get(url, options) {
    return ensureHttpClient().get(url, withModuleHttpOptions(options || {}));
  },
  post(url, options) {
    return ensureHttpClient().post(url, withModuleHttpOptions(options || {}));
  },
  put(url, options) {
    return ensureHttpClient().put(url, withModuleHttpOptions(options || {}));
  },
  patch(url, options) {
    return ensureHttpClient().patch(url, withModuleHttpOptions(options || {}));
  },
  delete(url, options) {
    return ensureHttpClient().delete(url, withModuleHttpOptions(options || {}));
  },
};

export const i18n = {
  t(key, fallback, params, options) {
    return ensureI18nService().t(key, fallback, params, options);
  },
  has(key, locale) {
    return ensureI18nService().has(key, locale);
  },
  getMessages(locale) {
    return ensureI18nService().getMessages(locale);
  },
};

export const db = new Proxy(function moduleApiDb() {}, {
  apply(_target, thisArg, args) {
    return Reflect.apply(ensureDbClient(), thisArg, args);
  },
  get(_target, prop) {
    return ensureDbClient()[prop];
  },
});

function bindOrQueueSchedule(args) {
  if (currentScheduleRegistry) {
    return currentScheduleRegistry.register(...args);
  }

  pendingScheduleRegistrations.push({ args });
  const token = `pending_schedule_${pendingScheduleRegistrations.length}`;
  const unsubscribe = () => false;
  unsubscribe.token = token;
  return unsubscribe;
}

export const schedule = {
  register(key, handler, options = {}) {
    const moduleKey = options.moduleKey || getCurrentModuleKey();
    return bindOrQueueSchedule([
      key,
      handler,
      {
        ...options,
        moduleKey,
      },
    ]);
  },
  unregister(key) {
    return ensureScheduleRegistry().unregister(key);
  },
  list() {
    return ensureScheduleRegistry().list();
  },
  get(key) {
    return ensureScheduleRegistry().get(key);
  },
};

export const files = {
  upload(options) {
    const payload = { ...(options || {}) };
    delete payload.uploadedBy;
    return ensureFilesService().upload(payload);
  },
  metadata(id) {
    return ensureFilesService().metadata(id);
  },
  download(id, options) {
    return ensureFilesService().download(id, options || {});
  },
};
