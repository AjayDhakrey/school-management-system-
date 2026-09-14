import "dotenv/config";
import pg from "pg";
const id = process.argv[2];
if (!id) throw new Error("record id required");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 1 });
const result = await pool.query("SELECT id, name FROM parents WHERE id = $1", [id]);
console.log(JSON.stringify({ existsInSupabase: result.rowCount === 1, id: result.rows[0]?.id }));
await pool.end();
if (result.rowCount !== 1) process.exitCode = 1;
