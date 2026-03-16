function createToken() {
  return `schedule_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function createScheduleRegistry() {
  const handlers = new Map();

  function register(key, handler, options = {}) {
    if (!key || typeof key !== "string") {
      throw new Error("schedule_handler_key_invalid");
    }
    if (typeof handler !== "function") {
      throw new Error("schedule_handler_invalid");
    }
    if (handlers.has(key)) {
      throw new Error(`schedule_handler_already_registered:${key}`);
    }

    const entry = {
      token: createToken(),
      key,
      handler,
      moduleKey: options.moduleKey || null,
      label: options.label || key,
      description: options.description || null,
    };

    handlers.set(key, entry);
    const unsubscribe = () => unregister(key);
    unsubscribe.token = entry.token;
    return unsubscribe;
  }

  function unregister(key) {
    return handlers.delete(key);
  }

  function unregisterByModule(moduleKey) {
    let removed = 0;
    for (const [key, entry] of handlers.entries()) {
      if (entry.moduleKey !== moduleKey) continue;
      handlers.delete(key);
      removed += 1;
    }
    return removed;
  }

  function get(key) {
    return handlers.get(key) || null;
  }

  function list() {
    return Array.from(handlers.values())
      .map(({ key, moduleKey, label, description }) => ({
        key,
        module_key: moduleKey,
        label,
        description,
      }))
      .sort((a, b) => a.key.localeCompare(b.key));
  }

  return {
    register,
    unregister,
    unregisterByModule,
    get,
    list,
  };
}

