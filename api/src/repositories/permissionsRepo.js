export function permissionsRepo(db) {
  function applyExcludedPrefixes(query, excludePrefixes = []) {
    const prefixes = Array.from(new Set((excludePrefixes || []).filter(Boolean)));
    for (const prefix of prefixes) {
      query.whereNot("key", "like", `${prefix}%`);
    }
    return query;
  }

  function applyExcludedKeys(query, excludeKeys = []) {
    const keys = Array.from(new Set((excludeKeys || []).filter(Boolean)));
    if (keys.length) {
      query.whereNotIn("key", keys);
    }
    return query;
  }

  return {
    async listCatalog({ excludePrefixes = [], excludeKeys = [] } = {}) {
      const query = db("permissions").select("key", "description", "created_at");
      applyExcludedPrefixes(query, excludePrefixes);
      applyExcludedKeys(query, excludeKeys);
      return query.orderBy("key", "asc");
    },

    findByKey(key) {
      return db("permissions").where({ key }).first();
    },

    async create({ key, description = null }) {
      const [created] = await db("permissions")
        .insert({ key, description })
        .returning(["key", "description", "created_at"]);
      return created;
    },

    async updateDescription(key, description = null) {
      const [updated] = await db("permissions")
        .where({ key })
        .update({ description })
        .returning(["key", "description", "created_at"]);
      return updated || null;
    },

    async remove(key) {
      const deletedCount = await db("permissions").where({ key }).del();
      return deletedCount > 0;
    },

    async listByUserId(userId) {
      const rows = await db("user_permissions")
        .where({ user_id: userId })
        .select("permission_key");
      return rows.map((row) => row.permission_key);
    },

    async listEffectiveByUserId(userId) {
      const directRows = await db("user_permissions")
        .where({ user_id: userId })
        .select("permission_key");

      const roleRows = await db("user_roles as ur")
        .join("role_permissions as rp", "rp.role_id", "ur.role_id")
        .where({ "ur.user_id": userId })
        .select("rp.permission_key");

      const adminRole = await db("user_roles as ur")
        .join("roles as r", "r.id", "ur.role_id")
        .where({ "ur.user_id": userId, "r.key": "admin" })
        .first("r.id");

      const keys = new Set([
        ...directRows.map((row) => row.permission_key),
        ...roleRows.map((row) => row.permission_key),
      ]);

      if (adminRole) {
        keys.add("*");
      }

      return Array.from(keys.values()).sort();
    },

    async listByRoleId(roleId) {
      const rows = await db("role_permissions")
        .where({ role_id: roleId })
        .select("permission_key");
      return rows.map((row) => row.permission_key);
    },

    async replaceForRole(roleId, permissionKeys) {
      const uniqueKeys = Array.from(new Set(permissionKeys || []));

      await db.transaction(async (trx) => {
        await trx("role_permissions").where({ role_id: roleId }).del();
        if (!uniqueKeys.length) return;

        const rows = uniqueKeys.map((key) => ({
          role_id: roleId,
          permission_key: key,
        }));
        await trx("role_permissions").insert(rows);
      });
    },

    async replaceForUser(userId, permissionKeys) {
      const uniqueKeys = Array.from(new Set(permissionKeys || []));

      await db.transaction(async (trx) => {
        await trx("user_permissions").where({ user_id: userId }).del();
        if (!uniqueKeys.length) return;

        const rows = uniqueKeys.map((key) => ({
          user_id: userId,
          permission_key: key,
        }));
        await trx("user_permissions").insert(rows);
      });
    },

    async userHasPermission(userId, permissionKey) {
      const effective = await this.listEffectiveByUserId(userId);
      return this.userHasPermissionInList(effective, permissionKey);
    },

    userHasPermissionInList(permissions, permissionKey) {
      if (!Array.isArray(permissions)) return false;
      if (permissions.includes("*")) return true;
      return permissions.includes(permissionKey);
    },
  };
}
