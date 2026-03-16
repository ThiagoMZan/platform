exports.up = async function up(knex) {
  await knex.schema.createTable("sessions", (t) => {
    t.string("id", 128).primary();
    t.uuid("user_id").notNullable().references("id").inTable("users").onDelete("CASCADE");
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("expires_at", { useTz: true }).notNullable();
    t.string("ip", 64).nullable();
    t.text("user_agent").nullable();
    t.timestamp("revoked_at", { useTz: true }).nullable();
  });

  await knex.schema.raw(`CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);`);
  await knex.schema.raw(`CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);`);
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists("sessions");
};
