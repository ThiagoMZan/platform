export function apiClientTokensRepo(db) {
  return {
    async create(payload) {
      const [row] = await db("api_client_tokens").insert(payload).returning("*");
      return row;
    },

    findValidByHash(tokenHash) {
      return db("api_client_tokens")
        .where({ token_hash: tokenHash })
        .whereNull("revoked_at")
        .where("expires_at", ">", db.fn.now())
        .first();
    },

    async touch(id) {
      return db("api_client_tokens").where({ id }).update({ last_used_at: db.fn.now() });
    },

    async revokeActiveByClientId(apiClientId) {
      return db("api_client_tokens")
        .where({ api_client_id: apiClientId })
        .whereNull("revoked_at")
        .where("expires_at", ">", db.fn.now())
        .update({ revoked_at: db.fn.now() });
    },
  };
}
