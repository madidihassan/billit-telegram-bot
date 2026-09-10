/**
 * Notifier Telegram minimal : diffuse les notifications de factures et gère
 * le seul bouton interactif conservé (« 💰 Marquer Payé »).
 *
 * Contrairement à TelegramBotInteractive, il n'embarque ni agent IA, ni
 * commandes, ni reconnaissance vocale, ni réconciliation. Le polling ne sert
 * qu'à recevoir les callbacks `pay_invoice:<id>` ; les messages texte et les
 * commandes sont ignorés.
 */

import TelegramBot from 'node-telegram-bot-api';
import { config } from '../config';
import { isUserAuthorized, getAllAuthorizedUsers } from '../database';
import { logUnauthorizedAccess } from '../utils/security';
import {
  isPermanentTelegramFailure,
  autoDisableUser,
  describeTelegramError,
} from '../utils/telegram-failures';
import { InvoiceNotifier } from '../types/notifier';

/** Sous-ensemble d'InvoiceMonitoringService dont le handler « Payé » a besoin. */
export interface PayableInvoiceSource {
  getPayContext(invoiceId: string): { invoiceNumber: string; supplierName: string } | undefined;
  markInvoicePaid(orderId: string): Promise<void>;
}

const PAY_CALLBACK_PREFIX = 'pay_invoice:';
const POLLING_INTERVAL_MS = 300;
const POLLING_TIMEOUT_S = 10;

export class TelegramNotifier implements InvoiceNotifier {
  private bot: TelegramBot;
  private invoiceSource: PayableInvoiceSource | null = null;

  constructor() {
    this.bot = new TelegramBot(config.telegram.botToken, {
      polling: {
        interval: POLLING_INTERVAL_MS,
        autoStart: true,
        params: { timeout: POLLING_TIMEOUT_S },
      },
    });

    this.registerPayHandler();

    this.bot.on('polling_error', (error: any) => {
      console.error('❌ Erreur de polling Telegram:', error.message);
    });
  }

  /**
   * Branche la source des factures (InvoiceMonitoringService), créée après le
   * notifier puisqu'elle en dépend.
   */
  setInvoiceSource(source: PayableInvoiceSource): void {
    this.invoiceSource = source;
  }

  /**
   * Seul handler interactif conservé : le bouton « Marquer Payé » des
   * notifications de factures. Tout autre callback est ignoré silencieusement.
   */
  private registerPayHandler(): void {
    this.bot.on('callback_query', async (callbackQuery) => {
      const data = callbackQuery.data;
      if (!data || !data.startsWith(PAY_CALLBACK_PREFIX)) return;

      const chatId = callbackQuery.message?.chat.id ?? callbackQuery.from.id;

      if (!isUserAuthorized(String(chatId))) {
        logUnauthorizedAccess(chatId, callbackQuery.from?.username);
        await this.answerCallback(callbackQuery.id, '⛔ Accès non autorisé.');
        return;
      }

      await this.answerCallback(callbackQuery.id, '⏳ Marquage en cours...');

      const orderId = data.slice(PAY_CALLBACK_PREFIX.length);
      const context = this.invoiceSource?.getPayContext(orderId);

      let paid = false;
      try {
        if (!this.invoiceSource) {
          console.error('[PAY] Source de factures non branchée, marquage impossible');
        } else {
          await this.invoiceSource.markInvoicePaid(orderId);
          paid = true;
        }
      } catch (error: any) {
        console.error('[PAY] Erreur marquage payé Billit:', error.message);
      }

      // Retirer le bouton pour éviter les doubles-clics, même en cas d'échec :
      // le message de réponse indique le résultat.
      await this.removeButtons(callbackQuery.message);

      await this.replyToCallback(chatId, paid, context);
    });
  }

  private async answerCallback(callbackQueryId: string, text: string): Promise<void> {
    try {
      await this.bot.answerCallbackQuery(callbackQueryId, { text, show_alert: false });
    } catch (error: any) {
      console.error('Erreur answerCallbackQuery:', error.message);
    }
  }

  private async removeButtons(message: TelegramBot.Message | undefined): Promise<void> {
    if (!message) return;
    try {
      await this.bot.editMessageReplyMarkup(
        { inline_keyboard: [] },
        { chat_id: message.chat.id, message_id: message.message_id }
      );
    } catch (error) {
      /* message trop vieux ou déjà édité */
    }
  }

  private async replyToCallback(
    chatId: number | string,
    paid: boolean,
    context: { invoiceNumber: string; supplierName: string } | undefined
  ): Promise<void> {
    const escape = (value: string) => value.replace(/[<>&]/g, '');

    let response: string;
    if (!paid) {
      response = '❌ <b>Échec du marquage dans Billit.</b>\nVeuillez vérifier manuellement.';
    } else if (context) {
      response =
        `✅ <b>Facture ${escape(context.invoiceNumber)} marquée comme payée !</b>\n` +
        `🏢 ${escape(context.supplierName)}`;
    } else {
      response = '✅ <b>Facture marquée comme payée !</b> (notification trop ancienne pour afficher les détails)';
    }

    try {
      await this.bot.sendMessage(chatId, response, { parse_mode: 'HTML' });
    } catch (error: any) {
      console.error('Erreur envoi confirmation paiement:', error.message);
    }
  }

  async broadcastMessage(message: string): Promise<boolean> {
    const authorizedUsers = getAllAuthorizedUsers();
    let successCount = 0;

    for (const user of authorizedUsers) {
      try {
        await this.bot.sendMessage(user.chat_id, message, {
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        });
        console.log(`📤 Notification envoyée au chat ${user.chat_id} (${user.username || 'Inconnu'})`);
        successCount++;
      } catch (error: any) {
        if (isPermanentTelegramFailure(error)) {
          autoDisableUser(user.chat_id, user.username, describeTelegramError(error));
        } else {
          console.error(`❌ Erreur lors de l'envoi au chat ${user.chat_id}:`, error);
        }
      }
    }
    return successCount > 0;
  }

  async broadcastDocument(
    document: Buffer,
    filename: string,
    caption?: string,
    replyMarkup?: any
  ): Promise<void> {
    const authorizedUsers = getAllAuthorizedUsers();

    for (const user of authorizedUsers) {
      try {
        await this.bot.sendDocument(
          user.chat_id,
          document,
          { caption, parse_mode: 'HTML', reply_markup: replyMarkup },
          { filename, contentType: 'application/pdf' }
        );
        console.log(`📤 Document envoyé au chat ${user.chat_id} (${user.username || 'Inconnu'}) - ${filename}`);
      } catch (error: any) {
        if (isPermanentTelegramFailure(error)) {
          autoDisableUser(user.chat_id, user.username, describeTelegramError(error));
        } else {
          console.error(`❌ Erreur lors de l'envoi du document au chat ${user.chat_id}:`, error);
        }
      }
    }
  }

  /** Envoie un message de démarrage au chat propriétaire (test de connexion). */
  async sendStartupMessage(text: string): Promise<void> {
    await this.bot.sendMessage(config.telegram.chatId, text, { parse_mode: 'HTML' });
  }

  stop(): void {
    this.bot.stopPolling();
  }
}
