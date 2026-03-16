const fs = require("node:fs");
const path = require("node:path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

function listModuleDbDirectories(relativePath) {
  const rootModulesDir = path.resolve(__dirname, "..", "..", "platform-modules");
  const directories = [];

  if (!fs.existsSync(rootModulesDir)) {
    return directories;
  }

  const moduleNames = fs
    .readdirSync(rootModulesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  for (const moduleName of moduleNames) {
    const targetDir = path.join(rootModulesDir, moduleName, "api", relativePath);
    if (!fs.existsSync(targetDir)) continue;
    directories.push(targetDir);
  }

  return directories;
}

const migrationDirectories = [
  path.join(__dirname, "db/migrations"),
  ...listModuleDbDirectories(path.join("db", "migrations")),
];

const seedDirectories = [
  path.join(__dirname, "db/seeds"),
  ...listModuleDbDirectories(path.join("db", "seeds")),
];

module.exports = {
  development: {
    client: "pg",
    connection: process.env.DATABASE_URL,
    migrations: {
      directory: migrationDirectories,
    },
    seeds: {
      directory: seedDirectories,
    },
  },
};
