export function apiClientAuthLogRepo(db) {
  return {
    async create(payload) {
      const [row] = await db("api_client_auth_log").insert(payload).returning("*");
      return row;
    },
  };
}
