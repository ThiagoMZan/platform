exports.up = async function up(knex) {
  await knex.schema.raw(`CREATE SCHEMA IF NOT EXISTS crm;`);

  await knex.schema.raw(`DROP TRIGGER IF EXISTS trg_people_audit_log ON people;`);
  await knex.schema.raw(`DROP TRIGGER IF EXISTS trg_people_updated_at ON people;`);
  await knex.schema.raw(`DROP TRIGGER IF EXISTS trg_audience_types_updated_at ON audience_types;`);

  await knex.schema.raw(`ALTER TABLE IF EXISTS public.people SET SCHEMA crm;`);
  await knex.schema.raw(`ALTER TABLE IF EXISTS public.audience_types SET SCHEMA crm;`);

  await knex.schema.raw(`
    DROP INDEX IF EXISTS public.idx_people_person_type;
    DROP INDEX IF EXISTS public.idx_people_audience_type_id;
  `);

  await knex.schema.raw(`
    CREATE TRIGGER trg_audience_types_updated_at
    BEFORE UPDATE ON crm.audience_types
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  await knex.schema.raw(`
    CREATE TRIGGER trg_people_updated_at
    BEFORE UPDATE ON crm.people
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  await knex.schema.raw(`
    CREATE INDEX IF NOT EXISTS idx_people_person_type ON crm.people(person_type);
  `);

  await knex.schema.raw(`
    CREATE INDEX IF NOT EXISTS idx_people_audience_type_id ON crm.people(audience_type_id);
  `);

  await knex.schema.raw(`
    CREATE TRIGGER trg_people_audit_log
    AFTER INSERT OR UPDATE OR DELETE ON crm.people
    FOR EACH ROW EXECUTE FUNCTION write_audit_log();
  `);
};

exports.down = async function down(knex) {
  await knex.schema.raw(`DROP TRIGGER IF EXISTS trg_people_audit_log ON crm.people;`);
  await knex.schema.raw(`DROP TRIGGER IF EXISTS trg_people_updated_at ON crm.people;`);
  await knex.schema.raw(`DROP TRIGGER IF EXISTS trg_audience_types_updated_at ON crm.audience_types;`);

  await knex.schema.raw(`ALTER TABLE IF EXISTS crm.people SET SCHEMA public;`);
  await knex.schema.raw(`ALTER TABLE IF EXISTS crm.audience_types SET SCHEMA public;`);

  await knex.schema.raw(`
    DROP INDEX IF EXISTS crm.idx_people_person_type;
    DROP INDEX IF EXISTS crm.idx_people_audience_type_id;
  `);

  await knex.schema.raw(`
    CREATE TRIGGER trg_audience_types_updated_at
    BEFORE UPDATE ON public.audience_types
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  await knex.schema.raw(`
    CREATE TRIGGER trg_people_updated_at
    BEFORE UPDATE ON public.people
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  await knex.schema.raw(`
    CREATE INDEX IF NOT EXISTS idx_people_person_type ON public.people(person_type);
  `);

  await knex.schema.raw(`
    CREATE INDEX IF NOT EXISTS idx_people_audience_type_id ON public.people(audience_type_id);
  `);

  await knex.schema.raw(`
    CREATE TRIGGER trg_people_audit_log
    AFTER INSERT OR UPDATE OR DELETE ON public.people
    FOR EACH ROW EXECUTE FUNCTION write_audit_log();
  `);

  await knex.schema.raw(`DROP SCHEMA IF EXISTS crm;`);
};

