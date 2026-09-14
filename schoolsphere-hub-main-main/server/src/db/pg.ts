import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { config } from "../config.js";

/**
 * PostgreSQL access layer for the Supabase migration.
 *
 * The backend was written against node:sqlite's *synchronous* API. Postgres is
 * async, so route handlers `await` these helpers. Query text keeps `$1,$2,...`
 * placeholders (Postgres native) — no `?` rewriting.
 *
 * One shared pool. Transactions check out ONE client and run every statement on
 * it (never across pooled connections) — see withTransaction().
 */

let pool: Pool | undefined;

export function getPool(): Pool {
  if (!pool) {
    if (!config.databaseUrl) {
      throw new Error("DATABASE_URL is required when DB_DRIVER=postgres");
    }
    pool = new Pool({
      connectionString: config.databaseUrl,
      // Supabase requires TLS. `no-verify` matches the Supabase-issued cert chain
      // without shipping the CA bundle; set PGSSLROOTCERT + ssl.ca to pin it.
      ssl: config.databaseSsl ? { rejectUnauthorized: false } : undefined,
      max: config.pgPoolMax,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      application_name: "schoolsphere-api",
    });
    pool.on("error", (err) => {
      // A pooled idle client errored (e.g. Supabase restarted). Log without leaking the DSN.
      console.error("Postgres pool error:", err.message);
    });
  }
  return pool;
}

/** Runs a query on the shared pool. */
export async function query<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []) {
  const result = await getPool().query<T>(text, params as unknown[]);
  return result.rows;
}

/** First row or undefined. */
export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
) {
  const rows = await query<T>(text, params);
  return rows[0];
}

/** Fire-and-check a write; returns affected row count. */
export async function execute(text: string, params: unknown[] = []) {
  const result = await getPool().query(text, params as unknown[]);
  return result.rowCount ?? 0;
}

/**
 * Runs `fn` inside a single-connection transaction: BEGIN → fn(tx) → COMMIT,
 * or ROLLBACK on any throw. `tx` exposes the same helpers bound to that one client.
 */
export interface Tx {
  query<T extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]): Promise<T[]>;
  queryOne<T extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]): Promise<T | undefined>;
  execute(text: string, params?: unknown[]): Promise<number>;
}

export async function withTransaction<R>(fn: (tx: Tx) => Promise<R>) {
  const client: PoolClient = await getPool().connect();
  const tx: Tx = {
    async query(text, params = []) {
      return (await client.query(text, params as unknown[])).rows as never;
    },
    async queryOne(text, params = []) {
      return (await client.query(text, params as unknown[])).rows[0] as never;
    },
    async execute(text, params = []) {
      return (await client.query(text, params as unknown[])).rowCount ?? 0;
    },
  };
  try {
    await client.query("BEGIN");
    const result = await fn(tx);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* connection already broken */
    }
    throw err;
  } finally {
    client.release();
  }
}

/** Health probe — cheap round-trip. Throws on failure; caller maps to 503. */
export async function pingDatabase() {
  await getPool().query("SELECT 1");
}

export async function closePool() {
  await pool?.end();
  pool = undefined;
}
