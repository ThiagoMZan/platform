import knex from "knex";
import { config } from "../config.js";

export function createKnex() {
  return knex({
    client: "pg",
    connection: config.DATABASE_URL,
    pool: { min: 0, max: 10 },
  });
}
