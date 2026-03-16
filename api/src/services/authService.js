import crypto from "node:crypto";

export function authService(config) {
  const defaultTtlMs = config.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;
  const loginAttemptWindowMinutes = 15;
  const loginAttemptLimit = 5;
  const loginAttemptLockMinutes = 15;

  return {
    getLoginAttemptPolicy() {
      return {
        windowMinutes: loginAttemptWindowMinutes,
        limit: loginAttemptLimit,
        lockMinutes: loginAttemptLockMinutes,
      };
    },

    generateSessionToken() {
      return crypto.randomBytes(32).toString("hex");
    },

    generateApiClientKey() {
      return `cli_${crypto.randomBytes(12).toString("hex")}`;
    },

    generateApiClientSecret() {
      return crypto.randomBytes(32).toString("base64url");
    },

    generateApiAccessToken() {
      return crypto.randomBytes(48).toString("base64url");
    },

    hashOpaqueToken(token) {
      return crypto.createHash("sha256").update(String(token || "")).digest("hex");
    },

    buildSessionExpiry(ttlMinutes) {
      const normalizedMinutes = Number(ttlMinutes);
      const ttlMs =
        Number.isFinite(normalizedMinutes) && normalizedMinutes > 0
          ? Math.floor(normalizedMinutes) * 60 * 1000
          : defaultTtlMs;

      return new Date(Date.now() + ttlMs);
    },

    buildApiTokenExpiry(ttlMinutes = config.API_CLIENT_TOKEN_TTL_MINUTES) {
      const normalizedMinutes = Number(ttlMinutes);
      const ttlMs =
        Number.isFinite(normalizedMinutes) && normalizedMinutes > 0
          ? Math.floor(normalizedMinutes) * 60 * 1000
          : 60 * 60 * 1000;

      return new Date(Date.now() + ttlMs);
    },

    buildLoginAttemptWindowStart() {
      return new Date(Date.now() - loginAttemptWindowMinutes * 60 * 1000);
    },

    buildLoginAttemptBlockedUntil() {
      return new Date(Date.now() + loginAttemptLockMinutes * 60 * 1000);
    },
  };
}
