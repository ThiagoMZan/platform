export function sessionsRepo(db) {
  return {
    async create({ id, user_id, expires_at, ip = null, user_agent = null }) {
      await db("sessions").insert({ id, user_id, expires_at, ip, user_agent });
      return { id, user_id, expires_at, ip, user_agent };
    },

    findValidById(id) {
      return db("sessions")
        .where({ id })
        .whereNull("revoked_at")
        .where("expires_at", ">", db.fn.now())
        .first();
    },

    revokeById(id) {
      return db("sessions").where({ id }).update({ revoked_at: db.fn.now() });
    },

    revokeActiveByUserId(userId) {
      return db("sessions")
        .where({ user_id: userId })
        .whereNull("revoked_at")
        .where("expires_at", ">", db.fn.now())
        .update({ revoked_at: db.fn.now() });
    },

    async revokeActiveDuplicatesKeepLatestPerUser() {
      return db.raw(`
        UPDATE sessions s
        SET revoked_at = NOW()
        FROM (
          SELECT id
          FROM (
            SELECT
              id,
              ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC) AS rn
            FROM sessions
            WHERE revoked_at IS NULL
              AND expires_at > NOW()
          ) ranked
          WHERE ranked.rn > 1
        ) duplicates
        WHERE s.id = duplicates.id
      `);
    },

    async listActive() {
      await this.revokeActiveDuplicatesKeepLatestPerUser();

      return db("sessions as s")
        .join("users as u", "u.id", "s.user_id")
        .whereNull("s.revoked_at")
        .where("s.expires_at", ">", db.fn.now())
        .select(
          "s.id",
          "s.user_id",
          "s.created_at",
          "s.expires_at",
          "s.ip",
          "s.user_agent",
          "u.name as user_name",
          "u.email as user_email"
        )
        .orderBy("s.created_at", "desc");
    },
  };
}
