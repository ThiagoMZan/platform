exports.up = async function up(knex) {
  const hasPermissionsTable = await knex.schema.hasTable("permissions");
  if (!hasPermissionsTable) return;

  await knex("permissions")
    .where("key", "like", "cases.%")
    .del();
};

exports.down = async function down() {};
