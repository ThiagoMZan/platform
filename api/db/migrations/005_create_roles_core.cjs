exports.up = async function up(knex) {
  await knex.schema.createTable("roles", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.string("key", 120).notNullable().unique();
    t.string("name", 200).notNullable();
    t.string("description", 255).nullable();
    t.boolean("inactive").notNullable().defaultTo(false);
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.raw(`
    CREATE TRIGGER trg_roles_updated_at
    BEFORE UPDATE ON roles
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  await knex.schema.createTable("role_permissions", (t) => {
    t.uuid("role_id").notNullable().references("id").inTable("roles").onDelete("CASCADE");
    t.string("permission_key", 120).notNullable().references("key").inTable("permissions").onDelete("CASCADE");
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.primary(["role_id", "permission_key"]);
  });

  await knex.schema.createTable("user_roles", (t) => {
    t.uuid("user_id").notNullable().references("id").inTable("users").onDelete("CASCADE");
    t.uuid("role_id").notNullable().references("id").inTable("roles").onDelete("CASCADE");
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.primary(["user_id", "role_id"]);
  });

  await knex.schema.raw(`CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);`);
  await knex.schema.raw(`CREATE INDEX IF NOT EXISTS idx_user_roles_role_id ON user_roles(role_id);`);
};

exports.down = async function down(knex) {
  await knex.schema.raw(`DROP TRIGGER IF EXISTS trg_roles_updated_at ON roles;`);
  await knex.schema.dropTableIfExists("user_roles");
  await knex.schema.dropTableIfExists("role_permissions");
  await knex.schema.dropTableIfExists("roles");
};
