// PM2 Ecosystem - DS16 Backend
// Usage: pm2 start ecosystem.config.js

module.exports = {
  apps: [
    {
      name: 'ds16-api',
      script: 'index.js',
      cwd: './',
      instances: 2,
      exec_mode: 'cluster',
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'development',
        PORT: 3001,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
};
