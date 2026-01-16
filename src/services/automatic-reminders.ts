/**
 * Service de rappels automatiques
 * Envoie des notifications programmées (factures en retard, résumés, etc.)
 *
 * @module AutomaticReminders
 * @category Services
 */

import { BillitClient } from '../billit-client';
import { logInfo, logDebug, logWarn } from '../utils/logger';

/**
 * Configuration d'un rappel
 */
export interface ReminderConfig {
  enabled: boolean;
  dayOfWeek?: number; // 0-6 (0 = Dimanche)
  hour: number;       // 0-23
  message: string;
}

/**
 * Service de rappels automatiques
 */
export class AutomaticRemindersService {
  private intervalId: NodeJS.Timeout | null = null;
  private billitClient: BillitClient;
  private sendMessageCallback: ((message: string) => Promise<void>) | null = null;
  private isRunning = false;

  // Configurations par défaut
  private reminders: Record<string, ReminderConfig> = {
    mondayOverdue: {
      enabled: true,
      dayOfWeek: 1, // Lundi
      hour: 9,
      message: 'overdue_invoices'
    },
    fridaySummary: {
      enabled: true,
      dayOfWeek: 5, // Vendredi
      hour: 17,
      message: 'weekly_summary'
    }
  };

  constructor(billitClient: BillitClient) {
    this.billitClient = billitClient;
  }

  /**
   * Configurer la callback pour envoyer des messages
   */
  setSendMessageCallback(callback: (message: string) => Promise<void>): void {
    this.sendMessageCallback = callback;
    logDebug('Callback d\'envoi de messages configurée', 'automatic-reminders');
  }

  /**
   * Démarrer le service de rappels
   */
  start(): void {
    if (this.isRunning) {
      logWarn('Service de rappels déjà démarré', 'automatic-reminders');
      return;
    }

    // Vérifier toutes les heures
    this.intervalId = setInterval(async () => {
      await this.checkAndSendReminders();
    }, 60 * 60 * 1000); // 1 heure

    // Vérifier immédiatement au démarrage
    this.checkAndSendReminders().catch(err => {
      logWarn(`Erreur vérification rappels: ${err.message}`, 'automatic-reminders');
    });

    this.isRunning = true;
    logInfo('⏰ Service de rappels automatiques démarré (vérification chaque heure)', 'automatic-reminders');
  }

  /**
   * Arrêter le service
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.isRunning = false;
    logInfo('Service de rappels automatiques arrêté', 'automatic-reminders');
  }

  /**
   * Vérifier et envoyer les rappels programmés
   */
  private async checkAndSendReminders(): Promise<void> {
    if (!this.sendMessageCallback) {
      logDebug('Pas de callback configurée, rappels ignorés', 'automatic-reminders');
      return;
    }

    const now = new Date();
    const currentDay = now.getDay();
    const currentHour = now.getHours();

    logDebug(`Vérification rappels: ${this.getDayName(currentDay)} ${currentHour}h`, 'automatic-reminders');

    // Vérifier chaque rappel configuré
    for (const [name, config] of Object.entries(this.reminders)) {
      if (!config.enabled) continue;

      // Vérifier si le rappel doit être envoyé maintenant
      const shouldSend =
        (config.dayOfWeek === undefined || config.dayOfWeek === currentDay) &&
        config.hour === currentHour;

      if (shouldSend) {
        try {
          await this.sendReminder(config.message);
          logInfo(`📢 Rappel envoyé: ${name}`, 'automatic-reminders');
        } catch (error: any) {
          logWarn(`Erreur envoi rappel ${name}: ${error.message}`, 'automatic-reminders');
        }
      }
    }
  }

  /**
   * Envoyer un rappel spécifique
   */
  private async sendReminder(type: string): Promise<void> {
    if (!this.sendMessageCallback) return;

    switch (type) {
      case 'overdue_invoices':
        await this.sendOverdueInvoicesReminder();
        break;

      case 'weekly_summary':
        await this.sendWeeklySummary();
        break;

      default:
        logWarn(`Type de rappel inconnu: ${type}`, 'automatic-reminders');
    }
  }

