// ecosystem.config.cjs — PM2 process manager config
// Dùng: pm2 start ecosystem.config.cjs
module.exports = {
  apps: [
    {
      name: 'netflix-store',
      script: 'server.cjs',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PORT: 3001
      },
      // Log files
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true
    }
  ]
}

