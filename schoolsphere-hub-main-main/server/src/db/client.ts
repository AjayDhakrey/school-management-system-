import { config } from "../config.js";
import { AsyncLocalStorage } from "node:async_hooks";
import type { PoolClient, QueryResultRow } from "pg";
import { closePool, getPool, pingDatabase } from "./pg.js";

interface TransactionContext { client: PoolClient; active: boolean }
const transactionContext = new AsyncLocalStorage<TransactionContext>();

function currentClient() {
  const context = transactionContext.getStore();
  return context?.active ? context.client : undefined;
}

function postgresSql(input: string): string {
  let index = 0;
  let sql = input.replace(/\?/g, () => `$${++index}`)
    .replace(/datetime\('now'\)/gi, "app_now()")
    .replace(/date\('now'\)/gi, "to_char(current_date, 'YYYY-MM-DD')")
    .replace(/\bIS\s+(\$\d+)/gi, "IS NOT DISTINCT FROM $1")
    .replace(/(\$\d+)\s+IS\s+NOT\s+NULL/gi, "$1::text IS NOT NULL")
    .replace(/\bCOLLATE NOCASE\b/gi, "");
  if (/^\s*INSERT\s+OR\s+IGNORE\s+/i.test(sql)) {
    sql = sql.replace(/^\s*INSERT\s+OR\s+IGNORE\s+/i, "INSERT ");
    if (!/\bON\s+CONFLICT\b/i.test(sql)) sql += " ON CONFLICT DO NOTHING";
  }
  return sql;
}

export async function initializeDatabase() {
  if (config.dbDriver !== "postgres") throw new Error("Supabase PostgreSQL is required; SQLite fallback is disabled");
  await pingDatabase();
}
export async function closeDatabase() { await closePool(); }

export const db = {
  async transaction<T>(work: () => Promise<T>): Promise<T> {
    const client = await getPool().connect();
    const context: TransactionContext = { client, active: true };
    try {
      await client.query("BEGIN");
      const result = await transactionContext.run(context, work);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      context.active = false;
      client.release();
    }
  },
  prepare(sql: string) {
    const text = postgresSql(sql);
    return {
      async all<T extends QueryResultRow = QueryResultRow>(...params: unknown[]) {
        const runner = currentClient() ?? getPool();
        return (await runner.query<T>(text, params)).rows;
      },
      async get<T extends QueryResultRow = QueryResultRow>(...params: unknown[]) {
        const runner = currentClient() ?? getPool();
        return (await runner.query<T>(text, params)).rows[0];
      },
      async run(...params: unknown[]) {
        const runner = currentClient() ?? getPool();
        return { changes: (await runner.query(text, params)).rowCount ?? 0 };
      },
    };
  },
  async exec(sql: string) {
    if (/^\s*BEGIN(?:\s+IMMEDIATE)?\s*;?\s*$/i.test(sql)) {
      if (currentClient()) throw new Error("Nested transactions are not supported");
      const client = await getPool().connect();
      try {
        await client.query("BEGIN");
        transactionContext.enterWith({ client, active: true });
        return 0;
      } catch (error) {
        client.release();
        throw error;
      }
    }
    const context = transactionContext.getStore();
    const client = context?.active ? context.client : undefined;
    if (/^\s*(COMMIT|ROLLBACK)\s*;?\s*$/i.test(sql)) {
      if (!client) throw new Error("No active transaction");
      try {
        await client.query(/^\s*COMMIT/i.test(sql) ? "COMMIT" : "ROLLBACK");
        return 0;
      } finally {
        context!.active = false;
        client.release();
      }
    }
    const runner = client ?? getPool();
    return (await runner.query(postgresSql(sql))).rowCount ?? 0;
  },
};
