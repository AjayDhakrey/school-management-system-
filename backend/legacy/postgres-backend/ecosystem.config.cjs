module.exports = {
  apps: [
    {
      name: "schoolsphere-api",
      cwd: "./server",
      script: "dist/index.js",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "500M",
      env_production: {
        NODE_ENV: "production",
        PORT: "4000",
        DB_DRIVER: "postgres",
      },
    },
  ],
};
