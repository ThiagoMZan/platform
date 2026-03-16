import { z } from "zod";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "..", ".env") });
const defaultFilesLocalDir = path.resolve(__dirname, "..", "..", "storage", "files");

function envBoolean(defaultValue = false) {
  return z.preprocess((value) => {
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value !== 0;
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (["true", "1", "yes", "on"].includes(normalized)) return true;
      if (["false", "0", "no", "off", ""].includes(normalized)) return false;
    }
    return value;
  }, z.boolean().default(defaultValue));
}

function envPath(defaultValue) {
  return z.preprocess((value) => {
    const raw = String(value || "").trim();
    const input = raw || defaultValue;
    return path.isAbsolute(input) ? input : path.resolve(__dirname, "..", input);
  }, z.string().min(1));
}

const schema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.string().default("info"),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default("redis://localhost:6379"),

  CORS_ORIGIN: z.string().default("http://localhost:5173"),

  SESSION_COOKIE_NAME: z.string().default("sid"),
  SESSION_COOKIE_SECURE: envBoolean(false),
  SESSION_COOKIE_SAMESITE: z.enum(["lax", "strict", "none"]).default("lax"),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(14),

  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),
  RATE_LIMIT_TIME_WINDOW_MS: z.coerce.number().int().positive().default(60000),

  SCHEDULER_ENABLED: envBoolean(false),
  SCHEDULER_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(5000),
  SCHEDULER_BATCH_SIZE: z.coerce.number().int().positive().default(5),

  FILES_STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  FILES_LOCAL_DIR: envPath(defaultFilesLocalDir),

  API_CLIENT_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(60),
});

export const config = schema.parse(process.env);
