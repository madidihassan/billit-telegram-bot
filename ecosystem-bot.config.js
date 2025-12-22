module.exports = {
  apps: [{
    name: 'billit-bot',
    script: './dist/index-bot.js',
    instances: 1,
    exec_mode: 'fork',  // IMPORTANT: fork mode pour Telegram polling
    autorestart: true,
    watch: false,
    max_memory_restart: '200M',
    env: {
      NODE_ENV: 'production'
    },
    error_file: './logs/bot-error.log',
    out_file: './logs/bot-output.log',
    log_file: './logs/bot-combined.log',
    time: true,
    merge_logs: true,
    restart_delay: 10000
  }]
};
