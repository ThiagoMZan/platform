export function authLoginsRepo(db) {
  return {
    create({ user_id, session_id, email, ip = null, user_agent = null }) {
      return db("auth_logins").insert({
        user_id,
        session_id,
        email,
        ip,
        user_agent,
      });
    },

    revokeBySessionId(sessionId) {
      return db("auth_logins")
        .where({ session_id: sessionId })
        .whereNull("revoked_at")
        .update({ revoked_at: db.fn.now() });
    },

    revokeActiveByUserId(userId) {
      return db("auth_logins")
        .where({ user_id: userId })
        .whereNull("revoked_at")
        .update({ revoked_at: db.fn.now() });
    },
  };
}
