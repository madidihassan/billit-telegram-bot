import TelegramBot from 'node-telegram-bot-api';
import { config } from './config';
import { BillitInvoice } from './types';

export class TelegramClient {
  private bot: TelegramBot;
  private chatId: string;

  constructor() {
    this.bot = new TelegramBot(config.telegram.botToken, { polling: false });
    this.chatId = config.telegram.chatId;
  }

  /**
   * Formate une facture en message Telegram avec HTML
   */
  private formatInvoiceMessage(invoice: BillitInvoice): string {
    const amount = new Intl.NumberFormat('fr-BE', {
      style: 'currency',
      currency: invoice.currency || 'EUR',
    }).format(invoice.total_amount);

    const invoiceDate = new Date(invoice.invoice_date).toLocaleDateString('fr-BE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });

    const dueDate = new Date(invoice.due_date).toLocaleDateString('fr-BE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });

    return `
🧾 <b>Nouvelle facture Billit</b>

<b>Fournisseur:</b> ${this.escapeHtml(invoice.supplier_name)}
<b>Numéro:</b> ${this.escapeHtml(invoice.invoice_number)}
<b>Montant:</b> ${amount}
<b>Date:</b> ${invoiceDate}
<b>Échéance:</b> ${dueDate}
<b>Statut:</b> ${this.getStatusEmoji(invoice.status)} ${this.escapeHtml(invoice.status)}

🔗 <a href="https://my.billit.eu/invoices/${invoice.id}">Voir la facture</a>
    `.trim();
  }

  /**
   * Échappe les caractères HTML pour Telegram
   */
  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /**
   * Retourne un emoji selon le statut de la facture
   */
  private getStatusEmoji(status: string): string {
    const statusLower = status.toLowerCase();
    if (statusLower.includes('paid') || statusLower.includes('payé')) return '✅';
    if (statusLower.includes('pending') || statusLower.includes('attente')) return '⏳';
    if (statusLower.includes('overdue') || statusLower.includes('retard')) return '⚠️';
    return '📄';
  }

  /**
   * Envoie une notification pour une nouvelle facture
   */
  async sendInvoiceNotification(invoice: BillitInvoice): Promise<void> {
    try {
      const message = this.formatInvoiceMessage(invoice);
      await this.bot.sendMessage(this.chatId, message, {
        parse_mode: 'HTML',
        disable_web_page_preview: false,
      });
      console.log(`✓ Notification envoyée pour la facture ${invoice.invoice_number}`);
    } catch (error) {
      console.error('Erreur lors de l\'envoi de la notification:', error);
      throw error;
    }
  }

  /**
   * Envoie un message de test
   */
  async sendTestMessage(): Promise<void> {
    try {
      await this.bot.sendMessage(
        this.chatId,
        '✅ <b>Test de connexion réussi !</b>\n\nLe bot Billit est opérationnel et prêt à envoyer des notifications.',
        { parse_mode: 'HTML' }
      );
      console.log('✓ Message de test envoyé');
    } catch (error) {
      console.error('Erreur lors de l\'envoi du message de test:', error);
      throw error;
    }
  }

  /**
   * Envoie un message d'erreur
   */
  async sendErrorMessage(error: string): Promise<void> {
    try {
      await this.bot.sendMessage(
        this.chatId,
        `❌ <b>Erreur Billit Notifier</b>\n\n${this.escapeHtml(error)}`,
        { parse_mode: 'HTML' }
      );
    } catch (err) {
      console.error('Erreur lors de l\'envoi du message d\'erreur:', err);
    }
  }
}
