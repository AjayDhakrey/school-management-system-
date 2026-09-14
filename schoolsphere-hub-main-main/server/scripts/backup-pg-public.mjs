import "dotenv/config";
import pg from "pg";
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}});
const client=await pool.connect();
const schema=`pre_sqlite_migration_${new Date().toISOString().replace(/[-:TZ.]/g,"").slice(0,14)}`;
try{
  await client.query("BEGIN");
  await client.query(`CREATE SCHEMA "${schema}"`);
  const {rows}=await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename");
  for(const {tablename} of rows) await client.query(`ALTER TABLE public."${tablename.replaceAll('"','')}" SET SCHEMA "${schema}"`);
  await client.query("COMMIT");
  console.log(`BACKUP_SCHEMA=${schema} TABLES=${rows.length}`);
}catch(error){await client.query("ROLLBACK");throw error}finally{client.release();await pool.end()}
