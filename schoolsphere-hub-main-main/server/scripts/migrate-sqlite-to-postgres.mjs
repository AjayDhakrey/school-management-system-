/**
 * One-shot data migration: server/data.sqlite3  ->  Supabase PostgreSQL.
 *
 *   node scripts/migrate-sqlite-to-postgres.mjs [--dry-run] [--truncate]
 *
 * Requires DATABASE_URL (Supabase Postgres connection string) in env, and the
 * Postgres schema already created (npm run migrate:pg).
 *
 *  - Copies every table in foreign-key-safe order.
 *  - ids, timestamps (text) and 0/1 "booleans" are carried across verbatim.
 *  - Idempotent: ON CONFLICT DO NOTHING, so a re-run inserts only what's missing.
 *  - --truncate first empties the target tables (TRUNCATE ... CASCADE) for a clean redo.
 *  - Verifies row counts per table at the end; a mismatch exits non-zero.
 *
 * schema_migrations is intentionally skipped — migrate-pg.ts owns it.
 */
import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import pg from "pg";

const DRY = process.argv.includes("--dry-run");
const TRUNCATE = process.argv.includes("--truncate");
const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sqlitePath = process.env.SQLITE_SOURCE_PATH ?? path.join(serverRoot, "data.sqlite3");

// Foreign-key-safe insert order (parents before children).
const ORDER = [
  "schools", "plans", "announcements", "leads",
  "academic_years", "rooms", "subjects", "users", "teachers", "parents", "vehicles",
  "classes", "staff", "class_subjects", "students", "student_guardians",
  "admissions", "admission_documents", "admission_notes", "admission_status_history",
  "attendance", "teacher_attendance", "staff_attendance",
  "fees", "fee_structures", "exams", "results",
  "homework", "homework_submissions",
  "notices", "notice_reads", "notifications",
  "library_books", "library_records",
  "timetable_slots", "leave_requests", "certificates", "holidays",
  "audit_log", "school_role_permissions", "support_tickets", "payments", "plan_features",
];

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required (Supabase Postgres connection string).");
  process.exit(1);
}

const sqlite = new DatabaseSync(sqlitePath, { readOnly: true });
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: (process.env.DATABASE_SSL ?? "true") === "true" ? { rejectUnauthorized: false } : undefined,
  max: 4,
});

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

async function migrateTable(client, table) {
  const rows = sqlite.prepare(`SELECT * FROM ${table}`).all();
  if (rows.length === 0) return { table, source: 0, inserted: 0 };
  const cols = Object.keys(rows[0]);
  const colList = cols.map((c) => `"${c}"`).join(", ");
  let inserted = 0;

  for (const batch of chunk(rows, 200)) {
    const values = [];
    const placeholders = batch
      .map((row, r) => {
        const ph = cols.map((_, c) => `$${r * cols.length + c + 1}`);
        for (const col of cols) values.push(row[col]);
        return `(${ph.join(", ")})`;
      })
      .join(", ");
    if (DRY) {
      inserted += batch.length;
      continue;
    }
    const res = await client.query(
      `INSERT INTO ${table} (${colList}) VALUES ${placeholders} ON CONFLICT DO NOTHING`,
      values,
    );
    inserted += res.rowCount ?? 0;
  }
  return { table, source: rows.length, inserted };
}

async function main() {
  const client = await pool.connect();
  try {
    console.log(`Source : ${sqlitePath}`);
    console.log(`Target : ${process.env.DATABASE_URL.replace(/:[^:@/]+@/, ":****@")}`);
    console.log(DRY ? "MODE   : DRY RUN (no writes)\n" : "MODE   : LIVE\n");

    if (TRUNCATE && !DRY) {
      await client.query(`TRUNCATE ${ORDER.join(", ")} RESTART IDENTITY CASCADE`);
      console.log("Truncated target tables.\n");
    }

    await client.query("BEGIN");
    const results = [];
    for (const table of ORDER) {
      results.push(await migrateTable(client, table));
    }
    if (DRY) await client.query("ROLLBACK");
    else await client.query("COMMIT");

    console.log("table".padEnd(28), "sqlite".padStart(8), "loaded".padStart(8));
    let bad = 0;
    for (const r of results) {
      console.log(r.table.padEnd(28), String(r.source).padStart(8), String(r.inserted).padStart(8));
    }

    if (!DRY) {
      console.log("\nVerifying row counts in Postgres…");
      for (const table of ORDER) {
        const src = sqlite.prepare(`SELECT count(*) c FROM ${table}`).get().c;
        const dst = Number((await client.query(`SELECT count(*)::int c FROM ${table}`)).rows[0].c);
        const ok = dst >= src;
        if (!ok) bad++;
        console.log(`${ok ? "OK  " : "FAIL"} ${table.padEnd(26)} sqlite=${src} postgres=${dst}`);
      }
    }
    if (bad > 0) {
      console.error(`\n${bad} table(s) have fewer rows in Postgres than SQLite.`);
      process.exitCode = 1;
    } else {
      console.log(DRY ? "\nDry run complete." : "\nData migration complete — all tables reconcile.");
    }
  } finally {
    client.release();
    await pool.end();
    sqlite.close();
  }
}

main().catch((err) => {
  console.error("Data migration failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
