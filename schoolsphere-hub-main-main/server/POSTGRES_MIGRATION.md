# SQLite → Supabase PostgreSQL migration

Status: **foundation built & schema validated against Postgres 17. Runtime cutover
is blocked on one input from you: `DATABASE_URL`.**

The frontend and the JWT/bcrypt auth flow are unchanged. React → Express → DB only.
Supabase is being adopted as the **database provider**, not as an auth provider, and
the browser never talks to Supabase directly.

---

## 1. What is already done (in the repo now)

| File | Purpose |
|---|---|
| `src/db/migrations-pg/001_baseline.sql` | Full Postgres schema — the collapsed end-state of SQLite v1–v5. **Validated against real Postgres 17**: 44 tables, 85 indexes, 76 FKs, partial + expression unique indexes all accepted. |
| `src/db/pg.ts` | `pg.Pool` + `query` / `queryOne` / `execute` / `withTransaction` / `pingDatabase` / `closePool`. One pool; transactions use one checked-out client. TLS on (Supabase requires it). |
| `src/db/migrate-pg.ts` | Explicit PG migration runner. `pg_migrations` tracks applied `.sql` files; each runs in its own transaction; after the baseline it back-fills `schema_migrations` rows 1–5. |
| `scripts/migrate-sqlite-to-postgres.mjs` | One-shot data copy `data.sqlite3` → Postgres in FK-safe order. Idempotent (`ON CONFLICT DO NOTHING`), `--dry-run`, `--truncate`, verifies per-table row counts. |
| `src/config.ts` | New env: `DB_DRIVER` (`sqlite`\|`postgres`), `DATABASE_URL`, `DATABASE_SSL`, `PG_POOL_MAX`. Fails fast if `DB_DRIVER=postgres` and `DATABASE_URL` is missing — never silently falls back to a local file. |
| `.env.example` | Placeholders only. Explicit warning against putting DB secrets in any `VITE_*` var. |
| `package.json` | `pg` + `@types/pg`; scripts `migrate:pg`, `migrate:data`. |

## 2. What is NOT done yet (needs `DATABASE_URL` to do + verify)

1. **The async data-layer conversion.** `node:sqlite` is synchronous; `pg` is async.
   ~433 `db.prepare(...).get/all/run` call sites across 43 route/helper files +
   `middleware/auth.ts` + `seed.ts` must become `await`ed calls on `pg.ts`, `?`
   placeholders stay `$1…$n` (already Postgres style in most new code; the older
   files use `?` and need rewriting), `datetime('now')`→`app_now()`,
   `date('now')`→`app_today()`, `json_each()`→`jsonb_array_elements_text()` (3
   sites), the 10 `BEGIN IMMEDIATE` transaction blocks → `withTransaction()`.
   This is mechanical but large and **must be re-tested against live Postgres**
   (all six suites) before it can be trusted — which needs #2.
2. **`DATABASE_URL`** — see below.

## 3. What I need from you

From **Supabase Dashboard → Project `fppwmrfomuyrewngbuip` → Project Settings →
Database → Connection string**:

- **Connection pooling** (Supavisor, port **6543**) string — for the app runtime:
  `postgresql://postgres.fppwmrfomuyrewngbuip:<DB-PASSWORD>@aws-0-<region>.pooler.supabase.com:6543/postgres`
- Optionally the **Session / direct** (port **5432**) string — some Supavisor
  transaction-pooling modes reject multi-statement DDL, so migrations may need the
  direct one.

Put it in `server/.env` (git-ignored) as `DATABASE_URL=...`. Do **not** paste it
into chat if you'd rather not — just add it to `.env` and tell me it's there.

## 4. Cutover runbook (once `DATABASE_URL` is set)

```sh
cd server
npm install                       # picks up pg

# .env:
#   DB_DRIVER=postgres
#   DATABASE_URL=<pooler or direct string>
#   DATABASE_SSL=true

npm run migrate:pg                 # creates the schema in Supabase, seeds schema_migrations v1..v5
npm run migrate:data -- --dry-run  # preview row counts, no writes
npm run migrate:data              # copy data.sqlite3 -> Postgres, verifies counts reconcile

npm run build && npm start        # app now serves from Postgres
curl localhost:4000/api/health   # {"ok":true,"database":"reachable"}
```

