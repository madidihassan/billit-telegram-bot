/**
 * Service de monitoring automatique des factures
 * Vérifie périodiquement l'arrivée de nouvelles factures et notifie les utilisateurs
 */

import { BillitClient } from './billit-client';
import { InvoiceNotifier } from './types/notifier';
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
  private bot: InvoiceNotifier;
  private billitClient: BillitClient;
  private config: MonitoringConfig;
  private intervalId: NodeJS.Timeout | null = null;
  private processedInvoices: Set<string> = new Set();
  private notifiedOverdueInvoices: Map<string, number> = new Map(); // ID facture -> timestamp dernière notification
  private readonly REMINDER_INTERVAL_DAYS = 7; // Rappel tous les 7 jours
  /**
   * Contexte des boutons "Marquer Payé" : invoice.id → infos d'affichage.
   * Évite de packer invoice_number + supplier_name dans callback_data (limite Telegram 64 bytes).
   * Ex : pour "Coca-Cola Europacific Partners Belgium SRL", l'ancien format dépassait silencieusement
   * la limite → bouton non envoyé. Cf. finding #15+#16 de l'analyse.
   */
  private payButtonContext: Map<string, { invoiceNumber: string; supplierName: string; createdAt: number }> = new Map();
  /** TTL du contexte des boutons (24h). Au-delà, l'user doit re-déclencher l'action via /unpaid. */
  private readonly PAY_CONTEXT_TTL_MS = 24 * 60 * 60 * 1000;
  /** Plafond de taille pour éviter une croissance non bornée. */
  private readonly PAY_CONTEXT_MAX_SIZE = 500;
  private stats: NotificationStats = {
    lastCheck: new Date(),
    totalChecked: 0,
    newInvoices: 0,
    notificationsSent: 0,
    errors: 0,
  };

  constructor(bot: InvoiceNotifier, billitClient: BillitClient, config: MonitoringConfig) {
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
    await this.loadNotifiedOverdueInvoices();

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

      // Vérifier les factures en retard
      await this.checkForOverdueInvoices();

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
   * Vérifie les factures impayées dont l'échéance est dépassée
   */
  private async checkForOverdueInvoices(): Promise<void> {
    try {
      console.log('⏰ Vérification des factures en retard...');

      // Récupérer les factures impayées
      const overdueInvoices = await this.billitClient.getOverdueInvoices();

      if (overdueInvoices.length === 0) {
        console.log('✅ Aucune facture en retard');
        return;
      }

      const now = Date.now();
      const invoicesToNotify: any[] = [];

      // Vérifier chaque facture en retard
      for (const invoice of overdueInvoices) {
        const lastNotified = this.notifiedOverdueInvoices.get(invoice.id);

        if (!lastNotified) {
          // Jamais notifiée - première notification
          invoicesToNotify.push({ invoice, isReminder: false });
        } else {
          // Déjà notifiée - vérifier si rappel nécessaire (7 jours)
          const daysSinceLastNotif = (now - lastNotified) / (1000 * 60 * 60 * 24);

          if (daysSinceLastNotif >= this.REMINDER_INTERVAL_DAYS) {
            // Rappel hebdomadaire
            invoicesToNotify.push({ invoice, isReminder: true });
          }
        }
      }

      if (invoicesToNotify.length === 0) {
        console.log(`✅ ${overdueInvoices.length} facture(s) en retard (déjà notifiées, rappels non dus)`);
        return;
      }

      const newCount = invoicesToNotify.filter(i => !i.isReminder).length;
      const reminderCount = invoicesToNotify.filter(i => i.isReminder).length;

      console.log(`⚠️ ${newCount} nouvelle(s) facture(s) en retard + ${reminderCount} rappel(s) hebdomadaire(s)`);

      // Envoyer les notifications
      for (const { invoice, isReminder } of invoicesToNotify) {
        await this.notifyOverdueInvoice(invoice, isReminder);
        this.notifiedOverdueInvoices.set(invoice.id, now);
        this.stats.notificationsSent++;
      }

      // Sauvegarder les timestamps
      await this.saveNotifiedOverdueInvoices();
    } catch (error) {
      console.error('❌ Erreur lors de la vérification des factures en retard:', error);
    }
  }

  /**
   * Envoie une notification pour une facture en retard
   */
  private async notifyOverdueInvoice(invoice: BillitInvoice, isReminder: boolean = false): Promise<void> {
    const today = new Date();
    const dueDate = new Date(invoice.due_date);
    const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));

    let message: string;

    if (isReminder) {
      // Message de rappel hebdomadaire
      message = `
🔔 <b>RAPPEL - FACTURE EN RETARD</b>

🏢 <b>Fournisseur:</b> ${this.escapeHtml(invoice.supplier_name)}
📄 <b>N° Facture:</b> ${this.escapeHtml(invoice.invoice_number)}
💰 <b>Montant:</b> ${invoice.total_amount.toFixed(2)} ${invoice.currency}
📅 <b>Date facture:</b> ${new Date(invoice.invoice_date).toLocaleDateString('fr-FR')}
⏰ <b>Date d'échéance:</b> ${dueDate.toLocaleDateString('fr-FR')}

🔴 <b>Retard: ${daysOverdue} jour(s)</b>

⚠️ Cette facture est toujours impayée
🔔 Rappel hebdomadaire
      `.trim();
    } else {
      // Première notification de retard
      message = `
⚠️ <b>FACTURE EN RETARD</b>

🏢 <b>Fournisseur:</b> ${this.escapeHtml(invoice.supplier_name)}
📄 <b>N° Facture:</b> ${this.escapeHtml(invoice.invoice_number)}
💰 <b>Montant:</b> ${invoice.total_amount.toFixed(2)} ${invoice.currency}
📅 <b>Date facture:</b> ${new Date(invoice.invoice_date).toLocaleDateString('fr-FR')}
⏰ <b>Date d'échéance:</b> ${dueDate.toLocaleDateString('fr-FR')}

🔴 <b>Retard: ${daysOverdue} jour(s)</b>

⚠️ Cette facture aurait dû être payée avant le ${dueDate.toLocaleDateString('fr-FR')}
      `.trim();
    }

    try {
      await this.bot.broadcastMessage(message);
      const notifType = isReminder ? 'Rappel hebdomadaire' : 'Alerte retard';
      console.log(`📤 ${notifType} envoyé: ${invoice.invoice_number} (${invoice.supplier_name}) - ${daysOverdue}j de retard`);
    } catch (error) {
      console.error(`❌ Erreur lors de l'envoi de l'alerte de retard:`, error);
    }
  }

  /**
   * Traduit le statut de la facture en français
   */
  private translateStatus(status: string): string {
    const statusLower = status.toLowerCase();

    // Mapping des statuts Billit vers français
    const translations: { [key: string]: string } = {
      'topay': 'À Payer',
      'paid': 'Payée',
      'pending': 'En attente',
      'overdue': 'En retard',
      'draft': 'Brouillon',
      'cancelled': 'Annulée',
      'payé': 'Payée',
      'payée': 'Payée'
    };

    // Chercher une correspondance exacte (insensible à la casse)
    for (const [key, value] of Object.entries(translations)) {
      if (statusLower === key) {
        return value;
      }
    }

    // Si aucune correspondance, retourner le statut original avec première lettre en majuscule
    return status.charAt(0).toUpperCase() + status.slice(1);
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
📊 <b>Statut:</b> ${this.translateStatus(invoice.status)}

⚠️ <b>Document en cours de saisie</b> - À compléter dans Billit
      `.trim();
    } else {
      // Notification pour une facture complète
      const statusTranslated = this.translateStatus(invoice.status);

      // Formater la date d'échéance si disponible
      const dueDateLine = invoice.due_date
        ? `\n📆 <b>Date d'échéance:</b> ${new Date(invoice.due_date).toLocaleDateString('fr-FR')}`
        : '';

      // Communication structurée si disponible
      const commLine = invoice.communication
        ? `\n📝 <b>Communication:</b> ${this.escapeHtml(invoice.communication)}`
        : '';

      message = `
${statusIcon} <b>Nouvelle Facture</b>

🏢 <b>Fournisseur:</b> ${this.escapeHtml(invoice.supplier_name)}
📄 <b>N° Facture:</b> ${this.escapeHtml(invoice.invoice_number)}
💰 <b>Montant:</b> ${invoice.total_amount.toFixed(2)} ${invoice.currency}
📅 <b>Date:</b> ${new Date(invoice.invoice_date).toLocaleDateString('fr-FR')}${dueDateLine}${commLine}
📊 <b>Statut:</b> ${statusIcon} ${statusTranslated}

${isPaid ? '✨ Cette facture a été réglée' : '⚠️ Cette facture est en attente de paiement'}
      `.trim();
    }

    try {
      const docType = isDraft ? 'BROUILLON' : invoice.invoice_number;

      // Bouton "Payé" inline pour les factures non payées
      // callback_data limité à 64 bytes par Telegram → on garde uniquement l'ID, et on stocke
      // invoice_number + supplier_name dans `payButtonContext` (lu par le handler du bot).
      // Comparaison stricte, alignée sur billit-client (getUnpaidInvoices / getPaidInvoices) :
      // un `includes('paid')` classerait « unpaid » ou « partiallyPaid » comme payées et
      // supprimerait silencieusement le bouton.
      const normalizedStatus = invoice.status?.toLowerCase();
      const isPaidStatus = normalizedStatus === 'paid' || normalizedStatus === 'payé';
      let payButton: any = undefined;
      if (!isDraft && !isPaidStatus) {
        this.registerPayContext(invoice);
        payButton = {
          inline_keyboard: [[
            { text: '💰 Marquer Payé', callback_data: `pay_invoice:${invoice.id}` }
          ]]
        };
      }

      // Pour les factures complètes (pas les brouillons), essayer d'envoyer le PDF
      if (!isDraft) {
        console.log(`📥 Tentative de téléchargement du PDF pour ${docType}...`);
        const pdfBuffer = await this.billitClient.downloadInvoicePdf(invoice.id);

        if (pdfBuffer) {
          // Envoyer le PDF avec le message en légende + bouton Payé
          const filename = `Facture_${invoice.invoice_number}_${invoice.supplier_name.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
          await this.bot.broadcastDocument(pdfBuffer, filename, message, payButton);
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
   * Charge les IDs de factures en retard déjà notifiées avec leurs timestamps
   */
  private async loadNotifiedOverdueInvoices(): Promise<void> {
    try {
      const filePath = this.config.storageFile.replace('.json', '-overdue.json');
      const content = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(content);

      // Convertir l'objet en Map
      if (Array.isArray(data)) {
        // Ancien format (Set) - convertir en Map avec timestamp actuel
        this.notifiedOverdueInvoices = new Map(data.map((id: string) => [id, Date.now()]));
      } else {
        // Nouveau format (Map avec timestamps)
        this.notifiedOverdueInvoices = new Map(Object.entries(data));
      }

      console.log(`📂 ${this.notifiedOverdueInvoices.size} facture(s) en retard déjà notifiée(s) chargée(s)`);
    } catch (error) {
      // Fichier n'existe pas - c'est normal pour la première exécution
      console.log('📂 Aucune facture en retard notifiée précédemment');
      this.notifiedOverdueInvoices = new Map();
    }
  }

  /**
   * Sauvegarde les IDs de factures en retard notifiées avec leurs timestamps
   */
  private async saveNotifiedOverdueInvoices(): Promise<void> {
    try {
      const filePath = this.config.storageFile.replace('.json', '-overdue.json');
      const dir = path.dirname(filePath);

      // Créer le dossier si nécessaire
      await fs.mkdir(dir, { recursive: true });

      // Convertir la Map en objet pour JSON
      const data = Object.fromEntries(this.notifiedOverdueInvoices);
      await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (error) {
      console.error('❌ Erreur lors de la sauvegarde des factures en retard notifiées:', error);
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

  /**
   * Marque une facture comme payée dans Billit via l'API.
   *
   * L'erreur est propagée : l'appelant (le handler du bouton « Marquer Payé »)
   * doit pouvoir distinguer un succès d'un échec, sans quoi il confirmerait à
   * l'utilisateur un paiement que Billit a refusé.
   */
  async markInvoicePaid(orderId: string): Promise<void> {
    try {
      await this.billitClient.addPaymentToOrder(orderId);
      console.log(`✅ Facture ${orderId} marquée comme payée dans Billit`);
    } catch (err: any) {
      console.error(`❌ Erreur marquage payé Billit ${orderId}:`, err.message);
      throw err;
    }
  }

  /**
   * Enregistre les infos d'affichage liées à un bouton "Marquer Payé" pour une facture donnée.
   * Pruning automatique : drop entrées > 24h, et capping à PAY_CONTEXT_MAX_SIZE entrées.
   */
  private registerPayContext(invoice: BillitInvoice): void {
    const now = Date.now();
    // Purge les entrées expirées avant insertion
    for (const [id, ctx] of this.payButtonContext) {
      if (now - ctx.createdAt >= this.PAY_CONTEXT_TTL_MS) {
        this.payButtonContext.delete(id);
      }
    }
    // Si toujours plein après purge, drop la plus ancienne (FIFO sur insertion order)
    if (this.payButtonContext.size >= this.PAY_CONTEXT_MAX_SIZE) {
      const oldest = this.payButtonContext.keys().next().value;
      if (oldest !== undefined) this.payButtonContext.delete(oldest);
    }
    this.payButtonContext.set(invoice.id, {
      invoiceNumber: invoice.invoice_number,
      supplierName: invoice.supplier_name,
      createdAt: now,
    });
  }

  /**
   * Récupère le contexte d'affichage d'un bouton "Marquer Payé". Retourne undefined si la
   * notification d'origine est trop vieille (>24h) — l'user devra retrouver la facture autrement.
   */
  getPayContext(invoiceId: string): { invoiceNumber: string; supplierName: string } | undefined {
    const ctx = this.payButtonContext.get(invoiceId);
    if (!ctx) return undefined;
    if (Date.now() - ctx.createdAt >= this.PAY_CONTEXT_TTL_MS) {
      this.payButtonContext.delete(invoiceId);
      return undefined;
    }
    return { invoiceNumber: ctx.invoiceNumber, supplierName: ctx.supplierName };
  }
}
