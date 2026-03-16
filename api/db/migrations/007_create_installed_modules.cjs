exports.up = async function up(knex) {
  const hasTable = await knex.schema.hasTable("installed_modules");
  if (hasTable) return;

  await knex.schema.createTable("installed_modules", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("module_id").notNullable().references("id").inTable("modules").onDelete("CASCADE").unique();
    t.uuid("module_version_id").notNullable().references("id").inTable("module_versions").onDelete("CASCADE");
    t.boolean("enabled").notNullable().defaultTo(true);
    t.integer("order_override").nullable();
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.raw(`
    CREATE TRIGGER trg_installed_modules_updated_at
    BEFORE UPDATE ON installed_modules
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);
};

exports.down = async function down(knex) {
  await knex.schema.raw(`DROP TRIGGER IF EXISTS trg_installed_modules_updated_at ON installed_modules;`);
  await knex.schema.dropTableIfExists("installed_modules");
};
