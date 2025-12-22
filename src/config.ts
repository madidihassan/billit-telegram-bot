import dotenv from 'dotenv';

dotenv.config();

export const config = {
  billit: {
    apiUrl: process.env.BILLIT_API_URL || 'https://my.billit.eu/api',
    apiKey: process.env.BILLIT_API_KEY || '',
    partyId: process.env.BILLIT_PARTY_ID || '', // Optionnel
  },
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    chatId: process.env.TELEGRAM_CHAT_ID || '',
  },
  groq: {
    apiKey: process.env.GROQ_API_KEY || '',
  },
  checkInterval: parseInt(process.env.CHECK_INTERVAL || '300000', 10),
};

export function validateConfig(): void {
  const errors: string[] = [];

  if (!config.billit.apiKey) {
    errors.push('BILLIT_API_KEY manquant');
  }
  if (!config.telegram.botToken) {
    errors.push('TELEGRAM_BOT_TOKEN manquant');
  }
  if (!config.telegram.chatId) {
    errors.push('TELEGRAM_CHAT_ID manquant');
  }

  if (errors.length > 0) {
    throw new Error(`Configuration invalide:\n- ${errors.join('\n- ')}`);
  }
}
