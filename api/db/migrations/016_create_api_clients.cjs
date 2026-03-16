exports.up = async function up(knex) {
  await knex.schema.createTable("api_clients", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.string("name", 200).notNullable();
    t.text("description").nullable();
    t.string("client_key", 120).notNullable().unique();
    t.text("client_secret_hash").notNullable();
    t.boolean("active").notNullable().defaultTo(true);
    t.uuid("owner_user_id").nullable().references("id").inTable("users").onDelete("SET NULL");
    t.timestamp("last_used_at", { useTz: true }).nullable();
    t.timestamp("expires_at", { useTz: true }).nullable();
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.raw(`
    CREATE TRIGGER trg_api_clients_updated_at
    BEFORE UPDATE ON api_clients
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  await knex.schema.createTable("api_client_permissions", (t) => {
    t.uuid("api_client_id").notNullable().references("id").inTable("api_clients").onDelete("CASCADE");
    t.string("permission_key", 120).notNullable().references("key").inTable("permissions").onDelete("CASCADE");
    t.primary(["api_client_id", "permission_key"]);
  });

  await knex.schema.createTable("api_client_tokens", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("api_client_id").notNullable().references("id").inTable("api_clients").onDelete("CASCADE");
    t.string("token_hash", 128).notNullable().unique();
    t.timestamp("expires_at", { useTz: true }).notNullable();
    t.timestamp("last_used_at", { useTz: true }).nullable();
    t.timestamp("revoked_at", { useTz: true }).nullable();
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable("api_client_auth_log", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("api_client_id").nullable().references("id").inTable("api_clients").onDelete("SET NULL");
    t.uuid("user_id").nullable().references("id").inTable("users").onDelete("SET NULL");
    t.string("event_type", 40).notNullable();
    t.string("ip", 64).nullable();
    t.text("user_agent").nullable();
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists("api_client_auth_log");
  await knex.schema.dropTableIfExists("api_client_tokens");
  await knex.schema.dropTableIfExists("api_client_permissions");
  await knex.schema.raw(`DROP TRIGGER IF EXISTS trg_api_clients_updated_at ON api_clients;`);
  await knex.schema.dropTableIfExists("api_clients");
};
