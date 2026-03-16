exports.seed = async function seed(knex) {
  const slug = process.env.SEED_TENANT_SLUG || "default";
  const name = process.env.SEED_TENANT_NAME || "Default Tenant";

  const existing = await knex("tenants").where({ slug }).first();
  if (existing) return;

  await knex("tenants").insert({ slug, name });
};
