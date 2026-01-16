import type Groq from 'groq-sdk';

/**
 * Outils IA pour la gestion des utilisateurs (3 outils)
 *
 * @module UserTools
 * @category AI Tools
 */

export const userTools: Groq.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'add_user',
      description: '⚠️ Ajoute un utilisateur à la liste blanche. Tu DOIS appeler list_users() après l\'ajout pour confirmer. Ne JAMAIS inventer de Chat IDs. Utilise cette fonction pour: "Ajoute 123456789", "Autorise ce Chat ID", "Donne accès à", "Ajoute cette personne".',
      parameters: {
        type: 'object',
        properties: {
          chat_id: {
            type: 'string',
            description: 'Chat ID Telegram EXACT de l\'utilisateur à ajouter (ex: "7887749968"). DOIT contenir uniquement des chiffres.',
          },
        },
        required: ['chat_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'remove_user',
      description: '⚠️ Supprime un utilisateur. WORKFLOW OBLIGATOIRE si position ("le 3", "le 2ème", "l\'utilisateur 3"):\n1. APPELLE list_users() pour obtenir la liste ACTUELLE\n2. EXTRAIS le Chat ID à la position demandée depuis le RÉSULTAT de list_users()\n3. APPELLE remove_user() avec ce Chat ID\n4. APPELLE list_users() à nouveau pour confirmer\n⚠️ NE JAMAIS utiliser CLAUDE.md ou ta mémoire pour les Chat IDs - UNIQUEMENT le résultat de list_users().\nExemples: "Supprime le 3ème" → list_users() → extrait le 3ème Chat ID → remove_user(ce_chat_id)',
      parameters: {
        type: 'object',
        properties: {
          chat_id: {
            type: 'string',
            description: 'Chat ID Telegram EXACT (ex: "7887749968"). DOIT provenir du résultat de list_users(), PAS de CLAUDE.md, PAS de ta mémoire, PAS d\'invention.',
          },
        },
        required: ['chat_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_users',
      description: '⚠️ OBLIGATOIRE: Liste tous les utilisateurs autorisés. TU DOIS APPELER cette fonction AVANT de répondre à toute question sur les utilisateurs. Ne JAMAIS inventer de liste. Utilise cette fonction pour: "Qui a accès ?", "Liste des utilisateurs", "Montre les utilisateurs", "Quels utilisateurs ?", ou toute question concernant les utilisateurs autorisés.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
];