Then the full regression (Steps 1–6) against Postgres:
`npm run test:security` · `test:academic` · `test:students` · `test:employees` ·
`test:attendance` (each expects its own server; the orchestrator in scratch does
this). If you want a **fresh** Supabase DB instead of migrated dev data:
`npm run migrate:pg` then `NODE_ENV=development npm run seed`.

## 5. SQLite v1–v5  →  Postgres mapping

The SQLite schema grew by `CREATE TABLE IF NOT EXISTS` + incremental
`ALTER TABLE ADD COLUMN`. Postgres gets the **final shape** as one baseline file;
`migrate-pg.ts` then inserts `schema_migrations` rows 1–5 so application code that
reads that table sees the same history.

| SQLite version | Content | In Postgres |
|---|---|---|
| v1 `baseline_schema_and_legacy_compatibility` | core tables, users, RBAC override table, audit_log | `001_baseline.sql` (all of it) |
| v2 `academic_structure_foundation` | academic_years, class/room/subject columns, `class_subjects`, one-active-year partial unique | `001_baseline.sql` |
| v3 `student_admission_guardian_integrity` | `student_guardians`, admission columns, school-scoped admission/roll/application partial unique indexes | `001_baseline.sql` |
| v4 `teacher_staff_management` | teacher/staff employee columns, `users.linked_staff_id`, employee-id + linked-user partial unique indexes | `001_baseline.sql` |
| v5 `attendance_integrity_and_context` | `attendance.academic_year_id/remarks/marked_by/timestamps`, teacher/staff attendance remarks, 3 unique `(school,entity,date)` indexes + lookup indexes | `001_baseline.sql` |
| v6+ | future | new `NNN_*.sql` files |

Type choices: ids `text` (app-generated), timestamps `text` in
`YYYY-MM-DD HH24:MI:SS` UTC (code compares them as strings — `app_now()` emits
exactly this), "boolean" columns (`is_primary`, `enabled`, `read`) stay `integer`
0/1 (code does `=== 1` / `= 0` / `CASE WHEN … THEN 1 ELSE 0`), `REAL` → `double precision`.

## 6. Supabase dashboard verification

After `migrate:pg` + `migrate:data`, in the Supabase dashboard for project
`fppwmrfomuyrewngbuip`:

1. **Table Editor** — the left list shows ~44 tables incl. `schools`, `users`,
   `students`, `teachers`, `staff`, `parents`, `student_guardians`,
   `class_subjects`, `academic_years`, `classes`, `admissions`, `attendance`,
   `teacher_attendance`, `staff_attendance`, `audit_log`, `schema_migrations`.
2. `schools` → 3 rows (Everbright, Riverside, Sunrise).
3. `users` → 18 rows; `superadmin@example.com` has `school_id` = NULL, every other
   user has a non-null `school_id`; `password_hash` starts with `$2` (bcrypt) — never plaintext.
4. `students` → 76, `student_guardians` → 76, `teachers` → 18, `staff` → 12,
   `class_subjects` → 150, `attendance` → 120.
5. `schema_migrations` → rows for versions 1,2,3,4,5.
6. **Database → Migrations** shows `pg_migrations` has `001_baseline.sql`.
7. **Advisors** → expect RLS warnings (see §7); no missing-FK / broken-constraint errors.

## 7. Security model / RLS

The app reaches Postgres **only** through the trusted Express backend using the
connection string (a privileged role). All tenant isolation is the existing
`req.user.schoolId`-from-JWT `WHERE school_id = $1` enforcement in route handlers —
**unchanged and still mandatory**. The browser has no Supabase credentials and
never queries Supabase.

Because there is no direct client access, **Row-Level Security is not the
enforcement layer** here. Supabase will flag "RLS disabled/permissive" on these
tables in Advisors — that is expected for a backend-only access pattern. Do **not**
add RLS policies keyed off Supabase Auth JWT claims: this app's JWT is not a
Supabase Auth token, so such policies would either block the backend or give a
false sense of isolation. If you later want defence-in-depth, enable RLS with a
`FORCE`d deny-all plus a dedicated backend role that `BYPASSRLS` — tracked as a
follow-up, not part of this migration.

## 8. SQLite backup

`server/data.sqlite3` is **kept as-is** — do not delete it. After cutover the
runtime uses Postgres (`DB_DRIVER=postgres`); with `DB_DRIVER` unset/`sqlite` the
app still runs on the file, so the fallback exists but is never automatic. Prove
the switch: note `data.sqlite3` mtime/size, do create/update ops through the API,
confirm the rows land in Supabase and `data.sqlite3` mtime/size are unchanged.
