export function apiClientsRepo(db) {
  return {
    findById(id) {
      return db("api_clients").where({ id }).first();
    },

    findByClientKey(clientKey) {
      return db("api_clients").where({ client_key: clientKey }).first();
    },

    async list() {
      return db("api_clients as c")
        .leftJoin("users as u", "u.id", "c.owner_user_id")
        .select(
          "c.id",
          "c.name",
          "c.description",
          "c.client_key",
          "c.active",
          "c.owner_user_id",
          "u.email as owner_user_email",
          "u.name as owner_user_name",
          "c.last_used_at",
          "c.expires_at",
          "c.created_at",
          "c.updated_at"
        )
        .orderBy("c.name", "asc");
    },

    async create(payload) {
      const [row] = await db("api_clients").insert(payload).returning("*");
      return row;
    },

    async update(id, payload) {
      const [row] = await db("api_clients").where({ id }).update(payload).returning("*");
      return row || null;
    },

    async remove(id) {
      return db("api_clients").where({ id }).del();
    },
  };
}
