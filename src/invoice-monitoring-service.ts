/**
 * Service de monitoring automatique des factures
 * Vérifie périodiquement l'arrivée de nouvelles factures et notifie les utilisateurs
 */

import { BillitClient } from './billit-client';
import { TelegramBotInteractive } from './telegram-bot';
import { BillitInvoice } from './types';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface MonitoringConfig {
  enabled: boolean;
  intervalMinutes: number;
  checkPaid: boolean;
  checkUnpaid: boolean;
  storageFile: string;
}

export interface NotificationStats {
  lastCheck: Date;
  totalChecked: number;
  newInvoices: number;
  notificationsSent: number;
  errors: number;
}

export class InvoiceMonitoringService {
  private bot: TelegramBotInteractive;
  private billitClient: BillitClient;
  private config: MonitoringConfig;
  private intervalId: NodeJS.Timeout | null = null;
  private processedInvoices: Set<string> = new Set();
  private stats: NotificationStats = {
    lastCheck: new Date(),
    totalChecked: 0,
    newInvoices: 0,
    notificationsSent: 0,
    errors: 0,
  };

  constructor(bot: TelegramBotInteractive, billitClient: BillitClient, config: MonitoringConfig) {
    this.bot = bot;
    this.billitClient = billitClient;
    this.config = config;
  }

  /**
   * Démarre le monitoring automatique
   */
  async start(): Promise<void> {
    if (!this.config.enabled) {
      console.log('📊 Monitoring des factures désactivé (INVOICE_MONITORING_ENABLED=false)');
      return;
    }

    console.log(`📊 Démarrage du monitoring des factures (toutes les ${this.config.intervalMinutes} min)`);

    // Charger les factures déjà traitées
    await this.loadProcessedInvoices();

    // Lancer le polling
    this.intervalId = setInterval(
      () => this.checkForNewInvoices(),
      this.config.intervalMinutes * 60 * 1000
    );

    // Première vérification immédiate
    await this.checkForNewInvoices();
  }

  /**
   * Arrête le monitoring automatique
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('📊 Monitoring des factures arrêté');
    }
  }

  /**
   * Vérifie les nouvelles factures et envoie des notifications
   */
  private async checkForNewInvoices(): Promise<void> {
    try {
      this.stats.lastCheck = new Date();
      console.log(`🔍 [${new Date().toISOString()}] Vérification des nouvelles factures (incl. brouillons)...`);

      // Récupérer TOUS les documents (factures + brouillons/saisi rapide)
      const allDocuments = await this.billitClient.getAllDocuments({ limit: 100 });

      // Filtrer les nouveaux documents
      const newDocuments = this.filterNewInvoices(allDocuments);

      this.stats.totalChecked += allDocuments.length;
      this.stats.newInvoices += newDocuments.length;

      // Envoyer les notifications
      if (newDocuments.length > 0) {
        console.log(`📬 ${newDocuments.length} nouveau(x) document(s) détecté(s)`);

        for (const doc of newDocuments) {
          await this.notifyNewInvoice(doc);
          this.processedInvoices.add(doc.id);
          this.stats.notificationsSent++;
        }

        // Sauvegarder les IDs traités
        await this.saveProcessedInvoices();
      } else {
        console.log('✅ Aucun nouveau document');
      }

      this.logStats();
    } catch (error) {
      this.stats.errors++;
      console.error('❌ Erreur lors de la vérification des factures:', error);
    }
  }

  /**
   * Filtre les factures déjà traitées
   */
  private filterNewInvoices(invoices: BillitInvoice[]): BillitInvoice[] {
    return invoices.filter(invoice => !this.processedInvoices.has(invoice.id));
  }

