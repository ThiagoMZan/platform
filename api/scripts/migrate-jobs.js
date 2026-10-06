import { makeWorkerUtils } from "graphile-worker";

import { config } from "../src/config.js";

const workerUtils = await makeWorkerUtils({
  connectionString: config.DATABASE_URL,
});

try {
  await workerUtils.migrate();
  console.log("Graphile Worker schema is up to date.");
} finally {
  await workerUtils.release();
}
