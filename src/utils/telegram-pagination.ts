/**
 * Pagination automatique pour messages Telegram longs
 *
 * Telegram limite : 4096 caractères par message
 * Cette classe découpe automatiquement les réponses longues en plusieurs messages
 *
 * @module TelegramPagination
 * @category Utils
 */

import TelegramBot from 'node-telegram-bot-api';
import { logDebug, logInfo } from './logger';

/**
 * Limite Telegram : 4096 caractères
 * On utilise 4000 pour avoir une marge de sécurité
 */
const TELEGRAM_MAX_LENGTH = 4000;

/**
 * Options de pagination
 */
export interface PaginationOptions {
  /**
   * Taille maximale d'un message
   * @default 4000
   */
  maxLength?: number;

  /**
   * Délai entre chaque message (ms)
   * @default 300
   */
  delayBetweenMessages?: number;

  /**
   * Ajouter numéro de page
   * @default true
   */
  addPageNumber?: boolean;

  /**
   * Préfixe pour continuation
   * @default "(...suite)"
   */
  continuationPrefix?: string;
}

/**
 * Découpe intelligemment un long texte en plusieurs messages
 */
export class TelegramPagination {
  private bot: TelegramBot;
  private chatId: number;
  private options: Required<PaginationOptions>;

  constructor(bot: TelegramBot, chatId: number, options: PaginationOptions = {}) {
    this.bot = bot;
    this.chatId = chatId;
    this.options = {
      maxLength: options.maxLength ?? 4000,
      delayBetweenMessages: options.delayBetweenMessages ?? 300,
      addPageNumber: options.addPageNumber ?? true,
      continuationPrefix: options.continuationPrefix ?? '\n\n(...suite)',
    };
  }

  /**
   * Envoie un message long en le découpant automatiquement si nécessaire
   *
   * @param text - Texte complet à envoyer
   * @param existingMessageId - ID d'un message existant à éditer (pour le premier chunk)
   * @returns Tableau de messages envoyés
   */
  async sendLongMessage(
    text: string,
    existingMessageId?: number
  ): Promise<TelegramBot.Message[]> {
    // Si le texte est court, envoyer directement
    if (text.length <= this.options.maxLength) {
      logDebug(`Message court (${text.length} chars), envoi direct`, 'telegram-pagination');

      if (existingMessageId) {
        const msg = await this.bot.editMessageText(text, {
          chat_id: this.chatId,
          message_id: existingMessageId,
        }) as TelegramBot.Message;
        return [msg];
      } else {
        const msg = await this.bot.sendMessage(this.chatId, text);
        return [msg];
      }
    }

    // Texte long : découper en chunks
    logInfo(`Message long (${text.length} chars), découpage en plusieurs messages`, 'telegram-pagination');

    const chunks = this.splitIntoChunks(text);
    const messages: TelegramBot.Message[] = [];

    for (let i = 0; i < chunks.length; i++) {
      let chunk = chunks[i];

      // Ajouter numéro de page si activé
      if (this.options.addPageNumber && chunks.length > 1) {
        chunk = `📄 Page ${i + 1}/${chunks.length}\n\n${chunk}`;
      }

      // Premier chunk : éditer le message existant si fourni
      if (i === 0 && existingMessageId) {
        const msg = await this.bot.editMessageText(chunk, {
          chat_id: this.chatId,
          message_id: existingMessageId,
        }) as TelegramBot.Message;
        messages.push(msg);
      } else {
        // Attendre un peu entre chaque message (éviter flood)
        if (i > 0) {
          await this.sleep(this.options.delayBetweenMessages);
        }

        const msg = await this.bot.sendMessage(this.chatId, chunk);
        messages.push(msg);
      }

      logDebug(`Chunk ${i + 1}/${chunks.length} envoyé (${chunk.length} chars)`, 'telegram-pagination');
    }

    logInfo(`${chunks.length} messages envoyés pour un total de ${text.length} caractères`, 'telegram-pagination');

    return messages;
  }

  /**
   * Découpe intelligemment le texte en chunks respectant la limite
   * Essaie de couper aux endroits logiques (fin de ligne, fin de section, etc.)
   */
  private splitIntoChunks(text: string): string[] {
    const chunks: string[] = [];
    let currentChunk = '';

    // Split par lignes pour découper intelligemment
    const lines = text.split('\n');

    for (const line of lines) {
      // Si ajouter cette ligne dépasse la limite
      if ((currentChunk + '\n' + line).length > this.options.maxLength) {
        // Si la ligne elle-même est trop longue
        if (line.length > this.options.maxLength) {
          // Sauvegarder le chunk actuel s'il existe
          if (currentChunk) {
            chunks.push(currentChunk);
            currentChunk = '';
          }

          // Découper la ligne en morceaux
          const lineParts = this.splitLongLine(line);
          chunks.push(...lineParts.slice(0, -1));
          currentChunk = lineParts[lineParts.length - 1];
        } else {
          // Sauvegarder le chunk actuel et commencer un nouveau
          chunks.push(currentChunk);
          currentChunk = line;
        }
      } else {
        // Ajouter la ligne au chunk actuel
        currentChunk += (currentChunk ? '\n' : '') + line;
      }
    }

    // Ajouter le dernier chunk
    if (currentChunk) {
      chunks.push(currentChunk);
    }

    return chunks;
  }

  /**
   * Découpe une ligne trop longue en morceaux
   */
  private splitLongLine(line: string): string[] {
    const parts: string[] = [];
    let remaining = line;

    while (remaining.length > this.options.maxLength) {
      // Chercher le dernier espace avant la limite
      let splitIndex = remaining.lastIndexOf(' ', this.options.maxLength);

      // Si pas d'espace trouvé, couper brutalement
      if (splitIndex === -1) {
        splitIndex = this.options.maxLength;
      }

      parts.push(remaining.substring(0, splitIndex));
      remaining = remaining.substring(splitIndex).trim();
    }

    // Ajouter le reste
    if (remaining) {
      parts.push(remaining);
    }

    return parts;
  }

  /**
   * Utilitaire pour attendre
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Compte le nombre de pages nécessaires pour un texte
   */
  static getPageCount(text: string, maxLength: number = 4000): number {
    if (text.length <= maxLength) {
      return 1;
    }

    // Estimation approximative (la vraie valeur dépend du découpage intelligent)
    return Math.ceil(text.length / maxLength);
  }

  /**
   * Vérifie si un texte nécessite une pagination
   */
  static needsPagination(text: string, maxLength: number = 4000): boolean {
    return text.length > maxLength;
  }
}

/**
 * Factory pour créer facilement une instance
 */
export class TelegramPaginationFactory {
  static create(
    bot: TelegramBot,
    chatId: number,
    options?: PaginationOptions
  ): TelegramPagination {
    return new TelegramPagination(bot, chatId, options);
  }

  /**
   * Crée une instance sans numéros de page (pour messages continus)
   */
  static createContinuous(bot: TelegramBot, chatId: number): TelegramPagination {
    return new TelegramPagination(bot, chatId, {
      addPageNumber: false,
      continuationPrefix: '\n\n...',
    });
  }

  /**
   * Crée une instance avec pagination rapide (délai court)
   */
  static createFast(bot: TelegramBot, chatId: number): TelegramPagination {
    return new TelegramPagination(bot, chatId, {
      delayBetweenMessages: 100,
    });
  }
}