  /**
   * Envoie une notification pour une nouvelle facture
   */
  private async notifyNewInvoice(invoice: BillitInvoice): Promise<void> {
    const isPaid = invoice.status.toLowerCase() === 'paid' || invoice.status.toLowerCase() === 'payé';
    const statusIcon = isPaid ? '✅' : '⏳';

    // Détecter si c'est un brouillon (draft) basé sur l'absence de numéro de facture ou un ID spécifique
    const isDraft = !invoice.invoice_number || invoice.invoice_number.startsWith('BRO') || invoice.invoice_number === '';

    let message: string;

    if (isDraft) {
      // Notification pour un brouillon / saisie rapide
      message = `
📝 <b>Nouveau Brouillon / Saisie Rapide</b>

🏢 <b>Fournisseur:</b> ${this.escapeHtml(invoice.supplier_name)}
🆔 <b>ID:</b> ${this.escapeHtml(invoice.id)}
💰 <b>Montant:</b> ${invoice.total_amount.toFixed(2)} ${invoice.currency}
📅 <b>Créé le:</b> ${new Date(invoice.created_at).toLocaleDateString('fr-FR')}

⚠️ <b>Document en cours de saisie</b> - À compléter dans Billit
      `.trim();
    } else {
      // Notification pour une facture complète
      const statusText = isPaid ? 'PAYÉE' : 'IMPAYÉE';
      message = `
${statusIcon} <b>Nouvelle Facture ${statusText}</b>

🏢 <b>Fournisseur:</b> ${this.escapeHtml(invoice.supplier_name)}
📄 <b>N° Facture:</b> ${this.escapeHtml(invoice.invoice_number)}
💰 <b>Montant:</b> ${invoice.total_amount.toFixed(2)} ${invoice.currency}
📅 <b>Date:</b> ${new Date(invoice.invoice_date).toLocaleDateString('fr-FR')}

${isPaid ? '✨ Cette facture a été réglée' : '⚠️ Cette facture est en attente de paiement'}
      `.trim();
    }

    try {
      const docType = isDraft ? 'BROUILLON' : invoice.invoice_number;

      // Pour les factures complètes (pas les brouillons), essayer d'envoyer le PDF
      if (!isDraft) {
        console.log(`📥 Tentative de téléchargement du PDF pour ${docType}...`);
        const pdfBuffer = await this.billitClient.downloadInvoicePdf(invoice.id);

        if (pdfBuffer) {
          // Envoyer le PDF avec le message en légende
          const filename = `Facture_${invoice.invoice_number}_${invoice.supplier_name.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
          await this.bot.broadcastDocument(pdfBuffer, filename, message);
          console.log(`📤 PDF envoyé: ${docType} (${invoice.supplier_name})`);
          return;
        } else {
          console.log(`⚠️  PDF non disponible pour ${docType}, ajout du lien`);
          // Fallback: ajouter le lien vers le PDF
          const pdfLink = `\n\n📥 <a href="https://my.billit.eu/invoices/${invoice.id}">Télécharger le PDF</a>`;
          message += pdfLink;
        }
      }

      // Envoyer le message texte (pour les brouillons ou si le PDF n'est pas disponible)
      await this.bot.broadcastMessage(message);
      console.log(`📤 Notification envoyée: ${docType} (${invoice.supplier_name})`);
    } catch (error) {
      console.error(`❌ Erreur lors de l'envoi de la notification:`, error);
    }
  }

  /**
   * Charge les IDs de factures déjà traitées depuis un fichier
   */
  private async loadProcessedInvoices(): Promise<void> {
    try {
      const filePath = this.config.storageFile;
      const content = await fs.readFile(filePath, 'utf-8');
      const ids = JSON.parse(content);
      this.processedInvoices = new Set(ids);
      console.log(`📂 ${this.processedInvoices.size} facture(s) déjà traitée(s) chargée(s)`);
    } catch (error) {
      // Fichier n'existe pas ou erreur de lecture - c'est normal pour la première exécution
      console.log('📂 Aucune facture traitée précédemment (première exécution)');
      this.processedInvoices = new Set();
    }
  }

  /**
   * Sauvegarde les IDs de factures traitées dans un fichier
   */
  private async saveProcessedInvoices(): Promise<void> {
    try {
      const filePath = this.config.storageFile;
      const dir = path.dirname(filePath);

      // Créer le dossier si nécessaire
      await fs.mkdir(dir, { recursive: true });

      // Sauvegarder les IDs
      const ids = Array.from(this.processedInvoices);
      await fs.writeFile(filePath, JSON.stringify(ids, null, 2), 'utf-8');
    } catch (error) {
      console.error('❌ Erreur lors de la sauvegarde des factures traitées:', error);
    }
  }

  /**
   * Affiche les statistiques de monitoring
   */
  private logStats(): void {
    console.log(
      `📊 Stats: ✅ ${this.stats.notificationsSent} notifications | ` +
      `🔍 ${this.stats.totalChecked} vérifiées | ` +
      `❌ ${this.stats.errors} erreurs`
    );
  }

  /**
   * Retourne les statistiques actuelles
   */
  getStats(): NotificationStats {
    return { ...this.stats };
  }

  /**
   * Réinitialise les factures traitées (pour tests)
   */
  async resetProcessedInvoices(): Promise<void> {
    this.processedInvoices.clear();
    await this.saveProcessedInvoices();
    console.log('🔄 Factures traitées réinitialisées');
  }

  /**
   * Échappe les caractères HTML pour Telegram
   */
  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
