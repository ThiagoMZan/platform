exports.up = async function up(knex) {
  await knex.schema.createTable("audit_log", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.string("table_name", 128).notNullable();
    t.string("operation", 16).notNullable();
    t.string("record_pk", 128).nullable();
    t.uuid("user_id").nullable().references("id").inTable("users").onDelete("SET NULL");
    t.string("session_id", 128).nullable().references("id").inTable("sessions").onDelete("SET NULL");
    t.jsonb("old_data").nullable();
    t.jsonb("new_data").nullable();
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.raw(`
    CREATE INDEX IF NOT EXISTS idx_audit_log_table_name_created_at
    ON audit_log(table_name, created_at DESC);
  `);

  await knex.schema.raw(`
    CREATE INDEX IF NOT EXISTS idx_audit_log_table_name_record_pk_created_at
    ON audit_log(table_name, record_pk, created_at DESC);
  `);

  await knex.schema.raw(`
    CREATE INDEX IF NOT EXISTS idx_audit_log_user_id_created_at
    ON audit_log(user_id, created_at DESC);
  `);

  await knex.schema.raw(`
    CREATE INDEX IF NOT EXISTS idx_audit_log_session_id_created_at
    ON audit_log(session_id, created_at DESC);
  `);

  await knex.schema.raw(`
    CREATE OR REPLACE FUNCTION write_audit_log()
    RETURNS TRIGGER AS $$
    DECLARE
      v_user_id uuid;
      v_session_id text;
      v_old_data jsonb;
      v_new_data jsonb;
      v_record_pk text;
    BEGIN
      v_user_id := NULLIF(current_setting('app.user_id', true), '')::uuid;
      v_session_id := NULLIF(current_setting('app.session_id', true), '');

      IF (TG_OP = 'INSERT') THEN
        v_new_data := to_jsonb(NEW);
        v_record_pk := v_new_data ->> 'id';

        INSERT INTO audit_log (table_name, operation, record_pk, user_id, session_id, old_data, new_data)
        VALUES (TG_TABLE_NAME, TG_OP, v_record_pk, v_user_id, v_session_id, NULL, v_new_data);

        RETURN NEW;
      END IF;

      IF (TG_OP = 'UPDATE') THEN
        v_old_data := to_jsonb(OLD);
        v_new_data := to_jsonb(NEW);
        v_record_pk := COALESCE(v_new_data ->> 'id', v_old_data ->> 'id');

        INSERT INTO audit_log (table_name, operation, record_pk, user_id, session_id, old_data, new_data)
        VALUES (TG_TABLE_NAME, TG_OP, v_record_pk, v_user_id, v_session_id, v_old_data, v_new_data);

        RETURN NEW;
      END IF;

      IF (TG_OP = 'DELETE') THEN
        v_old_data := to_jsonb(OLD);
        v_record_pk := v_old_data ->> 'id';

        INSERT INTO audit_log (table_name, operation, record_pk, user_id, session_id, old_data, new_data)
        VALUES (TG_TABLE_NAME, TG_OP, v_record_pk, v_user_id, v_session_id, v_old_data, NULL);

        RETURN OLD;
      END IF;

      RETURN NULL;
    END;
    $$ LANGUAGE plpgsql;
  `);

  await knex.schema.raw(`
    CREATE TRIGGER trg_people_audit_log
    AFTER INSERT OR UPDATE OR DELETE ON people
    FOR EACH ROW EXECUTE FUNCTION write_audit_log();
  `);
};

exports.down = async function down(knex) {
  await knex.schema.raw(`DROP TRIGGER IF EXISTS trg_people_audit_log ON people;`);
  await knex.schema.raw(`DROP FUNCTION IF EXISTS write_audit_log();`);
  await knex.schema.dropTableIfExists("audit_log");
};
