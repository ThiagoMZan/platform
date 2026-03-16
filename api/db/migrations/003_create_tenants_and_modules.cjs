exports.up = async function up(knex) {
  await knex.schema.createTable("tenants", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.string("slug", 120).notNullable().unique();
    t.string("name", 200).notNullable();
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.raw(`
    CREATE TRIGGER trg_tenants_updated_at
    BEFORE UPDATE ON tenants
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  await knex.schema.createTable("modules", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.string("key", 120).notNullable().unique();
    t.string("name", 200).notNullable();
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.raw(`
    CREATE TRIGGER trg_modules_updated_at
    BEFORE UPDATE ON modules
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  await knex.schema.createTable("module_versions", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("module_id").notNullable().references("id").inTable("modules").onDelete("CASCADE");
    t.string("version", 40).notNullable();
    t.integer("base_order").notNullable().defaultTo(100);
    t.jsonb("manifest").notNullable().defaultTo("{}");
    t.string("install_path", 500).notNullable();
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.unique(["module_id", "version"]);
  });

  await knex.schema.createTable("tenant_modules", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("tenant_id").notNullable().references("id").inTable("tenants").onDelete("CASCADE");
    t.uuid("module_version_id").notNullable().references("id").inTable("module_versions").onDelete("CASCADE");
    t.boolean("enabled").notNullable().defaultTo(true);
    t.integer("order_override").nullable();
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.unique(["tenant_id", "module_version_id"]);
  });

  await knex.schema.raw(`
    CREATE TRIGGER trg_tenant_modules_updated_at
    BEFORE UPDATE ON tenant_modules
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);
};

exports.down = async function down(knex) {
  await knex.schema.raw(`DROP TRIGGER IF EXISTS trg_tenant_modules_updated_at ON tenant_modules;`);
  await knex.schema.raw(`DROP TRIGGER IF EXISTS trg_modules_updated_at ON modules;`);
  await knex.schema.raw(`DROP TRIGGER IF EXISTS trg_tenants_updated_at ON tenants;`);
  await knex.schema.dropTableIfExists("tenant_modules");
  await knex.schema.dropTableIfExists("module_versions");
  await knex.schema.dropTableIfExists("modules");
  await knex.schema.dropTableIfExists("tenants");
};
