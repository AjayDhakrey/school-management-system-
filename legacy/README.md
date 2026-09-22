# Legacy project files

`postgres-backend/` preserves an older SchoolSphere API, deployment guide, and
Supabase migration set for reference. The root Vite app does not import or run
this backend. Its deployment instructions belong to that older version and
should not be used for the current app.

The active application is at the repository root:

- `src/`: React application
- `public/`: static public assets
- `supabase/`: current database migrations
- `deploy/` and `ecosystem.config.cjs`: current frontend deployment files

Generated output such as `dist/`, `supabase/.temp/`, and `*.tsbuildinfo` is
ignored by Git and hidden from the VS Code file explorer.
