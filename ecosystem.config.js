module.exports = {
  apps: [
    {
      name: 'mithichat-backend-cluster',
      script: './dist/index.js',
      instances: 'max',
      exec_mode: 'cluster',
      watch: false,
      max_memory_restart: '1G',
      env_production: {
        NODE_ENV: 'production',
        PORT: 5000,
      },
      kill_timeout: 5000,
      listen_timeout: 5000,
      graceful_shutdown: true,
      wait_ready: true,
    },
  ],
};
