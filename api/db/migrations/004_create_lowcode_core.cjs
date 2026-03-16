exports.up = async function up(knex) {
  await knex.schema.createTable("permissions", (t) => {
    t.string("key", 120).primary();
    t.string("description", 255).nullable();
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable("user_permissions", (t) => {
    t.uuid("user_id").notNullable().references("id").inTable("users").onDelete("CASCADE");
    t.string("permission_key", 120).notNullable().references("key").inTable("permissions").onDelete("CASCADE");
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.primary(["user_id", "permission_key"]);
  });

  await knex.schema.createTable("forms", (t) => {
    t.string("key", 120).primary();
    t.string("name", 200).notNullable();
    t.string("entity_key", 120).notNullable();
    t.jsonb("schema").notNullable().defaultTo("{}");
    t.string("permission_read", 120).notNullable();
    t.string("permission_write", 120).notNullable();
    t.string("permission_delete", 120).notNullable();
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.raw(`
    CREATE TRIGGER trg_forms_updated_at
    BEFORE UPDATE ON forms
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  await knex.schema.createTable("form_extensions", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("tenant_id").nullable().references("id").inTable("tenants").onDelete("CASCADE");
    t.string("module_key", 120).notNullable();
    t.string("form_key", 120).notNullable().references("key").inTable("forms").onDelete("CASCADE");
    t.integer("priority").notNullable().defaultTo(100);
    t.boolean("enabled").notNullable().defaultTo(true);
    t.jsonb("patches").notNullable().defaultTo("[]");
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.raw(`
    CREATE TRIGGER trg_form_extensions_updated_at
    BEFORE UPDATE ON form_extensions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  await knex.schema.raw(`CREATE INDEX IF NOT EXISTS idx_form_extensions_form_key ON form_extensions(form_key);`);
  await knex.schema.raw(`CREATE INDEX IF NOT EXISTS idx_form_extensions_tenant_id ON form_extensions(tenant_id);`);

  await knex.schema.createTable("entity_records", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("tenant_id").nullable().references("id").inTable("tenants").onDelete("SET NULL");
    t.string("entity_key", 120).notNullable();
    t.jsonb("data").notNullable().defaultTo("{}");
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.raw(`
    CREATE TRIGGER trg_entity_records_updated_at
    BEFORE UPDATE ON entity_records
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  await knex.schema.raw(`CREATE INDEX IF NOT EXISTS idx_entity_records_entity_key ON entity_records(entity_key);`);
  await knex.schema.raw(`CREATE INDEX IF NOT EXISTS idx_entity_records_tenant_id ON entity_records(tenant_id);`);
};

exports.down = async function down(knex) {
  await knex.schema.raw(`DROP TRIGGER IF EXISTS trg_entity_records_updated_at ON entity_records;`);
  await knex.schema.raw(`DROP TRIGGER IF EXISTS trg_form_extensions_updated_at ON form_extensions;`);
  await knex.schema.raw(`DROP TRIGGER IF EXISTS trg_forms_updated_at ON forms;`);
  await knex.schema.dropTableIfExists("entity_records");
  await knex.schema.dropTableIfExists("form_extensions");
  await knex.schema.dropTableIfExists("forms");
  await knex.schema.dropTableIfExists("user_permissions");
  await knex.schema.dropTableIfExists("permissions");
};
