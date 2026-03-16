exports.up = async function up(knex) {
  const hasColumn = await knex.schema.hasColumn("audit_log", "api_client_id");
  if (!hasColumn) {
    await knex.schema.alterTable("audit_log", (t) => {
      t.uuid("api_client_id").nullable().references("id").inTable("api_clients").onDelete("SET NULL");
    });
  }

  await knex.schema.raw(`
    CREATE INDEX IF NOT EXISTS idx_audit_log_api_client_id_created_at
    ON audit_log(api_client_id, created_at DESC);
  `);

  await knex.schema.raw(`
    CREATE OR REPLACE FUNCTION write_audit_log()
    RETURNS TRIGGER AS $$
    DECLARE
      v_user_id uuid;
      v_session_id text;
      v_api_client_id uuid;
      v_old_data jsonb;
      v_new_data jsonb;
      v_record_pk text;
    BEGIN
      v_user_id := NULLIF(current_setting('app.user_id', true), '')::uuid;
      v_session_id := NULLIF(current_setting('app.session_id', true), '');
      v_api_client_id := NULLIF(current_setting('app.api_client_id', true), '')::uuid;

      IF (TG_OP = 'INSERT') THEN
        v_new_data := to_jsonb(NEW);
        v_record_pk := v_new_data ->> 'id';

        INSERT INTO audit_log (table_name, operation, record_pk, user_id, session_id, api_client_id, old_data, new_data)
        VALUES (TG_TABLE_NAME, TG_OP, v_record_pk, v_user_id, v_session_id, v_api_client_id, NULL, v_new_data);

        RETURN NEW;
      END IF;

      IF (TG_OP = 'UPDATE') THEN
        v_old_data := to_jsonb(OLD);
        v_new_data := to_jsonb(NEW);
        v_record_pk := COALESCE(v_new_data ->> 'id', v_old_data ->> 'id');

        INSERT INTO audit_log (table_name, operation, record_pk, user_id, session_id, api_client_id, old_data, new_data)
        VALUES (TG_TABLE_NAME, TG_OP, v_record_pk, v_user_id, v_session_id, v_api_client_id, v_old_data, v_new_data);

        RETURN NEW;
      END IF;

      IF (TG_OP = 'DELETE') THEN
        v_old_data := to_jsonb(OLD);
        v_record_pk := v_old_data ->> 'id';

        INSERT INTO audit_log (table_name, operation, record_pk, user_id, session_id, api_client_id, old_data, new_data)
        VALUES (TG_TABLE_NAME, TG_OP, v_record_pk, v_user_id, v_session_id, v_api_client_id, v_old_data, NULL);

        RETURN OLD;
      END IF;

      RETURN NULL;
    END;
    $$ LANGUAGE plpgsql;
  `);
};

exports.down = async function down(knex) {
  await knex.schema.raw(`DROP INDEX IF EXISTS idx_audit_log_api_client_id_created_at;`);
  const hasColumn = await knex.schema.hasColumn("audit_log", "api_client_id");
  if (hasColumn) {
    await knex.schema.alterTable("audit_log", (t) => {
      t.dropColumn("api_client_id");
    });
  }
};
