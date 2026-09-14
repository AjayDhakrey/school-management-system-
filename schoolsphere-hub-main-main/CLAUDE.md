# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

SchoolSphere Hub — a multi-tenant School ERP SaaS. Despite the README (an original Lovable UI-only prompt), this is now a **real full-stack app**: a React/Vite frontend plus a real Express + SQLite backend under `server/`. Treat the README's "NO backend / NO database / NO real CRUD" rules as historical, not current — the backend is real and is the enforcement point for auth and permissions.

## Commands

Root (frontend, uses `bun.lock` — `bun install` or `npm i` both work, but don't commit a `package-lock.json`, it's gitignored):

```sh
npm run dev        # runs both frontend (vite) and backend concurrently
npm run dev:web     # frontend only, http://localhost:5173
npm run dev:api     # backend only (proxies to server/ package.json)
npm run build        # vite build
npm run lint          # eslint .
npm run format        # prettier --write .
```

Backend (`server/`, its own npm-managed package, SQLite via `node:sqlite`):

```sh
cd server
npm run dev    # tsx watch src/index.ts, http://localhost:4000
npm run seed   # resets data.sqlite3 and seeds demo data (see below)
npm run build  # tsc -p tsconfig.json
```

There is no test suite in this repo. There's no ESLint `--fix` script; run `npm run format` for Prettier, `npm run lint` to check.

### Demo accounts

`npm run seed` (in `server/`) resets `server/data.sqlite3` and seeds every role. Password for every account: `password123`. Logins follow `<school-shortname-lowercase>.<role>@example.com` (e.g. `<slug>.admin@example.com`, `.teacher@`, `.staff@`, `.parent@`, `.student@`), plus `superadmin@example.com` (SUPER_ADMIN, cross-school).

## Architecture

### Two processes, one API contract

- `src/` — React 19 + Vite + TypeScript frontend, Tailwind v4 + shadcn/ui (`new-york` style, aliases in `components.json`).
- `server/` — Express API on SQLite (`node:sqlite`'s `DatabaseSync`, raw SQL via `db.prepare(...).all/get/run`, no ORM). Schema/migrations live in `server/src/db/schema.ts`; the DB file is created and migrated automatically on boot from `server/src/db/client.ts`.
- The frontend never talks to the DB directly — everything goes through `src/lib/api.ts`'s `api.get/post/patch/put/delete`, pointed at `VITE_API_URL` or `http://<current-host>:4000/api` (host-relative, not hardcoded to `localhost`, so it works over LAN too).

### Auth & multi-tenant RBAC — enforced server-side, mirrored client-side for UX only

- JWT auth: `POST /api/auth/login` returns `{ token, user }`, stored together in `localStorage["scholaris-auth"]`. Every request attaches `Authorization: Bearer <token>`; a 401 triggers a global `onUnauthorized` handler (`src/lib/auth-context.tsx`) that clears storage and redirects to `/login`.
- Roles: `SUPER_ADMIN | SCHOOL_ADMIN | TEACHER | STAFF | PARENT | STUDENT`. `STAFF` additionally has a `department`: `ADMIN | ACCOUNTS | LIBRARY | TRANSPORT`, which the UI maps to display roles `Staff` / `Accountant` / `Librarian` / `Transport Manager` (`toDisplayRole` in `auth-context.tsx`).
- Permission strings look like `"students.view"`, `"fees.create"` (full list in `server/src/permissions.ts`). Every protected route calls `authenticate` + `authorize("<permission>")` (`server/src/middleware/auth.ts`). `SCHOOL_ADMIN` and `SUPER_ADMIN` are wildcards, not editable; `TEACHER/STAFF/PARENT/STUDENT` permissions can be customized per-school via override rows, resolved through `effectivePermissions()` in `server/src/rolePermissions.ts`.
- **`schoolId` for scoping always comes from the verified JWT (`req.user.schoolId`), never from client input.** Route handlers additionally apply role-specific row scoping (e.g. a `TEACHER` only sees students in their assigned classes; a `PARENT` only their own children) — see `scopeClause()` in `server/src/routes/students.ts` for the pattern most routes follow.
- The frontend mirror in `src/lib/permissions.ts` (`canView`) is explicitly **not** the enforcement point — its own comment says so — it only avoids firing requests that would 403, so the real permission model is in `server/src/permissions.ts` + `server/src/rolePermissions.ts`.
- Route-level guarding in the UI is `RequireRole` (`src/components/auth/RequireRole.tsx`) plus the `ROUTE_ROLES` map in `src/lib/navigation.ts`, wired up in `src/App.tsx`'s `guarded()` helper.

### Frontend structure

- `src/App.tsx` is the single router — every route is registered here, each wrapped in `guarded(path, element)` (or an explicit `RequireRole` for role-locked areas like `/super-admin/*` and `/parent/*`). New pages must be added here, not just created.
- Feature modules live under `src/app/<feature>/<feature>.tsx` (e.g. `src/app/fees/fees.tsx`, `src/app/admissions/admissions.tsx`); a few earlier/shared pages remain in `src/pages/` (`Login`, `Dashboard`, `StudentsPage`, `NotFound`, etc.). Role-specific sub-portals nest further: `src/app/teacher/*`, `src/app/parent/*`, `src/app/super-admin/*`, `src/app/staff/*`.
- Dashboards are role-driven: after login, `RootRedirect` sends the user to `DASHBOARD_PATH_FOR_ROLE[user.role]` (e.g. `/teacher/dashboard`), all rendering the same `Dashboard` component gated by role.
- The Parent Portal has its own `ParentChildProvider` (`src/lib/parent-child-context.tsx`) scoped only to `/parent/*` routes, for switching between a parent's multiple children.
- `AppShell` (`src/components/layout/AppShell.tsx`) is the persistent layout (sidebar/header) wrapping all authenticated routes; sidebar nav items and their role visibility are defined in `src/lib/navigation.ts`.
- Data fetching uses TanStack Query (`@tanstack/react-query`); one `QueryClient` is created in `App.tsx`.

### Conventions worth matching

- Path alias `@/*` → `src/*` (set in both `vite.config.ts` and `tsconfig.json`) — always import via `@/...`, not relative paths across feature folders.
- TypeScript is strict, including `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` — index/optional access needs real narrowing, not `!`.
- Prettier: 100-char width, double quotes, semicolons, trailing commas everywhere (`.prettierrc`); ESLint delegates formatting to Prettier and has `@typescript-eslint/no-unused-vars` off.
- Currency is Indian Rupees (₹ / `IndianRupee` icon), not $ — this is an intentional recent change, keep it consistent in new UI.
