exports.up = async function up() {
  // Compat stub: this migration already ran in existing databases, but the
  // original file was removed after the cases module was dropped.
};

exports.down = async function down() {
  // Intentionally empty. The original migration is retired and kept here only
  // so Knex can reconcile the recorded migration history.
};
