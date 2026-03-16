const argon2 = require("argon2");

exports.seed = async function seed(knex) {
  const email = process.env.SEED_ADMIN_EMAIL || "admin@example.com";
  const password = process.env.SEED_ADMIN_PASSWORD || "Admin@12345";
  const name = process.env.SEED_ADMIN_NAME || "Admin";

  const existing = await knex("users").where({ email }).first();
  if (existing) return;

  const password_hash = await argon2.hash(password);
  await knex("users").insert({
    email,
    name,
    password_hash,
    inactive: false,
  });
};
