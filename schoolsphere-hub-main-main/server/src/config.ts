import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { SignOptions } from "jsonwebtoken";

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nodeEnv = process.env.NODE_ENV?.trim() || "development";
const parsedPort = Number(process.env.PORT ?? 4000);

if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
  throw new Error(`Invalid PORT: ${process.env.PORT ?? ""}. Expected an integer from 1 to 65535.`);
}

const configuredJwtSecret = process.env.JWT_SECRET?.trim();
const unsafeProductionSecrets = new Set(["dev-secret-change-me", "replace-with-a-long-random-secret"]);
if (
  nodeEnv === "production" &&
  (!configuredJwtSecret || configuredJwtSecret.length < 32 || unsafeProductionSecrets.has(configuredJwtSecret))
) {
  throw new Error("JWT_SECRET must be set to a strong, non-default value in production.");
}

const jwtExpiresIn = process.env.JWT_EXPIRES_IN?.trim() || "2h";
if (!/^\d+(ms|s|m|h|d|w|y)?$/.test(jwtExpiresIn)) {
  throw new Error(`Invalid JWT_EXPIRES_IN: ${jwtExpiresIn}`);
}

const configuredDatabasePath = process.env.DATABASE_PATH ?? process.env.DB_PATH;
const corsOrigins = (process.env.CORS_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
if (nodeEnv === "production" && corsOrigins.length === 0) {
  throw new Error("CORS_ORIGINS must list at least one allowed frontend origin in production.");
}

// Supabase PostgreSQL is the normal runtime. SQLite remains available only when explicitly
// selected for offline backup tooling; the application never silently falls back to it.
const dbDriver = (process.env.DB_DRIVER?.trim().toLowerCase() || "postgres") as "sqlite" | "postgres";
if (!["sqlite", "postgres"].includes(dbDriver)) {
  throw new Error(`Invalid DB_DRIVER: ${dbDriver}. Expected "sqlite" or "postgres".`);
}
const databaseUrl = process.env.DATABASE_URL?.trim() || "";
if (dbDriver === "postgres" && !databaseUrl) {
  throw new Error("DB_DRIVER=postgres requires DATABASE_URL (the Supabase Postgres connection string).");
}
const databaseSsl = (process.env.DATABASE_SSL?.trim().toLowerCase() ?? "true") !== "false";
const pgPoolMax = Number(process.env.PG_POOL_MAX ?? 10);
if (!Number.isInteger(pgPoolMax) || pgPoolMax < 1 || pgPoolMax > 100) {
  throw new Error(`Invalid PG_POOL_MAX: ${process.env.PG_POOL_MAX}. Expected an integer from 1 to 100.`);
}

export const config = Object.freeze({
  nodeEnv,
  port: parsedPort,
  jwtSecret: configuredJwtSecret || "dev-secret-change-me",
  jwtExpiresIn: jwtExpiresIn as SignOptions["expiresIn"],
  databasePath: configuredDatabasePath
    ? path.resolve(configuredDatabasePath)
    : path.join(serverRoot, "data.sqlite3"),
  corsOrigins,
  dbDriver,
  databaseUrl,
  databaseSsl,
  pgPoolMax,
});

if (!configuredJwtSecret && nodeEnv !== "test") {
  console.warn("JWT_SECRET is not set; using the development-only default.");
}
