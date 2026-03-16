exports.up = async function up(knex) {
  await knex.schema.createTable("files", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.string("file_name", 255).notNullable();
    t.string("content_type", 255).notNullable();
    t.bigInteger("size").notNullable();
    t.string("extension", 50).nullable();
    t.string("storage_driver", 50).notNullable();
    t.string("storage_path", 1024).notNullable();
    t.string("storage_bucket", 255).nullable();
    t.uuid("uploaded_by").nullable().references("id").inTable("users").onDelete("SET NULL");
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.alterTable("files", (t) => {
    t.index(["created_at"], "files_created_at_idx");
    t.index(["storage_driver", "storage_path"], "files_storage_lookup_idx");
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists("files");
};
