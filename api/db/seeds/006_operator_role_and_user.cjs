const argon2 = require("argon2");

exports.seed = async function seed(knex) {
  const operatorRoleKey = process.env.SEED_OPERATOR_ROLE_KEY || "operator";
  const operatorRoleName = process.env.SEED_OPERATOR_ROLE_NAME || "Operador";
  const operatorEmail = process.env.SEED_OPERATOR_EMAIL || "operator@example.com";
  const operatorPassword = process.env.SEED_OPERATOR_PASSWORD || "Operator@123";
  const operatorName = process.env.SEED_OPERATOR_NAME || "Operator";

  let operatorRole = await knex("roles").where({ key: operatorRoleKey }).first();
  if (!operatorRole) {
    const [createdRole] = await knex("roles")
      .insert({
        key: operatorRoleKey,
        name: operatorRoleName,
        description: "Acesso de operacao com leitura.",
        inactive: false,
      })
      .returning(["id", "key"]);
    operatorRole = createdRole;
  } else {
    await knex("roles").where({ id: operatorRole.id }).update({
      name: operatorRoleName,
      description: "Acesso de operacao com leitura.",
      inactive: false,
    });
  }

  const rolePerms = ["users.read", "forms.people.read"];
  for (const permissionKey of rolePerms) {
    const exists = await knex("role_permissions")
      .where({ role_id: operatorRole.id, permission_key: permissionKey })
      .first();
    if (!exists) {
      await knex("role_permissions").insert({ role_id: operatorRole.id, permission_key: permissionKey });
    }
  }

  const hash = await argon2.hash(operatorPassword);

  let operatorUser = await knex("users").where({ email: operatorEmail }).first();
  if (!operatorUser) {
    const [createdUser] = await knex("users")
      .insert({
        email: operatorEmail,
        name: operatorName,
        password_hash: hash,
        inactive: false,
      })
      .returning(["id", "email"]);
    operatorUser = createdUser;
  } else {
    await knex("users")
      .where({ id: operatorUser.id })
      .update({
        name: operatorName,
        password_hash: hash,
        inactive: false,
      });
  }

  const userRole = await knex("user_roles")
    .where({ user_id: operatorUser.id, role_id: operatorRole.id })
    .first();
  if (!userRole) {
    await knex("user_roles").insert({ user_id: operatorUser.id, role_id: operatorRole.id });
  }

  await knex("user_permissions").where({ user_id: operatorUser.id }).del();
};
