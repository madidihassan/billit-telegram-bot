import type Groq from 'groq-sdk';

/**
 * Outils IA pour la gestion système (1 outil)
 *
 * @module SystemTools
 * @category AI Tools
 */

export const systemTools: Groq.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'restart_bot',
      description: 'Redémarre le bot Telegram. Utilise cette fonction quand l\'utilisateur demande: "Redémarre le bot", "Relance le bot", "Reboot le bot", "Redémarrage". Attention: le bot sera temporairement indisponible pendant quelques secondes.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
];
