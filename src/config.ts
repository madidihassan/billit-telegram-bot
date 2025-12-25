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
    // OBSOLÈTE: Utilisez maintenant la base de données (isUserAuthorized)
    // Gardé pour compatibilité avec les anciennes commandes qui mettent à jour le .env
    allowedChatIds: (process.env.TELEGRAM_ALLOWED_CHAT_IDS || '')
      .split(',')
      .map(id => id.trim())
      .filter(id => id.length > 0),
  },
  groq: {
    apiKey: process.env.GROQ_API_KEY || '',
  },
  checkInterval: parseInt(process.env.CHECK_INTERVAL || '300000', 10),
  security: {
    // Enable/disable detailed error messages (should be false in production)
    verboseErrors: process.env.VERBOSE_ERRORS === 'true',
    // Maximum length for user inputs to prevent abuse
    maxInputLength: parseInt(process.env.MAX_INPUT_LENGTH || '500', 10),
  },
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
  // TELEGRAM_ALLOWED_CHAT_IDS n'est plus obligatoire (base de données utilisée à la place)

  if (errors.length > 0) {
    throw new Error(`Configuration invalide:\n- ${errors.join('\n- ')}`);
  }
}

/**
 * Vérifie si un chat ID est autorisé à utiliser le bot
 */
export function isAllowedChatId(chatId: string | number): boolean {
  const chatIdStr = String(chatId);
  return config.telegram.allowedChatIds.includes(chatIdStr);
}
