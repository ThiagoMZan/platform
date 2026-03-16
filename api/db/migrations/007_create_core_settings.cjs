exports.up = async function up(knex) {
  await knex.schema.createTable("core_settings", (t) => {
    t.string("key", 120).primary();
    t.jsonb("value").notNullable().defaultTo("{}");
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.raw(`
    CREATE TRIGGER trg_core_settings_updated_at
    BEFORE UPDATE ON core_settings
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  await knex("core_settings")
    .insert({ key: "auth.session_ttl_minutes", value: { minutes: 30 } })
    .onConflict("key")
    .ignore();
};

exports.down = async function down(knex) {
  await knex.schema.raw(`DROP TRIGGER IF EXISTS trg_core_settings_updated_at ON core_settings;`);
  await knex.schema.dropTableIfExists("core_settings");
};

