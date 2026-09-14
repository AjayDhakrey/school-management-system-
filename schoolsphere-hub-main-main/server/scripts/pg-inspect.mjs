import "dotenv/config";
import pg from "pg";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const { rows } = await pool.query(`
  SELECT table_name, column_name, data_type, udt_name
  FROM information_schema.columns
  WHERE table_schema='public'
    AND table_name = ANY($1)
    AND column_name = ANY($2)
  ORDER BY table_name, column_name
`, [["classes","rooms","students","academic_years","teachers","staff"], ["id","room_id","academic_year_id","employee_id"]]);
console.log(rows);
const tables = (await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name")).rows;
for (const { table_name } of tables) {
  const count = await pool.query(`SELECT count(*)::int AS count FROM "${table_name.replaceAll('"','')}"`);
  console.log(`COUNT ${table_name}=${count.rows[0].count}`);
}
await pool.end();
