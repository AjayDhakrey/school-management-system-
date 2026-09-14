import "dotenv/config";
import pg from "pg";

if (process.env.DB_DRIVER !== "postgres" || !process.env.DATABASE_URL) throw new Error("Supabase PostgreSQL is not configured");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2 });
const one = async (text, params = []) => (await pool.query(text, params)).rows[0];

const identity = await one("select current_database() database, current_user username, inet_server_addr()::text server_address");
const migrations = await one("select count(*)::int count, min(version)::int minimum, max(version)::int maximum from schema_migrations");
const pgMigrations = await one("select count(*)::int count, bool_and(filename in ('001_baseline.sql','006_fees_payments.sql','007_fee_structure_identity.sql','008_exams_results.sql','009_legacy_exam_subject_mappings.sql')) as known, bool_or(filename='006_fees_payments.sql') as fees, bool_or(filename='007_fee_structure_identity.sql') as fee_identity, bool_or(filename='008_exams_results.sql') as exams_results, bool_or(filename='009_legacy_exam_subject_mappings.sql') as legacy_exam_mappings from pg_migrations");
const tables = await one("select count(*)::int count from information_schema.tables where table_schema='public' and table_type='BASE TABLE'");
const foreignKeys = await one("select count(*)::int count from information_schema.table_constraints where table_schema='public' and constraint_type='FOREIGN KEY'");
const uniqueConstraints = await one("select count(*)::int count from information_schema.table_constraints where table_schema='public' and constraint_type in ('UNIQUE','PRIMARY KEY')");
const indexes = await one("select count(*)::int count from pg_indexes where schemaname='public'");
const hashes = await one("select count(*)::int total, count(*) filter (where password_hash ~ '^\\$2[aby]\\$[0-9]{2}\\$')::int bcrypt from users");
const isolation = await one("select count(*)::int bad from users where (role='SUPER_ADMIN' and school_id is not null) or (role<>'SUPER_ADMIN' and school_id is null)");
const guardianOrphans = await one("select count(*)::int bad from student_guardians sg left join students s on s.id=sg.student_id and s.school_id=sg.school_id left join parents p on p.id=sg.parent_id and p.school_id=sg.school_id where s.id is null or p.id is null");
const employeeOrphans = await one("select (select count(*) from users u left join teachers t on t.id=u.linked_teacher_id and t.school_id=u.school_id where u.linked_teacher_id is not null and t.id is null) + (select count(*) from users u left join staff s on s.id=u.linked_staff_id and s.school_id=u.school_id where u.linked_staff_id is not null and s.id is null) as bad");

const feeTables = await one("select count(*)::int count from information_schema.tables where table_schema='public' and table_name in ('fee_structures','fees','fee_payments','fee_receipts')");
console.log(JSON.stringify({ identity, migrations, pgMigrations, tables, foreignKeys, uniqueConstraints, indexes, feeTables, hashes, isolation, guardianOrphans, employeeOrphans }, null, 2));
if (migrations.count !== 5 || migrations.minimum !== 1 || migrations.maximum !== 5 || !pgMigrations.fees || !pgMigrations.fee_identity || !pgMigrations.exams_results || !pgMigrations.legacy_exam_mappings || feeTables.count !== 4 || hashes.total !== hashes.bcrypt || Number(isolation.bad) || Number(guardianOrphans.bad) || Number(employeeOrphans.bad)) process.exitCode = 1;
await pool.end();
