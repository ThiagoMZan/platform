import { getRequestContext } from "../services/requestContext.js";

function getCurrentDb(getBaseDb) {
  const context = getRequestContext();
  return context?.auditTrx || getBaseDb() || null;
}

export function createDbClient({ getBaseDb }) {
  return new Proxy(function moduleDb() {}, {
    apply(_target, thisArg, args) {
      return Reflect.apply(getCurrentDb(getBaseDb), thisArg, args);
    },

    get(_target, prop) {
      if (prop === "withDb") {
        return async (callback) => callback(getCurrentDb(getBaseDb));
      }

      if (prop === "getAuditContext") {
        return () => {
          const context = getRequestContext();
          return {
            user_id: context?.userId || null,
            session_id: context?.sessionId || null,
          };
        };
      }

      const db = getCurrentDb(getBaseDb);
      if (!db) {
        return undefined;
      }

      const value = db[prop];

      if (typeof value === "function") {
        return value.bind(db);
      }

      return value;
    },
  });
}
