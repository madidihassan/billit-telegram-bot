import fs from 'fs';
import path from 'path';

/**
 * Service de gestion des alertes personnalisées
 * 🚀 OUTIL 10: Système d'alertes pour surveiller les KPIs financiers
 */

export interface Alert {
  id: string;
  userId: string;
  type: 'unpaid_threshold' | 'overdue_count' | 'balance_below' | 'large_expense';
  threshold: number;
  enabled: boolean;
  createdAt: string;
  lastTriggered?: string;
  description: string;
}

export interface AlertTrigger {
  alert: Alert;
  currentValue: number;
  message: string;
}

export class AlertService {
  private alertsFile: string;
  private alerts: Alert[] = [];

  constructor() {
    this.alertsFile = path.join(process.cwd(), 'data', 'alerts.json');
    this.ensureDataDirectory();
    this.loadAlerts();
  }

  /**
   * Crée le répertoire data s'il n'existe pas
   */
  private ensureDataDirectory(): void {
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
  }

  /**
   * Charge les alertes depuis le fichier JSON
   */
  private loadAlerts(): void {
    try {
      if (fs.existsSync(this.alertsFile)) {
        const data = fs.readFileSync(this.alertsFile, 'utf-8');
        this.alerts = JSON.parse(data);
        console.log(`✓ ${this.alerts.length} alerte(s) chargée(s)`);
      } else {
        this.alerts = [];
        this.saveAlerts();
      }
    } catch (error) {
      console.error('❌ Erreur lors du chargement des alertes:', error);
      this.alerts = [];
    }
  }

  /**
   * Sauvegarde les alertes dans le fichier JSON
   */
  private saveAlerts(): void {
    try {
      fs.writeFileSync(this.alertsFile, JSON.stringify(this.alerts, null, 2));
    } catch (error) {
      console.error('❌ Erreur lors de la sauvegarde des alertes:', error);
    }
  }

  /**
   * Crée une nouvelle alerte
   */
  createAlert(userId: string, type: Alert['type'], threshold: number, description?: string): Alert {
    const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const alert: Alert = {
      id,
      userId,
      type,
      threshold,
      enabled: true,
      createdAt: new Date().toISOString(),
      description: description || this.getDefaultDescription(type, threshold),
    };

    this.alerts.push(alert);
    this.saveAlerts();

    console.log(`✓ Alerte créée: ${alert.description}`);
    return alert;
  }

  /**
   * Liste les alertes d'un utilisateur
   */
  listAlerts(userId: string): Alert[] {
    return this.alerts.filter(a => a.userId === userId);
  }

  /**
   * Liste toutes les alertes actives
   */
  listActiveAlerts(userId?: string): Alert[] {
    return this.alerts.filter(a => a.enabled && (!userId || a.userId === userId));
  }

  /**
   * Supprime une alerte
   */
  deleteAlert(userId: string, alertId: string): boolean {
    const index = this.alerts.findIndex(a => a.id === alertId && a.userId === userId);
    if (index !== -1) {
      this.alerts.splice(index, 1);
      this.saveAlerts();
      console.log(`✓ Alerte ${alertId} supprimée`);
      return true;
    }
    return false;
  }

  /**
   * Active/désactive une alerte
   */
  toggleAlert(userId: string, alertId: string, enabled: boolean): boolean {
    const alert = this.alerts.find(a => a.id === alertId && a.userId === userId);
    if (alert) {
      alert.enabled = enabled;
      this.saveAlerts();
      console.log(`✓ Alerte ${alertId} ${enabled ? 'activée' : 'désactivée'}`);
      return true;
    }
    return false;
  }

  /**
   * Vérifie si une alerte doit être déclenchée
   */
  checkAlert(alert: Alert, currentValue: number): AlertTrigger | null {
    if (!alert.enabled) return null;

    let shouldTrigger = false;
    let message = '';

    switch (alert.type) {
      case 'unpaid_threshold':
        shouldTrigger = currentValue > alert.threshold;
        message = `⚠️ Alerte: Factures impayées (${currentValue.toFixed(2)}€) dépassent le seuil (${alert.threshold}€)`;
        break;

      case 'overdue_count':
        shouldTrigger = currentValue > alert.threshold;
        message = `⚠️ Alerte: Factures en retard (${currentValue}) dépassent le seuil (${alert.threshold})`;
        break;

      case 'balance_below':
        shouldTrigger = currentValue < alert.threshold;
        message = `⚠️ Alerte: Balance (${currentValue.toFixed(2)}€) inférieure au seuil (${alert.threshold}€)`;
        break;

      case 'large_expense':
        shouldTrigger = currentValue > alert.threshold;
        message = `⚠️ Alerte: Dépense importante détectée (${currentValue.toFixed(2)}€) > seuil (${alert.threshold}€)`;
        break;
    }

    if (shouldTrigger) {
      // Mettre à jour lastTriggered
      alert.lastTriggered = new Date().toISOString();
      this.saveAlerts();

      return {
        alert,
        currentValue,
        message,
      };
    }

    return null;
  }

  /**
   * Vérifie toutes les alertes actives d'un utilisateur
   */
  checkAllAlerts(userId: string, values: {
    unpaidTotal?: number;
    overdueCount?: number;
    balance?: number;
    lastExpense?: number;
  }): AlertTrigger[] {
    const activeAlerts = this.listActiveAlerts(userId);
    const triggers: AlertTrigger[] = [];

    for (const alert of activeAlerts) {
      let currentValue = 0;

      switch (alert.type) {
        case 'unpaid_threshold':
          currentValue = values.unpaidTotal || 0;
          break;
        case 'overdue_count':
          currentValue = values.overdueCount || 0;
          break;
        case 'balance_below':
          currentValue = values.balance || 0;
          break;
        case 'large_expense':
          currentValue = values.lastExpense || 0;
          break;
      }

      const trigger = this.checkAlert(alert, currentValue);
      if (trigger) {
        triggers.push(trigger);
      }
    }

    return triggers;
  }

  /**
   * Génère une description par défaut pour une alerte
   */
  private getDefaultDescription(type: Alert['type'], threshold: number): string {
    switch (type) {
      case 'unpaid_threshold':
        return `Factures impayées > ${threshold}€`;
      case 'overdue_count':
        return `Factures en retard > ${threshold}`;
      case 'balance_below':
        return `Balance < ${threshold}€`;
      case 'large_expense':
        return `Dépense > ${threshold}€`;
    }
  }

  /**
   * Obtient le nombre total d'alertes
   */
  getAlertCount(): number {
    return this.alerts.length;
  }

  /**
   * Obtient le nombre d'alertes actives
   */
  getActiveAlertCount(): number {
    return this.alerts.filter(a => a.enabled).length;
  }
}
