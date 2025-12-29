#!/usr/bin/env node

/**
 * Bot Watchdog - Démarre/arrête le bot principal via Telegram
 *
 * Usage:
 *   WATCHDOG_TOKEN=your_token WATCHDOG_CHAT_ID=your_id node watchdog-bot.js
 *
 * Commandes:
 *   /start_main_bot - Démarre le bot principal
 *   /stop_main_bot - Arrête le bot principal
 *   /status - Vérifie si le bot principal tourne
 *   /restart_main_bot - Redémarre le bot principal
 */

const TelegramBot = require('node-telegram-bot-api');
const { exec } = require('child_process');
const path = require('path');

// Configuration
const WATCHDOG_TOKEN = process.env.WATCHDOG_TOKEN;
const ALLOWED_CHAT_ID = process.env.WATCHDOG_CHAT_ID;
const BOT_DIR = path.dirname(__filename);

if (!WATCHDOG_TOKEN || !ALLOWED_CHAT_ID) {
  console.error('❌ Variables manquantes: WATCHDOG_TOKEN et WATCHDOG_CHAT_ID requises');
  process.exit(1);
}

const bot = new TelegramBot(WATCHDOG_TOKEN, { polling: true });

console.log('🐕 Watchdog Bot démarré');
console.log(`📂 Répertoire du bot: ${BOT_DIR}`);
console.log(`👤 Chat autorisé: ${ALLOWED_CHAT_ID}`);

// Middleware de sécurité
function isAuthorized(chatId) {
  return chatId.toString() === ALLOWED_CHAT_ID.toString();
}

// Vérifier si le bot principal tourne
async function checkBotStatus() {
  return new Promise((resolve) => {
    exec(`pgrep -f "${BOT_DIR}.*dist/index-bot"`, (error, stdout) => {
      if (stdout.trim()) {
        const pids = stdout.trim().split('\n');
        resolve({ running: true, pids });
      } else {
        resolve({ running: false, pids: [] });
      }
    });
  });
}

// Démarrer le bot principal
async function startMainBot() {
  return new Promise((resolve, reject) => {
    exec(`cd ${BOT_DIR} && ./start-bot-safe.sh`, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`Erreur: ${stderr || error.message}`));
      } else {
        resolve(stdout);
      }
    });
  });
}

// Arrêter le bot principal
async function stopMainBot() {
  return new Promise((resolve) => {
    exec(`pkill -f "${BOT_DIR}.*node.*dist/index-bot"`, (error, stdout) => {
      exec(`pkill -f "${BOT_DIR}.*start-bot-wrapper"`, () => {
        resolve('Bot arrêté');
      });
    });
  });
}

// Commande /status
bot.onText(/\/status/, async (msg) => {
  const chatId = msg.chat.id;

  if (!isAuthorized(chatId)) {
    return bot.sendMessage(chatId, '❌ Non autorisé');
  }

  const status = await checkBotStatus();

  if (status.running) {
    bot.sendMessage(
      chatId,
      `✅ Bot principal ACTIF\n\n` +
      `📊 Processus: ${status.pids.length}\n` +
      `🆔 PIDs: ${status.pids.join(', ')}`
    );
  } else {
    bot.sendMessage(chatId, '❌ Bot principal ARRÊTÉ');
  }
});

// Commande /start_main_bot
bot.onText(/\/start_main_bot/, async (msg) => {
  const chatId = msg.chat.id;

  if (!isAuthorized(chatId)) {
    return bot.sendMessage(chatId, '❌ Non autorisé');
  }

  const status = await checkBotStatus();

  if (status.running) {
    return bot.sendMessage(chatId, '⚠️ Le bot tourne déjà !');
  }

  bot.sendMessage(chatId, '🔄 Démarrage du bot principal...');

  try {
    await startMainBot();
    await new Promise(resolve => setTimeout(resolve, 3000));

    const newStatus = await checkBotStatus();
    if (newStatus.running) {
      bot.sendMessage(chatId, `✅ Bot démarré avec succès !\n🆔 PID: ${newStatus.pids[0]}`);
    } else {
      bot.sendMessage(chatId, '❌ Le bot n\'a pas démarré\nVérifiez les logs: tail -f mustfood-bot.log');
    }
  } catch (error) {
    bot.sendMessage(chatId, `❌ Erreur de démarrage:\n${error.message}`);
  }
});

// Commande /stop_main_bot
bot.onText(/\/stop_main_bot/, async (msg) => {
  const chatId = msg.chat.id;

  if (!isAuthorized(chatId)) {
    return bot.sendMessage(chatId, '❌ Non autorisé');
  }

  const status = await checkBotStatus();

  if (!status.running) {
    return bot.sendMessage(chatId, '⚠️ Le bot est déjà arrêté');
  }

  bot.sendMessage(chatId, '🛑 Arrêt du bot principal...');

  await stopMainBot();
  await new Promise(resolve => setTimeout(resolve, 2000));

  const newStatus = await checkBotStatus();
  if (!newStatus.running) {
    bot.sendMessage(chatId, '✅ Bot arrêté avec succès');
  } else {
    bot.sendMessage(chatId, '⚠️ Le bot n\'a pas été arrêté complètement');
  }
});

// Commande /restart_main_bot
bot.onText(/\/restart_main_bot/, async (msg) => {
  const chatId = msg.chat.id;

  if (!isAuthorized(chatId)) {
    return bot.sendMessage(chatId, '❌ Non autorisé');
  }

  bot.sendMessage(chatId, '🔄 Redémarrage du bot principal...');

  try {
    // Arrêter
    await stopMainBot();
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Démarrer
    await startMainBot();
    await new Promise(resolve => setTimeout(resolve, 5000));

    const status = await checkBotStatus();
    if (status.running) {
      bot.sendMessage(chatId, `✅ Bot redémarré avec succès !\n🆔 PID: ${status.pids[0]}`);
    } else {
      bot.sendMessage(chatId, '❌ Le bot n\'a pas redémarré\nVérifiez les logs');
    }
  } catch (error) {
    bot.sendMessage(chatId, `❌ Erreur de redémarrage:\n${error.message}`);
  }
});

// Commande /help
bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;

  if (!isAuthorized(chatId)) {
    return bot.sendMessage(chatId, '❌ Non autorisé');
  }

  bot.sendMessage(
    chatId,
    `🐕 *Watchdog Bot - Commandes disponibles*\n\n` +
    `/status - Vérifier l'état du bot principal\n` +
    `/start_main_bot - Démarrer le bot principal\n` +
    `/stop_main_bot - Arrêter le bot principal\n` +
    `/restart_main_bot - Redémarrer le bot principal\n` +
    `/help - Afficher cette aide`,
    { parse_mode: 'Markdown' }
  );
});

// Gestion des erreurs
bot.on('polling_error', (error) => {
  console.error('❌ Erreur polling:', error.message);
});

process.on('SIGINT', () => {
  console.log('\n👋 Arrêt du Watchdog Bot...');
  bot.stopPolling();
  process.exit(0);
});
