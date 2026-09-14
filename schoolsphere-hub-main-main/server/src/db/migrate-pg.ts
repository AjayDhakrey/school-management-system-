import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getPool, closePool } from "./pg.js";
import { config } from "../config.js";

/**
 * Explicit PostgreSQL migration runner — no PRAGMA, no SQLite behaviour.
 *
 *  - `pg_migrations(filename, applied_at)` records which numbered .sql files ran.
 *  - Files in ./migrations-pg/ named `NNN_name.sql` apply once, in numeric order.
 *  - Each file runs inside its own transaction (BEGIN/COMMIT, ROLLBACK on error).
 *  - `001_baseline.sql` is the collapsed end-state of SQLite v1..v5; after it
 *    applies, `schema_migrations` is back-filled with rows 1..5 so the logical
 *    history the app knows is preserved and nothing re-runs.
 */

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "migrations-pg");

const LOGICAL_HISTORY: [number, string][] = [
  [1, "baseline_schema_and_legacy_compatibility"],
  [2, "academic_structure_foundation"],
  [3, "student_admission_guardian_integrity"],
  [4, "teacher_staff_management"],
  [5, "attendance_integrity_and_context"],
];

export async function runPgMigrations() {
  if (config.dbDriver !== "postgres") {
    throw new Error(`runPgMigrations called with DB_DRIVER=${config.dbDriver}`);
  }
  const pool = getPool();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS pg_migrations (
      filename   text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  const applied = new Set(
    (await pool.query<{ filename: string }>("SELECT filename FROM pg_migrations")).rows.map((r) => r.filename),
  );

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d{3}_.+\.sql$/.test(f))
    .sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO pg_migrations (filename) VALUES ($1)", [file]);
      await client.query("COMMIT");
      console.log(`Applied ${file}`);
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw new Error(`Migration ${file} failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      client.release();
    }
  }

  // Preserve the logical v1..v5 history the application code expects.
  for (const [version, name] of LOGICAL_HISTORY) {
    await pool.query(
      "INSERT INTO schema_migrations (version, name) VALUES ($1, $2) ON CONFLICT (version) DO NOTHING",
      [version, name],
    );
  }

  const { rows } = await pool.query<{ version: number; name: string }>(
    "SELECT version, name FROM schema_migrations ORDER BY version",
  );
  console.log("schema_migrations:", rows.map((r) => `v${r.version}`).join(", "));
}

// CLI entry: `tsx src/db/migrate-pg.ts`
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("migrate-pg.ts") || process.argv[1]?.endsWith("migrate-pg.js")) {
  runPgMigrations()
    .then(() => {
      console.log(`PostgreSQL migrations complete.`);
      return closePool();
    })
    .catch((err) => {
      console.error("PostgreSQL migration failed:", err instanceof Error ? err.message : err);
      process.exitCode = 1;
      return closePool();
    });
}
