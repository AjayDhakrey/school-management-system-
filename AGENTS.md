# Repository Guidelines

## Project Structure

EduNex is split into two packages. `frontend/src/` contains the React and TypeScript application, with feature pages under `pages/`, routed modules under `app/`, reusable components under `components/`, and shared logic/data under `lib/` and `data/`. The frontend uses local demo data and browser storage; it does not connect to a remote service. Static assets are in `frontend/public/` and `frontend/src/assets/`; deployment configuration is in `frontend/deploy/`. `backend/supabase/` holds the separate Supabase CLI configuration, migrations, and Edge Functions; rollback SQL is in `backend/rollback/`. `backend/legacy/` is historical and is not part of the active build. User documentation is in `docs/`.

## Build and Development

Run commands from the repository root unless noted:

- `npm run install:all` installs dependencies for both packages.
- `npm run dev` starts the Vite frontend development server.
- `npm run build` type-checks and builds the frontend into `frontend/dist/`.
- `npm run typecheck` checks frontend TypeScript without emitting files.
- `npm run lint` runs ESLint; `npm run format` formats frontend files with Prettier.
- `npm run db:status` lists configured backend migrations; `npm run db:push` applies them.
- `npm run functions:deploy` deploys the backend `manage-user-login` Edge Function.

## Style and Naming

Use TypeScript and React function components. Follow the existing Prettier settings: 100-character line width, semicolons, double quotes, and trailing commas. ESLint checks `.ts` and `.tsx` files. Name React components and page files in PascalCase (for example, `StudentsPage.tsx`); use lower-case kebab-case for SQL migration filenames and descriptive camelCase for utilities and hooks. Keep shared UI in `components/` and cross-feature logic in `lib/` rather than duplicating it in pages.

## Testing and Verification

No dedicated test script or test suite is currently defined. Before submitting frontend changes, run `npm run typecheck`, `npm run lint`, and `npm run build`. For database changes, review the migration SQL and its rollback counterpart where applicable, then use `npm run db:status`; apply migrations only in the intended linked environment.

## Commits and Pull Requests

Recent history uses short, informal summaries and does not show a consistent conventional-commit format. Prefer a concise imperative subject that names the area, such as `Fix fee receipt totals`. Pull requests should explain the user-visible change, list key files or migrations affected, include verification commands and results, link related issues, and attach screenshots for UI changes. Call out any required environment or database changes.

## Configuration and Secrets

The frontend requires no environment variables and stores demo state in browser local storage. Keep backend CLI credentials and other secrets in `backend/.env`; never commit populated environment files, access tokens, or service-role keys.
