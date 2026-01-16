/**
 * Service de streaming des réponses IA pour une expérience ChatGPT-like
 *
 * Envoie les réponses progressivement au lieu d'attendre la réponse complète
 *
 * @module StreamingResponse
 * @category Utils
 */

import TelegramBot from 'node-telegram-bot-api';
import { logDebug, logError } from './logger';

export interface StreamingOptions {
  /**
   * Délai entre chaque update (ms)
   * @default 300
   */
  updateInterval?: number;

  /**
   * Taille minimale d'un chunk de texte
   * @default 50
   */
  minChunkSize?: number;

  /**
   * Afficher des émojis de progression
   * @default true
   */
  showProgressEmojis?: boolean;

  /**
   * Envoyer typing indicator pendant le traitement
   * @default true
   */
  sendTypingIndicator?: boolean;
}

/**
 * Classe pour gérer le streaming des réponses IA
 */
export class StreamingResponse {
  private bot: TelegramBot;
  private chatId: number;
  private currentMessageId: number | null = null;
  private lastUpdateTime: number = 0;
  private options: Required<StreamingOptions>;

  constructor(bot: TelegramBot, chatId: number, options: StreamingOptions = {}) {
    this.bot = bot;
    this.chatId = chatId;
    this.options = {
      updateInterval: options.updateInterval ?? 300,
      minChunkSize: options.minChunkSize ?? 50,
      showProgressEmojis: options.showProgressEmojis ?? true,
      sendTypingIndicator: options.sendTypingIndicator ?? true,
    };
  }

  /**
   * Envoie un indicateur de typing
   */
  async sendTyping(): Promise<void> {
    if (this.options.sendTypingIndicator) {
      try {
        await this.bot.sendChatAction(this.chatId, 'typing');
      } catch (error) {
        // Ignorer les erreurs de chat action (non critique)
      }
    }
  }

  /**
   * Envoie un message de progression avec emoji
   */
  async sendProgressMessage(message: string): Promise<TelegramBot.Message> {
    if (this.options.showProgressEmojis) {
      return await this.bot.sendMessage(this.chatId, message);
    }
    return await this.bot.sendMessage(this.chatId, '⏳ Traitement en cours...');
  }

  /**
   * Streame une réponse texte en chunks
   *
   * @param fullText - Texte complet à streamer
   * @param progressMessage - Message de progression initial (optionnel)
   * @returns Message final envoyé
   */
  async streamText(fullText: string, progressMessage?: string): Promise<TelegramBot.Message> {
    try {
      // 1. Envoyer message de progression initial
      let message: TelegramBot.Message;

      if (progressMessage && this.options.showProgressEmojis) {
        message = await this.bot.sendMessage(this.chatId, progressMessage);
        this.currentMessageId = message.message_id;
        await this.sleep(500); // Laisser l'utilisateur voir le message
      }

      // 2. Découper le texte en chunks intelligents (par phrase)
      const chunks = this.splitIntoChunks(fullText);

      logDebug(`Streaming ${chunks.length} chunks`, 'streaming-response');

      // 3. Envoyer le premier chunk
      const firstChunk = chunks[0];
      if (!this.currentMessageId) {
        message = await this.bot.sendMessage(this.chatId, firstChunk);
        this.currentMessageId = message.message_id;
      } else {
        message = await this.bot.editMessageText(firstChunk, {
          chat_id: this.chatId,
          message_id: this.currentMessageId,
          parse_mode: 'Markdown',
        }) as TelegramBot.Message;
      }

      this.lastUpdateTime = Date.now();

      // 4. Streamer les chunks suivants
      for (let i = 1; i < chunks.length; i++) {
        const accumulatedText = chunks.slice(0, i + 1).join('');

        // Attendre le délai entre updates
        await this.sleep(this.options.updateInterval);

        // Envoyer typing indicator pendant l'attente
        await this.sendTyping();

        try {
          message = await this.bot.editMessageText(accumulatedText, {
            chat_id: this.chatId,
            message_id: this.currentMessageId!,
            parse_mode: 'Markdown',
          }) as TelegramBot.Message;

          this.lastUpdateTime = Date.now();
        } catch (error: any) {
          // Si l'édition échoue (trop rapide ou message identique), ignorer
          if (!error.message?.includes('message is not modified')) {
            logError('Erreur lors du streaming', error, 'streaming-response');
          }
        }
      }

      this.currentMessageId = null;
      return message!;

    } catch (error: any) {
      logError('Erreur lors du streaming de la réponse', error, 'streaming-response');

      // Fallback : envoyer le texte complet d'un coup
      return await this.bot.sendMessage(this.chatId, fullText, { parse_mode: 'Markdown' });
    }
  }

  /**
   * Découpe intelligemment le texte en chunks (par phrase ou ligne)
   */
  private splitIntoChunks(text: string): string[] {
    const chunks: string[] = [];
    const sentences = text.split(/(?<=[.!?])\s+/); // Split par phrase

    let currentChunk = '';

    for (const sentence of sentences) {
      // Si on atteint la taille minimale, créer un chunk
      if (currentChunk.length + sentence.length >= this.options.minChunkSize) {
        currentChunk += sentence;
        chunks.push(currentChunk);
        currentChunk = '';
      } else {
        currentChunk += (currentChunk ? ' ' : '') + sentence;
      }
    }

    // Ajouter le dernier chunk s'il reste du texte
    if (currentChunk) {
      chunks.push(currentChunk);
    }

    // Si pas de chunks créés (texte trop court), utiliser le texte complet
    if (chunks.length === 0) {
      chunks.push(text);
    }

    return chunks;
  }

  /**
   * Utilitaire pour attendre
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Édite le message actuel (pour annuler ou modifier)
   */
  async editCurrentMessage(newText: string): Promise<void> {
    if (this.currentMessageId) {
      try {
        await this.bot.editMessageText(newText, {
          chat_id: this.chatId,
          message_id: this.currentMessageId,
          parse_mode: 'Markdown',
        });
      } catch (error: any) {
        logError('Erreur lors de l\'édition du message', error, 'streaming-response');
      }
    }
  }

  /**
   * Supprime le message actuel
   */
  async deleteCurrentMessage(): Promise<void> {
    if (this.currentMessageId) {
      try {
        await this.bot.deleteMessage(this.chatId, this.currentMessageId);
        this.currentMessageId = null;
      } catch (error: any) {
        logError('Erreur lors de la suppression du message', error, 'streaming-response');
      }
    }
  }
}

/**
 * Factory pour créer facilement une instance de StreamingResponse
 */
export class StreamingResponseFactory {
  static create(
    bot: TelegramBot,
    chatId: number,
    options?: StreamingOptions
  ): StreamingResponse {
    return new StreamingResponse(bot, chatId, options);
  }

  /**
   * Crée une instance avec des émojis de progression désactivés
   */
  static createMinimal(bot: TelegramBot, chatId: number): StreamingResponse {
    return new StreamingResponse(bot, chatId, {
      showProgressEmojis: false,
      sendTypingIndicator: true,
    });
  }

  /**
   * Crée une instance ultra-rapide (pour réponses courtes)
   */
  static createFast(bot: TelegramBot, chatId: number): StreamingResponse {
    return new StreamingResponse(bot, chatId, {
      updateInterval: 150,
      minChunkSize: 30,
    });
  }
}