  /**
   * Rappel des factures en retard (Lundi 9h)
   */
  private async sendOverdueInvoicesReminder(): Promise<void> {
    try {
      // Récupérer les factures en retard
      const allInvoices = await this.billitClient.getInvoices({ limit: 120 });
      const overdueInvoices = allInvoices.filter(inv => {
        const dueDate = new Date(inv.due_date);
        const isPaid = inv.status?.toLowerCase().includes('paid') ||
                       inv.status?.toLowerCase().includes('payé');
        return !isPaid && dueDate < new Date();
      });

      if (overdueInvoices.length === 0) {
        // Aucune facture en retard, envoyer un message positif
        const message = `✅ Bon lundi! Aucune facture en retard. Tout est à jour! 🎉`;
        await this.sendMessageCallback!(message);
        return;
      }

      // Calculer le montant total
      const totalAmount = overdueInvoices.reduce((sum, inv) => sum + inv.total_amount, 0);

      // Grouper par urgence
      const veryOverdue = overdueInvoices.filter(inv => {
        const daysLate = Math.floor((Date.now() - new Date(inv.due_date).getTime()) / (1000 * 60 * 60 * 24));
        return daysLate > 30;
      });

      const message =
        `⚠️ **Rappel Lundi Matin**\n\n` +
        `Tu as **${overdueInvoices.length} facture(s) en retard**\n` +
        `💰 Montant total: **${totalAmount.toFixed(2)}€**\n\n` +
        (veryOverdue.length > 0
          ? `🚨 Dont ${veryOverdue.length} en retard de +30 jours\n\n`
          : '') +
        `Veux-tu voir le détail? Tape "factures en retard" ou utilise /overdue`;

      await this.sendMessageCallback!(message);

    } catch (error: any) {
      logWarn(`Erreur rappel factures en retard: ${error.message}`, 'automatic-reminders');
    }
  }

  /**
   * Résumé hebdomadaire (Vendredi 17h)
   */
  private async sendWeeklySummary(): Promise<void> {
    try {
      // Récupérer les factures de la semaine
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);

      const allInvoices = await this.billitClient.getInvoices({ limit: 120 });
      const weekInvoices = allInvoices.filter(inv => {
        const invDate = new Date(inv.invoice_date);
        return invDate >= weekAgo;
      });

      if (weekInvoices.length === 0) {
        const message = `📊 **Résumé de la semaine**\n\nAucune nouvelle facture cette semaine. Calme plat! ☕`;
        await this.sendMessageCallback!(message);
        return;
      }

      // Calculer les stats
      const paid = weekInvoices.filter(inv =>
        inv.status?.toLowerCase().includes('paid') ||
        inv.status?.toLowerCase().includes('payé')
      );

      const totalAmount = weekInvoices.reduce((sum, inv) => sum + inv.total_amount, 0);
      const paidAmount = paid.reduce((sum, inv) => sum + inv.total_amount, 0);

      // Top 3 fournisseurs
      const supplierTotals: Record<string, number> = {};
      for (const inv of weekInvoices) {
        const supplier = inv.supplier_name || 'Inconnu';
        supplierTotals[supplier] = (supplierTotals[supplier] || 0) + inv.total_amount;
      }

      const topSuppliers = Object.entries(supplierTotals)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([name, amount], idx) => `${idx + 1}. ${name}: ${amount.toFixed(2)}€`)
        .join('\n');

      const message =
        `📊 **Résumé Hebdomadaire**\n\n` +
        `📅 Semaine du ${weekAgo.toLocaleDateString('fr-BE')}\n\n` +
        `📋 **${weekInvoices.length} nouvelle(s) facture(s)**\n` +
        `💰 Montant total: ${totalAmount.toFixed(2)}€\n` +
        `✅ Payées: ${paid.length} (${paidAmount.toFixed(2)}€)\n` +
        `⏳ En attente: ${weekInvoices.length - paid.length}\n\n` +
        `🏆 **Top 3 fournisseurs:**\n${topSuppliers}\n\n` +
        `Bon weekend! 🎉`;

      await this.sendMessageCallback!(message);

    } catch (error: any) {
      logWarn(`Erreur résumé hebdomadaire: ${error.message}`, 'automatic-reminders');
    }
  }

  /**
   * Activer/désactiver un rappel
   */
  toggleReminder(name: string, enabled: boolean): boolean {
    if (!this.reminders[name]) {
      logWarn(`Rappel inconnu: ${name}`, 'automatic-reminders');
      return false;
    }

    this.reminders[name].enabled = enabled;
    logInfo(`Rappel ${name} ${enabled ? 'activé' : 'désactivé'}`, 'automatic-reminders');
    return true;
  }

  /**
   * Configurer un rappel personnalisé
   */
  setReminder(name: string, config: ReminderConfig): void {
    this.reminders[name] = config;
    logInfo(`Rappel ${name} configuré: ${this.getDayName(config.dayOfWeek)} à ${config.hour}h`, 'automatic-reminders');
  }

  /**
   * Obtenir le nom du jour
   */
  private getDayName(day?: number): string {
    if (day === undefined) return 'Tous les jours';

    const days = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
    return days[day] || 'Inconnu';
  }

  /**
   * Obtenir l'état du service
   */
  getStatus(): {
    isRunning: boolean;
    reminders: Array<{
      name: string;
      enabled: boolean;
      schedule: string;
    }>;
  } {
    return {
      isRunning: this.isRunning,
      reminders: Object.entries(this.reminders).map(([name, config]) => ({
        name,
        enabled: config.enabled,
        schedule: `${this.getDayName(config.dayOfWeek)} à ${config.hour}h`
      }))
    };
  }
}
