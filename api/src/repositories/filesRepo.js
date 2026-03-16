export function filesRepo(db) {
  return {
    async create(payload) {
      const [row] = await db("files").insert(payload).returning("*");
      return row;
    },

    async findById(id) {
      return db("files").where({ id }).first();
    },
  };
}
