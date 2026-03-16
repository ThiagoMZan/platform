export const SESSION_TTL_MINUTES_KEY = "auth.session_ttl_minutes";
export const DEFAULT_SESSION_TTL_MINUTES = 30;
export const APP_LOCALE_KEY = "app.locale";
export const DEFAULT_APP_LOCALE = "pt_BR";
export const APP_LOG_LEVEL_KEY = "app.log_level";
export const DEFAULT_APP_LOG_LEVEL = "error";

export function settingsRepo(db) {
  return {
    async getByKey(key) {
      return db("core_settings").where({ key }).first();
    },

    async upsert(key, value) {
      await db("core_settings")
        .insert({ key, value })
        .onConflict("key")
        .merge({ value, updated_at: db.fn.now() });

      return this.getByKey(key);
    },

    async getSessionTtlMinutes() {
      const row = await this.getByKey(SESSION_TTL_MINUTES_KEY);
      const maybeMinutes = Number(row?.value?.minutes);
      if (!Number.isFinite(maybeMinutes) || maybeMinutes <= 0) {
        return DEFAULT_SESSION_TTL_MINUTES;
      }
      return Math.floor(maybeMinutes);
    },

    async setSessionTtlMinutes(minutes) {
      const normalized = Math.floor(Number(minutes));
      return this.upsert(SESSION_TTL_MINUTES_KEY, { minutes: normalized });
    },

    async getAppLocale() {
      const row = await this.getByKey(APP_LOCALE_KEY);
      const locale = String(row?.value?.locale || "").trim();
      if (!locale) return DEFAULT_APP_LOCALE;
      return locale;
    },

    async setAppLocale(locale) {
      const normalized = String(locale || "").trim() || DEFAULT_APP_LOCALE;
      return this.upsert(APP_LOCALE_KEY, { locale: normalized });
    },

    async getAppLogLevel(fallback = DEFAULT_APP_LOG_LEVEL) {
      const row = await this.getByKey(APP_LOG_LEVEL_KEY);
      const level = String(row?.value?.level || "").trim().toLowerCase();
      if (!level) return fallback;
      return level;
    },

    async setAppLogLevel(level) {
      const normalized = String(level || "").trim().toLowerCase() || DEFAULT_APP_LOG_LEVEL;
      return this.upsert(APP_LOG_LEVEL_KEY, { level: normalized });
    },
  };
}
