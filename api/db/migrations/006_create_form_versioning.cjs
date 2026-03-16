exports.up = async function up(knex) {
  await knex.schema.createTable("form_versions", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.string("form_key", 120).notNullable().references("key").inTable("forms").onDelete("CASCADE");
    t.integer("version").notNullable();
    t.string("name", 200).notNullable();
    t.string("entity_key", 120).notNullable();
    t.jsonb("schema").notNullable().defaultTo("{}");
    t.string("permission_read", 120).notNullable();
    t.string("permission_write", 120).notNullable();
    t.string("permission_delete", 120).notNullable();
    t.uuid("created_by").nullable().references("id").inTable("users").onDelete("SET NULL");
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.unique(["form_key", "version"]);
  });

  await knex.schema.raw(`CREATE INDEX IF NOT EXISTS idx_form_versions_form_key ON form_versions(form_key);`);

  await knex.schema.createTable("form_extension_versions", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("extension_id").notNullable().references("id").inTable("form_extensions").onDelete("CASCADE");
    t.integer("version").notNullable();
    t.integer("priority").notNullable().defaultTo(100);
    t.boolean("enabled").notNullable().defaultTo(true);
    t.jsonb("patches").notNullable().defaultTo("[]");
    t.uuid("created_by").nullable().references("id").inTable("users").onDelete("SET NULL");
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.unique(["extension_id", "version"]);
  });

  await knex.schema.raw(`CREATE INDEX IF NOT EXISTS idx_form_extension_versions_extension_id ON form_extension_versions(extension_id);`);

  await knex.raw(`
    INSERT INTO form_versions (
      id,
      form_key,
      version,
      name,
      entity_key,
      schema,
      permission_read,
      permission_write,
      permission_delete,
      created_by,
      created_at
    )
    SELECT
      uuid_generate_v4(),
      f.key,
      1,
      f.name,
      f.entity_key,
      f.schema,
      f.permission_read,
      f.permission_write,
      f.permission_delete,
      NULL,
      f.updated_at
    FROM forms f
    WHERE NOT EXISTS (
      SELECT 1 FROM form_versions fv WHERE fv.form_key = f.key
    )
  `);

  await knex.raw(`
    INSERT INTO form_extension_versions (
      id,
      extension_id,
      version,
      priority,
      enabled,
      patches,
      created_by,
      created_at
    )
    SELECT
      uuid_generate_v4(),
      fe.id,
      1,
      fe.priority,
      fe.enabled,
      fe.patches,
      NULL,
      fe.updated_at
    FROM form_extensions fe
    WHERE NOT EXISTS (
      SELECT 1 FROM form_extension_versions fev WHERE fev.extension_id = fe.id
    )
  `);
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists("form_extension_versions");
  await knex.schema.dropTableIfExists("form_versions");
};
