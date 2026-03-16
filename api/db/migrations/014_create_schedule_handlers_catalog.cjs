exports.up = async function up(knex) {
  await knex.schema.withSchema("schedule").createTable("job_handlers", (t) => {
    t.string("key", 200).primary();
    t.string("module_key", 120).notNullable();
    t.string("label", 200).notNullable();
    t.text("description").nullable();
    t.boolean("active").notNullable().defaultTo(true);
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.raw(`
    CREATE TRIGGER trg_job_handlers_updated_at
    BEFORE UPDATE ON schedule.job_handlers
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  await knex.schema.alterTable("schedule.scheduled_jobs", (t) => {
    t.string("frequency", 20).nullable().alter();
  });

  await knex.schema.raw(`
    ALTER TABLE schedule.scheduled_jobs
    ADD CONSTRAINT scheduled_jobs_handler_key_unique UNIQUE (handler_key);
  `);

  await knex.schema.raw(`
    ALTER TABLE schedule.scheduled_jobs
    ADD CONSTRAINT scheduled_jobs_handler_key_fk
    FOREIGN KEY (handler_key)
    REFERENCES schedule.job_handlers(key)
    ON DELETE CASCADE;
  `);
};

exports.down = async function down(knex) {
  await knex.schema.raw(`ALTER TABLE schedule.scheduled_jobs DROP CONSTRAINT IF EXISTS scheduled_jobs_handler_key_fk;`);
  await knex.schema.raw(`ALTER TABLE schedule.scheduled_jobs DROP CONSTRAINT IF EXISTS scheduled_jobs_handler_key_unique;`);
  await knex.schema.alterTable("schedule.scheduled_jobs", (t) => {
    t.string("frequency", 20).notNullable().alter();
  });
  await knex.schema.raw(`DROP TRIGGER IF EXISTS trg_job_handlers_updated_at ON schedule.job_handlers;`);
  await knex.schema.withSchema("schedule").dropTableIfExists("job_handlers");
};

