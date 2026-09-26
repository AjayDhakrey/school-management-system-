// Optional PM2 process file for the SchoolSphere VPS deployment.
// CommonJS (.cjs) is required because package.json sets "type": "module".
//
// Usage on the VPS (after `npm ci && npm run build` at the repo root):
//   pm2 start ecosystem.config.cjs
//   pm2 save                  # persist across reboots (pm2-root.service is enabled)
//
// Supabase hosts the backend, so this process only serves the built frontend.
module.exports = {
  apps: [
    {
      name: "schoolsphere-web",
      script: "npm",
      args: "start",
      cwd: __dirname,
      exec_mode: "fork",
      instances: 1,
      env: {
        NODE_ENV: "production",
      },
      autorestart: true,
      max_memory_restart: "256M",
      time: true,
    },
  ],
};
