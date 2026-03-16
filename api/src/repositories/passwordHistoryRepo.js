export function passwordHistoryRepo(db) {
  return {
    create({ user_id, password_hash }) {
      return db("user_password_history").insert({ user_id, password_hash });
    },
  };
}
