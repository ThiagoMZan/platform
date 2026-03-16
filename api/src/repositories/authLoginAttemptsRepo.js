export function authLoginAttemptsRepo(db) {
  return {
    createFailure({ attempted_email, user_id = null, ip = null, user_agent = null, failure_reason = "invalid_credentials", blocked_until = null }) {
      return db("auth_login_attempts").insert({
        attempted_email,
        user_id,
        ip,
        user_agent,
        failure_reason,
        blocked_until,
      });
    },

    async countRecentFailures({ attempted_email, since }) {
      const row = await db("auth_login_attempts")
        .where({ attempted_email })
        .where("created_at", ">=", since)
        .whereIn("failure_reason", ["invalid_credentials", "blocked"])
        .count("id as count")
        .first();

      return Number(row?.count || 0);
    },

    findActiveBlock({ attempted_email }) {
      return db("auth_login_attempts")
        .where({ attempted_email })
        .whereNotNull("blocked_until")
        .where("blocked_until", ">", db.fn.now())
        .orderBy("blocked_until", "desc")
        .first();
    },
  };
}
