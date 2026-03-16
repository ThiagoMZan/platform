export function rolesRepo(db) {
  return {
    list() {
      return db("roles")
        .select("id", "key", "name", "description", "inactive", "created_at", "updated_at")
        .orderBy("name", "asc");
    },

    findById(id) {
      return db("roles")
        .where({ id })
        .select("id", "key", "name", "description", "inactive", "created_at", "updated_at")
        .first();
    },

    findByKey(key) {
      return db("roles").where({ key }).first();
    },

    findByKeyExcludingId(key, id) {
      return db("roles").where({ key }).whereNot({ id }).first();
    },

    async create({ key, name, description = null, inactive = false }) {
      const [role] = await db("roles")
        .insert({ key, name, description, inactive })
        .returning(["id", "key", "name", "description", "inactive", "created_at", "updated_at"]);
      return role;
    },

    async update(id, { key, name, description = null, inactive = false }) {
      const [role] = await db("roles")
        .where({ id })
        .update({ key, name, description, inactive })
        .returning(["id", "key", "name", "description", "inactive", "created_at", "updated_at"]);
      return role;
    },

    async remove(id) {
      const [role] = await db("roles")
        .where({ id })
        .del()
        .returning(["id", "key", "name", "description", "inactive", "created_at", "updated_at"]);
      return role || null;
    },

    async listByUserId(userId) {
      const rows = await db("user_roles as ur")
        .join("roles as r", "r.id", "ur.role_id")
        .where({ "ur.user_id": userId })
        .select("r.id", "r.key", "r.name", "r.description", "r.inactive")
        .orderBy("r.name", "asc");
      return rows;
    },

    async listRoleIdsByUserId(userId) {
      const rows = await db("user_roles")
        .where({ user_id: userId })
        .select("role_id");
      return rows.map((row) => row.role_id);
    },

    async replaceRolesForUser(userId, roleIds) {
      const uniqueIds = Array.from(new Set(roleIds || []));

      await db.transaction(async (trx) => {
        await trx("user_roles").where({ user_id: userId }).del();
        if (!uniqueIds.length) return;

        const rows = uniqueIds.map((roleId) => ({
          user_id: userId,
          role_id: roleId,
        }));
        await trx("user_roles").insert(rows);
      });
    },
  };
}
