module.exports = {
  apps: [{
    name: 'bot-mustfood',
    script: './dist/index-bot.js',
    cwd: '/home/ubuntu/Billit/bot_mustfood',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '300M',
    restart_delay: 5000,
    env: {
      NODE_ENV: 'production'
    },
    error_file: './logs/bot-error.log',
    out_file: './logs/bot-output.log',
    log_file: './logs/bot-combined.log',
    time: true,
    merge_logs: true
  }]
};
