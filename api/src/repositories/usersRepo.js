export function usersRepo(db) {
  return {
    findByEmail(email) {
      return db("users").where({ email }).first();
    },

    findById(id) {
      return db("users").where({ id }).first();
    },

    findByEmailExcludingId(email, id) {
      return db("users").where({ email }).whereNot({ id }).first();
    },

    async list({ page = 1, pageSize = 20, search = "", sortBy = "created_at", sortDir = "desc" }) {
      const allowedSort = new Set(["name", "email", "inactive", "created_at"]);
      const finalSortBy = allowedSort.has(sortBy) ? sortBy : "created_at";
      const finalSortDir = sortDir === "asc" ? "asc" : "desc";

      const query = db("users")
        .select("id", "email", "name", "inactive", "created_at", "updated_at")
        .modify((qb) => {
          if (search) {
            qb.where((inner) => {
              inner.whereILike("name", `%${search}%`).orWhereILike("email", `%${search}%`);
            });
          }
        })
        .orderBy(finalSortBy, finalSortDir)
        .limit(pageSize)
        .offset((page - 1) * pageSize);

      const totalQuery = db("users")
        .count("id as count")
        .modify((qb) => {
          if (search) {
            qb.where((inner) => {
              inner.whereILike("name", `%${search}%`).orWhereILike("email", `%${search}%`);
            });
          }
        })
        .first();

      const [items, total] = await Promise.all([query, totalQuery]);
      return { items, total: Number(total?.count || 0) };
    },

    async create({ email, name, password_hash, inactive = false }) {
      const [user] = await db("users")
        .insert({ email, name, password_hash, inactive })
        .returning(["id", "email", "name", "inactive", "created_at", "updated_at"]);
      return user;
    },

    async update(id, { email, name, password_hash, inactive }) {
      const patch = { email, name, inactive };
      if (password_hash) patch.password_hash = password_hash;

      const [user] = await db("users")
        .where({ id })
        .update(patch)
        .returning(["id", "email", "name", "inactive", "created_at", "updated_at"]);
      return user;
    },

    async remove(id) {
      const [user] = await db("users")
        .where({ id })
        .del()
        .returning(["id", "email", "name", "inactive", "created_at", "updated_at"]);
      return user || null;
    },
  };
}
