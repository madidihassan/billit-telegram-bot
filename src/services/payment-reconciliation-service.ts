/**
 * Service de réconciliation automatique paiements-factures
 *
 * Logique de notification :
 * - Run AUTO (toutes les 30 min) : notifie une correspondance max 1 fois par 24h
 * - Run MANUEL (/reconcile)      : ignore le cooldown, montre TOUJOURS les correspondances actives
 * - Une correspondance disparaît seulement quand la facture est payée dans Billit
 */

import axios, { AxiosInstance } from 'axios';
import { config } from '../config';
import { BillitClient } from '../billit-client';
import { BankClient, BankTransaction } from '../bank-client';
import { BillitInvoice } from '../types';
import { TelegramBotInteractive } from '../telegram-bot';
import * as fs from 'fs';
import * as path from 'path';

// ─────────────────────────────────────────────
// Types internes
// ─────────────────────────────────────────────

type Confidence = 'high' | 'medium' | 'low';

interface ReconciliationMatch {
  invoice: BillitInvoice;
  transaction: BankTransaction;
  confidence: Confidence;
  matchReason: string;
}

interface ReconciliationStore {
  /**
   * Cooldown par correspondance : "invoiceId_txId" → timestamp dernière notification
   * Une correspondance peut être re-notifiée après COOLDOWN_MS (24h auto / toujours en manuel)
   */
  notified: Record<string, number>;
  lastRun: string | null;
}

// ─────────────────────────────────────────────
// Service principal
// ─────────────────────────────────────────────

export class PaymentReconciliationService {
  private billitClient: BillitClient;
  private bankClient: BankClient;
  private bot: TelegramBotInteractive;
  private axiosInstance: AxiosInstance;
  private intervalId: NodeJS.Timeout | null = null;
  private store: ReconciliationStore = { notified: {}, lastRun: null };
  private readonly storePath: string;
  /** Suggestions en attente de confirmation : key → match (pour les boutons inline) */
  private pendingSuggestions: Map<string, ReconciliationMatch> = new Map();

  private readonly INTERVAL_MS = 30 * 60 * 1000;       // 30 minutes
  private readonly FIRST_RUN_DELAY_MS = 2 * 60 * 1000; // 2 minutes
  private readonly LOOKBACK_DAYS = 90;
  private readonly AMOUNT_TOLERANCE = 0.01;
  private readonly MAX_DAYS_AFTER_INVOICE = 90;
  private readonly COOLDOWN_MS = 24 * 60 * 60 * 1000;  // 24h entre deux notifications auto

  constructor(
    billitClient: BillitClient,
    bankClient: BankClient,
    bot: TelegramBotInteractive
  ) {
    this.billitClient = billitClient;
    this.bankClient = bankClient;
    this.bot = bot;
    this.storePath = path.join(__dirname, '../../data/reconciliation-store.json');

    this.axiosInstance = axios.create({
      baseURL: config.billit.apiUrl,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        apikey: config.billit.apiKey,
        ...(config.billit.partyId ? { partyID: config.billit.partyId } : {}),
      },
    });

