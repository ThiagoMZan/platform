export function apiClientPermissionsRepo(db) {
  return {
    async listByClientId(apiClientId) {
      const rows = await db("api_client_permissions")
        .where({ api_client_id: apiClientId })
        .select("permission_key");
      return rows.map((row) => row.permission_key).sort();
    },

    async replaceForClient(apiClientId, permissionKeys) {
      const uniqueKeys = Array.from(new Set(permissionKeys || []));

      await db.transaction(async (trx) => {
        await trx("api_client_permissions").where({ api_client_id: apiClientId }).del();
        if (!uniqueKeys.length) return;

        await trx("api_client_permissions").insert(
          uniqueKeys.map((permissionKey) => ({
            api_client_id: apiClientId,
            permission_key: permissionKey,
          }))
        );
      });
    },
  };
}
