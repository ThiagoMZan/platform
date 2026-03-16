exports.seed = async function seed(knex) {
  let adminRole = await knex("roles").where({ key: "admin" }).first();
  if (!adminRole) {
    const [created] = await knex("roles")
      .insert({ key: "admin", name: "Administradores", description: "Acesso total", inactive: false })
      .returning(["id", "key"]);
    adminRole = created;
  }

  const hasStar = await knex("role_permissions")
    .where({ role_id: adminRole.id, permission_key: "*" })
    .first();
  if (!hasStar) {
    await knex("role_permissions").insert({ role_id: adminRole.id, permission_key: "*" });
  }

  const adminUser = await knex("users").where({ email: process.env.SEED_ADMIN_EMAIL || "admin@example.com" }).first();
  if (!adminUser) return;

  const assigned = await knex("user_roles")
    .where({ user_id: adminUser.id, role_id: adminRole.id })
    .first();
  if (!assigned) {
    await knex("user_roles").insert({ user_id: adminUser.id, role_id: adminRole.id });
  }
};