    this.loadStore();
  }

  // ──────────────────────────────────────────
  // Cycle de vie
  // ──────────────────────────────────────────

  start(): void {
    console.log('🔗 Service de réconciliation paiements démarré');
    console.log('   Premier run dans 2 min, puis toutes les 30 min');

    setTimeout(() => this.runReconciliation(false), this.FIRST_RUN_DELAY_MS);
    this.intervalId = setInterval(() => this.runReconciliation(false), this.INTERVAL_MS);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    console.log('🔗 Service de réconciliation arrêté');
  }

  // ──────────────────────────────────────────
  // Réconciliation principale
  // ──────────────────────────────────────────

  /**
   * @param force  true = run manuel (/reconcile) → ignore le cooldown 24h
   */
  async runReconciliation(force: boolean): Promise<{ linked: number; suggestions: number }> {
    console.log(`🔗 [Réconciliation] Démarrage... (${force ? 'MANUEL' : 'auto'})`);

    try {
      // 1. Factures impayées
      const unpaidInvoices = await this.billitClient.getUnpaidInvoices();
      if (unpaidInvoices.length === 0) {
        console.log('✅ [Réconciliation] Aucune facture impayée');
        this.updateLastRun();
        return { linked: 0, suggestions: 0 };
      }
      console.log(`📋 [Réconciliation] ${unpaidInvoices.length} facture(s) impayée(s)`);

      // 2. Transactions débit sur LOOKBACK_DAYS jours
      const since = new Date();
      since.setDate(since.getDate() - this.LOOKBACK_DAYS);
      const allTx = await this.bankClient.getTransactionsByPeriod(since, new Date());
      const debitTx = allTx.filter(tx => tx.type === 'Debit');
      console.log(`🏦 [Réconciliation] ${debitTx.length} transaction(s) de débit disponibles`);

      // 3. Chercher les correspondances
      const matches: ReconciliationMatch[] = [];
      const now = Date.now();

      for (const invoice of unpaidInvoices) {
        const match = this.findBestMatch(invoice, debitTx);
        if (!match) continue;

        const key = `${invoice.id}_${match.transaction.id}`;
        const lastNotified = this.store.notified[key] || 0;
        const cooldownPassed = (now - lastNotified) >= this.COOLDOWN_MS;

        // Run auto  : respecte le cooldown 24h
        // Run manuel : toujours inclus
        if (!force && !cooldownPassed) {
          console.log(`⏳ [Réconciliation] Cooldown actif pour facture ${invoice.invoice_number} (reste ${Math.round((this.COOLDOWN_MS - (now - lastNotified)) / 3600000)}h)`);
          continue;
        }

        matches.push(match);
      }

      if (matches.length === 0) {
        const msg = force
          ? 'ℹ️ [Réconciliation] Aucune correspondance trouvée sur les factures impayées actuelles'
          : 'ℹ️ [Réconciliation] Aucune nouvelle correspondance (cooldown 24h actif)';
        console.log(msg);
        this.updateLastRun();
        return { linked: 0, suggestions: 0 };
      }

      console.log(`✨ [Réconciliation] ${matches.length} correspondance(s) trouvée(s)`);

      // 4. Traiter chaque correspondance
      let linked = 0;
      let suggestions = 0;

      for (const match of matches) {
        const key = `${match.invoice.id}_${match.transaction.id}`;

        if (match.confidence === 'high' || match.confidence === 'medium') {
          const success = await this.linkPaymentToInvoice(match);
          if (success) {
            linked++;
            await this.notifyLinked(match);
          } else {
            suggestions++;
            await this.notifySuggestion(match, true);
          }
        } else {
          suggestions++;
          await this.notifySuggestion(match, false);
        }

        // Enregistrer le timestamp de notification
        this.store.notified[key] = Date.now();
      }

      // Nettoyer les entrées obsolètes (factures > 90 jours)
      this.pruneStore();

      this.updateLastRun();
      this.saveStore();

      console.log(`✅ [Réconciliation] Terminé : ${linked} lié(s), ${suggestions} suggestion(s)`);
      return { linked, suggestions };

    } catch (error: any) {
      console.error('❌ [Réconciliation] Erreur:', error.message);
      return { linked: 0, suggestions: 0 };
    }
  }

  // ──────────────────────────────────────────
  // Algorithme de correspondance
  // ──────────────────────────────────────────

  private findBestMatch(
    invoice: BillitInvoice,
    transactions: BankTransaction[]
  ): ReconciliationMatch | null {
    const invoiceAmount = Math.abs(invoice.total_amount);
    const invoiceDate = new Date(invoice.invoice_date);
    let bestMatch: ReconciliationMatch | null = null;

    for (const tx of transactions) {
      const txAmount = Math.abs(tx.amount);
      const txDate = new Date(tx.date);

      if (Math.abs(txAmount - invoiceAmount) > this.AMOUNT_TOLERANCE) continue;
      if (txDate < invoiceDate) continue;

      const daysDiff = (txDate.getTime() - invoiceDate.getTime()) / (1000 * 60 * 60 * 24);
      if (daysDiff > this.MAX_DAYS_AFTER_INVOICE) continue;

      // Niveau 1 : OGM (haute confiance)
      if (invoice.communication && invoice.communication.length >= 8) {
        const ogmDigits = invoice.communication.replace(/\D/g, '');
        const txDescDigits = tx.description.replace(/\D/g, '');
        if (ogmDigits.length >= 8 && txDescDigits.includes(ogmDigits)) {
          return { invoice, transaction: tx, confidence: 'high', matchReason: `OGM: ${invoice.communication}` };
        }
      }

      // Niveau 2 : montant + nom fournisseur (confiance moyenne)
      const supplierNorm = this.normalize(invoice.supplier_name);
      const descNorm = this.normalize(tx.description);
      const supplierKey = supplierNorm.substring(0, Math.min(6, supplierNorm.length));

      if (supplierKey.length >= 3 && descNorm.includes(supplierKey)) {
        const candidate: ReconciliationMatch = {
          invoice, transaction: tx, confidence: 'medium',
          matchReason: `Montant ${invoiceAmount.toFixed(2)} € + fournisseur "${invoice.supplier_name}"`,
        };
        if (!bestMatch || bestMatch.confidence === 'low') bestMatch = candidate;
        continue;
      }

      // Niveau 3 : montant seul 30 jours max (faible confiance)
      if (daysDiff <= 30 && !bestMatch) {
        bestMatch = {
          invoice, transaction: tx, confidence: 'low',
          matchReason: `Montant ${invoiceAmount.toFixed(2)} € (fournisseur non confirmé)`,
        };
      }
    }

    return bestMatch;
  }

  private normalize(str: string): string {
    return str.toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  // ──────────────────────────────────────────
  // Liaison via API Billit
  // ──────────────────────────────────────────

  private async linkPaymentToInvoice(match: ReconciliationMatch): Promise<boolean> {
    const { invoice, transaction } = match;
    const paymentDate = transaction.date.split('T')[0];

    try {
      await this.axiosInstance.post(`/v1/orders/${invoice.id}/payments`, {
        Amount: invoice.total_amount,
        Date: paymentDate,
        BankAccountTransactionID: parseInt(transaction.id, 10) || transaction.id,
        Note: `Auto-lié par bot — ${match.matchReason}`,
      });
      console.log(`✅ [Réconciliation] Facture ${invoice.invoice_number} liée (POST /payments)`);
      return true;
    } catch (e1: any) {
      console.warn(`⚠️ [Réconciliation] POST /payments échoué (${e1.response?.status || e1.message}), essai PATCH...`);
      if (e1.response?.data) console.warn('   Détails:', JSON.stringify(e1.response.data).substring(0, 200));
    }

    try {
      await this.axiosInstance.patch(`/v1/orders/${invoice.id}`, { Paid: true });
      console.log(`✅ [Réconciliation] Facture ${invoice.invoice_number} marquée payée (PATCH)`);
      return true;
    } catch (e2: any) {
      console.error(`❌ [Réconciliation] PATCH échoué (${e2.response?.status || e2.message})`);
      return false;
    }
  }

  // ──────────────────────────────────────────
  // Notifications Telegram
  // ──────────────────────────────────────────

  private async notifyLinked(match: ReconciliationMatch): Promise<void> {
    const { invoice, transaction } = match;
    const icon = match.confidence === 'high' ? '🎯' : '✅';
    const msg =
      `${icon} <b>Paiement lié automatiquement</b>\n\n` +
      `📄 <b>Facture :</b> ${invoice.invoice_number}\n` +
      `🏢 <b>Fournisseur :</b> ${invoice.supplier_name}\n` +
      `💰 <b>Montant :</b> ${invoice.total_amount.toFixed(2)} €\n` +
      `📅 <b>Date facture :</b> ${new Date(invoice.invoice_date).toLocaleDateString('fr-BE')}\n` +
      `💳 <b>Transaction :</b> ${new Date(transaction.date).toLocaleDateString('fr-BE')} — ${transaction.description.substring(0, 60)}\n` +
      `🔍 <b>Critère :</b> ${match.matchReason}`;
    await this.bot.broadcastMessage(msg);
  }

  private async notifySuggestion(match: ReconciliationMatch, linkFailed: boolean): Promise<void> {
    const { invoice, transaction } = match;
    const key = `${invoice.id}_${transaction.id}`;

    // Stocker pour les boutons inline Telegram
    this.pendingSuggestions.set(key, match);

    const header = linkFailed
      ? '⚠️ <b>Correspondance trouvée — liaison échouée</b>'
      : '💡 <b>Correspondance probable — vérification requise</b>';
    const msg =
      `${header}\n\n` +
      `📄 <b>Facture :</b> ${invoice.invoice_number}\n` +
      `🏢 <b>Fournisseur :</b> ${invoice.supplier_name}\n` +
      `💰 <b>Montant :</b> ${invoice.total_amount.toFixed(2)} €\n` +
      `📅 <b>Date facture :</b> ${new Date(invoice.invoice_date).toLocaleDateString('fr-BE')}\n` +
      `💳 <b>Transaction :</b> ${new Date(transaction.date).toLocaleDateString('fr-BE')} — ${transaction.description.substring(0, 60)}\n` +
      `🔍 <b>Critère :</b> ${match.matchReason}`;
    await this.bot.broadcastSuggestionWithButtons(msg, key);
  }

  // ──────────────────────────────────────────
  // Actions déclenchées par boutons inline
  // ──────────────────────────────────────────

  /** Lier la suggestion identifiée par sa clé (déclenché par le bouton ✅) */
  async linkPending(key: string): Promise<boolean> {
    const match = this.pendingSuggestions.get(key);
    if (!match) {
      console.warn(`⚠️ [Réconciliation] Suggestion non trouvée pour clé: ${key}`);
      return false;
    }

    const success = await this.linkPaymentToInvoice(match);
    if (success) {
      this.pendingSuggestions.delete(key);
      this.store.notified[key] = Date.now();
      this.saveStore();
      await this.notifyLinked(match);
    }
    return success;
  }

  /** Ignorer la suggestion (déclenché par le bouton ❌) */
  ignorePending(key: string): void {
    this.pendingSuggestions.delete(key);
    // Remettre le cooldown à maintenant pour éviter une re-notification dans les 24h
    this.store.notified[key] = Date.now();
    this.saveStore();
    console.log(`🚫 [Réconciliation] Suggestion ignorée: ${key}`);
  }

  // ──────────────────────────────────────────
  // Persistance du store
  // ──────────────────────────────────────────

  private loadStore(): void {
    try {
      if (fs.existsSync(this.storePath)) {
        const raw = fs.readFileSync(this.storePath, 'utf-8');
        const parsed = JSON.parse(raw);
        // Compatibilité avec l'ancien format (processed: string[])
        if (Array.isArray(parsed.processed)) {
          this.store = { notified: {}, lastRun: parsed.lastRun || null };
        } else {
          this.store = parsed;
        }
      }
    } catch {
      this.store = { notified: {}, lastRun: null };
    }
  }

  private saveStore(): void {
    try {
      const dir = path.dirname(this.storePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.storePath, JSON.stringify(this.store, null, 2), 'utf-8');
    } catch (e: any) {
      console.error('❌ [Réconciliation] Impossible de sauvegarder le store:', e.message);
    }
  }

  private updateLastRun(): void {
    this.store.lastRun = new Date().toISOString();
    this.saveStore();
  }

  /** Supprime les entrées de plus de 90 jours du store */
  private pruneStore(): void {
    const cutoff = Date.now() - this.LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
    for (const key of Object.keys(this.store.notified)) {
      if (this.store.notified[key] < cutoff) delete this.store.notified[key];
    }
  }

  // ──────────────────────────────────────────
  // API publique
  // ──────────────────────────────────────────

  getStatus(): { lastRun: string | null; activeMatches: number } {
    return {
      lastRun: this.store.lastRun,
      activeMatches: Object.keys(this.store.notified).length,
    };
  }

  /** Déclenché par /reconcile — ignore le cooldown */
  async triggerManual(): Promise<{ linked: number; suggestions: number }> {
    console.log('🔗 [Réconciliation] Déclenchée manuellement');
    return this.runReconciliation(true);
  }
}
