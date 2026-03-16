exports.up = async function up(knex) {
  await knex.schema.createTable("auth_login_attempts", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.string("attempted_email", 320).notNullable();
    t.uuid("user_id").nullable().references("id").inTable("users").onDelete("SET NULL");
    t.string("ip", 64).nullable();
    t.text("user_agent").nullable();
    t.string("failure_reason", 64).notNullable().defaultTo("invalid_credentials");
    t.timestamp("blocked_until", { useTz: true }).nullable();
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.raw(`CREATE INDEX IF NOT EXISTS idx_auth_login_attempts_email_created_at ON auth_login_attempts(attempted_email, created_at DESC);`);
  await knex.schema.raw(`CREATE INDEX IF NOT EXISTS idx_auth_login_attempts_blocked_until ON auth_login_attempts(blocked_until);`);

  await knex.schema.createTable("user_password_history", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("user_id").notNullable().references("id").inTable("users").onDelete("CASCADE");
    t.text("password_hash").notNullable();
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.raw(`CREATE INDEX IF NOT EXISTS idx_user_password_history_user_id_created_at ON user_password_history(user_id, created_at DESC);`);

  await knex.schema.createTable("auth_logins", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("user_id").notNullable().references("id").inTable("users").onDelete("CASCADE");
    t.string("session_id", 128).notNullable().references("id").inTable("sessions");
    t.string("email", 320).notNullable();
    t.string("ip", 64).nullable();
    t.text("user_agent").nullable();
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("revoked_at", { useTz: true }).nullable();
  });

  await knex.schema.raw(`CREATE INDEX IF NOT EXISTS idx_auth_logins_user_id_created_at ON auth_logins(user_id, created_at DESC);`);
  await knex.schema.raw(`CREATE INDEX IF NOT EXISTS idx_auth_logins_session_id ON auth_logins(session_id);`);

  await knex.raw(`
    INSERT INTO user_password_history (user_id, password_hash, created_at)
    SELECT u.id, u.password_hash, u.created_at
    FROM users u
    WHERE u.password_hash IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM user_password_history uph
        WHERE uph.user_id = u.id
      )
  `);
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists("auth_logins");
  await knex.schema.dropTableIfExists("user_password_history");
  await knex.schema.dropTableIfExists("auth_login_attempts");
};
