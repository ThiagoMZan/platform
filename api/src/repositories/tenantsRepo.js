export function tenantsRepo(db) {
  return {
    list() {
      return db("tenants").select("*").orderBy("created_at", "asc");
    },

    findById(id) {
      return db("tenants").where({ id }).first();
    },

    findBySlug(slug) {
      return db("tenants").where({ slug }).first();
    },

    async create({ slug, name }) {
      const [tenant] = await db("tenants")
        .insert({ slug, name })
        .returning(["id", "slug", "name", "created_at", "updated_at"]);
      return tenant;
    },
  };
}
