import { AsyncLocalStorage } from "node:async_hooks";

const requestContextStorage = new AsyncLocalStorage();

export function runWithRequestContext(store, callback) {
  return requestContextStorage.run(store, callback);
}

export function getRequestContext() {
  return requestContextStorage.getStore() || null;
}

export function patchRequestContext(patch = {}) {
  const store = getRequestContext();
  if (!store) return null;
  Object.assign(store, patch);
  return store;
}
