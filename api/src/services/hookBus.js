function createToken() {
  return `hook_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function createHookBus({ logger = console } = {}) {
  const listeners = new Map();
  let orderCounter = 0;

  function getBucket(eventName) {
    if (!listeners.has(eventName)) {
      listeners.set(eventName, []);
    }
    return listeners.get(eventName);
  }

  function sortBucket(bucket) {
    bucket.sort((a, b) => {
      const priorityDiff = Number(a.priority || 0) - Number(b.priority || 0);
      if (priorityDiff !== 0) return priorityDiff;
      return a.order - b.order;
    });
  }

  function removeByToken(token) {
    for (const [eventName, bucket] of listeners.entries()) {
      const next = bucket.filter((entry) => entry.token !== token);
      if (next.length !== bucket.length) {
        if (next.length) listeners.set(eventName, next);
        else listeners.delete(eventName);
        return true;
      }
    }
    return false;
  }

  function on(eventName, handler, options = {}) {
    if (!eventName || typeof eventName !== "string") {
      throw new Error("hook_event_name_invalid");
    }
    if (typeof handler !== "function") {
      throw new Error("hook_handler_invalid");
    }

    const bucket = getBucket(eventName);
    const entry = {
      token: createToken(),
      eventName,
      handler,
      once: Boolean(options.once),
      priority: Number(options.priority || 0),
      source: options.source || null,
      moduleKey: options.moduleKey || null,
      order: orderCounter++,
    };

    bucket.push(entry);
    sortBucket(bucket);

    const unsubscribe = () => off(eventName, entry.token);
    unsubscribe.token = entry.token;
    return unsubscribe;
  }

  function once(eventName, handler, options = {}) {
    return on(eventName, handler, { ...options, once: true });
  }

  function off(eventName, handlerOrToken = null) {
    if (!eventName || typeof eventName !== "string") return false;
    const bucket = listeners.get(eventName);
    if (!bucket?.length) return false;

    if (!handlerOrToken) {
      listeners.delete(eventName);
      return true;
    }

    const next = bucket.filter((entry) => entry.token !== handlerOrToken && entry.handler !== handlerOrToken);
    if (next.length === bucket.length) return false;

    if (next.length) listeners.set(eventName, next);
    else listeners.delete(eventName);
    return true;
  }

  function offByModule(moduleKey) {
    if (!moduleKey || typeof moduleKey !== "string") return 0;

    let removedCount = 0;
    for (const [eventName, bucket] of listeners.entries()) {
      const next = bucket.filter((entry) => entry.moduleKey !== moduleKey);
      removedCount += bucket.length - next.length;

      if (next.length) listeners.set(eventName, next);
      else listeners.delete(eventName);
    }

    return removedCount;
  }

  async function trigger(eventName, payload = {}, meta = {}) {
    const bucket = (listeners.get(eventName) || []).slice();
    for (const entry of bucket) {
      await entry.handler(payload, {
        eventName,
        token: entry.token,
        source: entry.source,
        moduleKey: entry.moduleKey,
        ...meta,
      });
      if (entry.once) {
        removeByToken(entry.token);
      }
    }
  }

  function emit(eventName, payload = {}, meta = {}) {
    queueMicrotask(async () => {
      try {
        await trigger(eventName, payload, meta);
      } catch (err) {
        logger?.error?.({ err, eventName }, "hook bus emit failed");
      }
    });
  }

  function listenerCount(eventName) {
    return eventName ? (listeners.get(eventName) || []).length : Array.from(listeners.values()).reduce((sum, bucket) => sum + bucket.length, 0);
  }

  function registerHookMap(hookMap, options = {}) {
    if (!hookMap || typeof hookMap !== "object" || Array.isArray(hookMap)) {
      throw new Error("hook_map_invalid");
    }

    for (const [eventName, handler] of Object.entries(hookMap)) {
      const existing = listeners.get(eventName);
      if (existing?.length && options.unique !== false) {
        throw new Error(`Duplicate hook handler "${eventName}"`);
      }
      on(eventName, handler, { ...options, once: false });
    }
  }

  return {
    on,
    once,
    off,
    offByModule,
    trigger,
    emit,
    listenerCount,
    registerHookMap,
  };
}
