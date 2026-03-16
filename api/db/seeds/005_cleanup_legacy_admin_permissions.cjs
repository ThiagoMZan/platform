exports.seed = async function seed(knex) {
  const rows = await knex("user_roles as ur")
    .join("roles as r", "r.id", "ur.role_id")
    .where({ "r.key": "admin" })
    .select("ur.user_id");

  const userIds = rows.map((row) => row.user_id);
  if (!userIds.length) return;

  await knex("user_permissions")
    .whereIn("user_id", userIds)
    .andWhere({ permission_key: "*" })
    .del();
};
