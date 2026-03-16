export class MemoryCacheProvider {
  constructor() {
    this._store = new Map();
  }

  async get(key) {
    const item = this._store.get(key);
    if (!item) return null;
    if (item.expiresAt && item.expiresAt <= Date.now()) {
      this._store.delete(key);
      return null;
    }
    return item.value;
  }

  async set(key, value, ttlMs = null) {
    const expiresAt = ttlMs ? Date.now() + ttlMs : null;
    this._store.set(key, { value, expiresAt });
  }

  async del(key) {
    this._store.delete(key);
  }
}
