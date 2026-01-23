import axios, { AxiosInstance } from 'axios';
import { config } from './config';
import { matchesSupplier } from './supplier-aliases';
import { normalizeSearchTerm } from './utils/string-utils';
import { BillitFinancialTransaction, BillitTransactionsResponse } from './types/billit-api';
import { SupplierLearningService } from './supplier-learning-service';

export interface BankTransaction {
  id: string;
  iban: string;
  amount: number;
  type: 'Credit' | 'Debit'; // Credit = rentrée, Debit = sortie
  date: string;
  description: string;
  currency: string;
  bankAccountId: number;
}

export interface TransactionStats {
  total: number;
  credits: number;
  debits: number;
  creditCount: number;
  debitCount: number;
  balance: number;
}

// Interface pour le cache des transactions
interface TransactionCache {
  transactions: BankTransaction[];
  timestamp: number;
  periodKey: string;
  expiryMs?: number; // Durée d'expiration personnalisée
}

export class BankClient {
  private axiosInstance: AxiosInstance;
  private cache: Map<string, TransactionCache> = new Map();
  private cacheExpiryMs = 5 * 60 * 1000; // Cache de 5 minutes
  private learningService: SupplierLearningService;

  constructor() {
    this.axiosInstance = axios.create({
      baseURL: config.billit.apiUrl,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'apikey': config.billit.apiKey,
      },
    });

    if (config.billit.partyId) {
      this.axiosInstance.defaults.headers.common['partyID'] = config.billit.partyId;
    }

    // Initialiser le service d'apprentissage
    this.learningService = new SupplierLearningService();
  }

  /**
   * Récupère toutes les transactions bancaires avec pagination automatique et cache intelligent
   */
  async getAllTransactions(limit?: number, startDate?: Date, endDate?: Date): Promise<BankTransaction[]> {
    try {
      // Vérifier le cache si des dates sont fournies
      // IMPORTANT: Ne pas utiliser le cache pour les périodes spécifiques pour éviter les données obsolètes
      const useShortCache = startDate && endDate; // Période spécifique = cache court
      if (!useShortCache) {
        const cacheKey = 'all_transactions';
        const cached = this.getFromCache(cacheKey);

        if (cached) {
          console.log('✓ Transactions récupérées depuis le cache (global)');
          return cached;
        }
      }

      console.log('🏦 Récupération des transactions bancaires...');

      // Construire le filtre OData pour les dates si fournies
      let filter = '';
      if (startDate) {
        const startStr = startDate.toISOString().split('T')[0]; // Format YYYY-MM-DD
        filter = `ValueDate ge DateTime'${startStr}'`;
      }
      if (endDate) {
        const endStr = endDate.toISOString().split('T')[0];
        filter += (filter ? ' and ' : '') + `ValueDate le DateTime'${endStr}'`;
      }

      let transactions: BankTransaction[];

      // TOUJOURS utiliser la pagination pour récupérer TOUTES les transactions
      // (pas seulement pour les périodes spécifiques)
      transactions = await this.getAllTransactionsWithPagination(filter, limit);

      // Sauvegarder dans le cache uniquement pour les requêtes globales (pas de dates spécifiques)
      // et uniquement s'il y a des résultats (JAMAIS mettre en cache un résultat vide)
      if (transactions.length > 0 && !startDate && !endDate) {
        const cacheKey = 'all_transactions';
        this.saveToCache(cacheKey, transactions, 5 * 60 * 1000); // 5 minutes pour le cache global
        console.log('💾 Résultats mis en cache (5 minutes)');
      }

      return transactions;
    } catch (error: any) {
      console.error('❌ Erreur lors de la récupération des transactions:');
      console.error(`   ${error.message}`);
      throw error;
    }
  }

  /**
   * Récupère TOUTES les transactions avec pagination automatique (contourne la limite de 120)
   */
  private async getAllTransactionsWithPagination(filter: string, maxResults?: number): Promise<BankTransaction[]> {
    const allTransactions: BankTransaction[] = [];
    let skip = 0;
    const pageSize = 120; // Limite API Billit
    let hasMore = true;

    console.log('🔄 Pagination activée pour contourner la limite de 120 transactions...');

    while (hasMore && (!maxResults || allTransactions.length < maxResults)) {
      try {
        const params: any = {
          $top: pageSize,
          $skip: skip,
          $orderby: 'ValueDate desc', // Tri par date décroissante
        };

        if (filter) {
          params.$filter = filter;
        }

        const response = await this.axiosInstance.get<BillitTransactionsResponse>('/v1/financialTransactions', {
          params,
        });

        const items = response.data.Items || response.data.items || response.data || [];
        const transactions = Array.isArray(items) ? this.convertTransactions(items) : [];

        if (transactions.length === 0) {
          hasMore = false;
          break;
        }

        allTransactions.push(...transactions);
        console.log(`  ↳ Page ${Math.floor(skip / pageSize) + 1}: ${transactions.length} transaction(s)`);

        // Si on a reçu moins que pageSize, c'est la dernière page
        if (transactions.length < pageSize) {
          hasMore = false;
        } else {
          skip += pageSize;
        }

        // Pause de 100ms entre chaque requête pour ne pas surcharger l'API
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error: any) {
        console.error(`❌ Erreur à la page ${Math.floor(skip / pageSize) + 1}:`, error.message);
        hasMore = false;
      }
    }

    console.log(`✓ ${allTransactions.length} transaction(s) TOTALES récupérées via pagination`);
    return allTransactions;
  }

  /**
   * Récupère les transactions du mois en cours
   */
  async getMonthlyTransactions(): Promise<BankTransaction[]> {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    return this.getTransactionsByPeriod(firstDay, lastDay);
  }

  /**
   * Récupère les transactions entre deux dates (avec pagination automatique)
   */
  async getTransactionsByPeriod(startDate: Date, endDate: Date): Promise<BankTransaction[]> {
    // Passer les dates directement à l'API - la pagination se fera automatiquement
    const allTransactions = await this.getAllTransactions(undefined, startDate, endDate);

    // Filtrage supplémentaire côté client pour s'assurer de la précision
    // Utiliser setHours(0,0,0,0) pour comparer uniquement les dates (pas l'heure)
    const startOnly = new Date(startDate);
    startOnly.setHours(0, 0, 0, 0);
    const endOnly = new Date(endDate);
    endOnly.setHours(23, 59, 59, 999);

    const filtered = allTransactions.filter(tx => {
      const txDate = new Date(tx.date);
      const isInPeriod = txDate >= startOnly && txDate <= endOnly;
      if (!isInPeriod && (txDate.getMonth() === 8 || txDate.getMonth() === 9)) {
        // Log pour le debug: transactions de septembre/octobre hors période
        console.log(`⚠️ Transaction filtrée: ${tx.date} (${txDate.toISOString().split('T')[0]}) hors période [${startOnly.toISOString().split('T')[0]} - ${endOnly.toISOString().split('T')[0]}]`);
      }
      return isInPeriod;
    });

    console.log(`✓ Filtrage période: ${allTransactions.length} → ${filtered.length} transactions [${startOnly.toISOString().split('T')[0]} à ${endOnly.toISOString().split('T')[0]}]`);
    return filtered;
  }

  /**
   * Récupère uniquement les rentrées (crédits)
   */
  async getCredits(startDate?: Date, endDate?: Date): Promise<BankTransaction[]> {
    let transactions: BankTransaction[];

    if (startDate && endDate) {
      transactions = await this.getTransactionsByPeriod(startDate, endDate);
    } else {
      transactions = await this.getAllTransactions();
    }

    return transactions.filter(tx => tx.type === 'Credit');
  }

  /**
   * Récupère uniquement les sorties (débits)
   */
  async getDebits(startDate?: Date, endDate?: Date): Promise<BankTransaction[]> {
    let transactions: BankTransaction[];

    if (startDate && endDate) {
      transactions = await this.getTransactionsByPeriod(startDate, endDate);
    } else {
      transactions = await this.getAllTransactions();
    }

    return transactions.filter(tx => tx.type === 'Debit');
  }

  /**
   * Recherche des transactions par description (pour trouver un fournisseur)
   * Utilise le système d'aliases pour une meilleure correspondance
   */
  async searchByDescription(searchTerm: string, startDate?: Date, endDate?: Date): Promise<BankTransaction[]> {
    let transactions: BankTransaction[];

    if (startDate && endDate) {
      transactions = await this.getTransactionsByPeriod(startDate, endDate);
    } else {
      transactions = await this.getAllTransactions();
    }

    // Utiliser le système d'aliases pour matcher les fournisseurs
    return transactions.filter(tx => matchesSupplier(tx.description, searchTerm));
  }

  /**
   * Calcule les statistiques pour une période
   */
  async getStats(startDate?: Date, endDate?: Date): Promise<TransactionStats> {
    let transactions: BankTransaction[];

    if (startDate && endDate) {
      transactions = await this.getTransactionsByPeriod(startDate, endDate);
    } else {
      transactions = await this.getAllTransactions();
    }

    let credits = 0;
    let debits = 0;
    let creditCount = 0;
    let debitCount = 0;

    transactions.forEach(tx => {
      if (tx.type === 'Credit') {
        credits += tx.amount;
        creditCount++;
      } else {
        debits += Math.abs(tx.amount);
        debitCount++;
      }
    });

    return {
      total: credits + debits,
      credits,
      debits,
      creditCount,
      debitCount,
      balance: credits - debits,
    };
  }

  /**
   * Récupère les statistiques du mois en cours
   */
  async getMonthlyStats(): Promise<TransactionStats> {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    return this.getStats(firstDay, lastDay);
  }

  /**
   * Convertit les transactions Billit vers notre format
   * Et apprend automatiquement les nouveaux fournisseurs
   */
  private convertTransactions(transactions: BillitFinancialTransaction[]): BankTransaction[] {
    return transactions.map(tx => {
      // Construire une description complète incluant le nom de la contrepartie
      let description = '';

      // Priorité 1: Nom de la contrepartie (ex: "N.V. Pluxee Belgium S.A.")
      if (tx.NameCounterParty) {
        description = tx.NameCounterParty;

        // 🧑‍🎓 AUTO-APPRENTISSAGE: Essayer d'apprendre ce fournisseur
        this.learningService.learnFromDescription(description);
      }

      // Ajouter la note/communication si présente
      const additionalInfo = tx.Note || tx.Description || tx.Communication || '';
      if (additionalInfo) {
        description = description
          ? `${description} - ${additionalInfo}`
          : additionalInfo;

        // Essayer aussi d'apprendre depuis la description complète
        this.learningService.learnFromDescription(description);
      }

      return {
        id: String(tx.BankAccountTransactionID || tx.ID || ''),
        iban: tx.IBAN || '',
        amount: parseFloat(String(tx.TotalAmount || 0)),
        type: tx.TransactionType === 'Credit' ? 'Credit' : 'Debit',
        date: tx.ValueDate || tx.Date || new Date().toISOString(),
        description: description,
        currency: tx.Currency || 'EUR',
        bankAccountId: tx.BankAccountID || 0,
      };
    });
  }

  // Note: normalizeSearchTerm est maintenant importé depuis utils/string-utils
  // pour éviter la duplication de code

  /**
   * Génère une clé de cache unique pour une période
   */
  private getCacheKey(startDate: Date, endDate: Date): string {
    const start = startDate.toISOString().split('T')[0];
    const end = endDate.toISOString().split('T')[0];
    return `period_${start}_${end}`;
  }

  /**
   * Récupère des transactions depuis le cache
   */
  private getFromCache(cacheKey: string): BankTransaction[] | null {
    const cached = this.cache.get(cacheKey);

    if (!cached) {
      return null;
    }

    // Vérifier si le cache a expiré (utilise l'expiration personnalisée ou celle par défaut)
    const now = Date.now();
    const expiryMs = cached.expiryMs || this.cacheExpiryMs;
    if (now - cached.timestamp > expiryMs) {
      this.cache.delete(cacheKey);
      return null;
    }

    return cached.transactions;
  }

  /**
   * Sauvegarde des transactions dans le cache avec durée personnalisable
   * IMPORTANT: Ne jamais mettre en cache un résultat vide
   */
  private saveToCache(cacheKey: string, transactions: BankTransaction[], customExpiryMs?: number): void {
    // NE JAMAIS mettre en cache un résultat vide
    if (!transactions || transactions.length === 0) {
      console.log('⚠️  Résultat vide - PAS de mise en cache');
      return;
    }

    this.cache.set(cacheKey, {
      transactions,
      timestamp: Date.now(),
      periodKey: cacheKey,
      expiryMs: customExpiryMs, // Stocker la durée d'expiration personnalisée
    });
  }

  /**
   * Vide le cache (utile pour forcer un refresh)
   */
  public clearCache(): void {
    this.cache.clear();
    console.log('🗑️  Cache des transactions vidé');
  }

  /**
   * Récupère le solde actuel d'un compte depuis l'API Billit
   * utilise l'endpoint /v1/bankaccounts pour obtenir le solde réel
   */
  async getRealTimeBalance(iban: string): Promise<number | null> {
    try {
      const ibanClean = iban.replace(/\s/g, '');

      console.log(`🔍 Récupération du solde réel pour ${ibanClean}...`);

      // Essayer l'endpoint /v1/bankaccounts avec filtre sur l'IBAN
      const response = await this.axiosInstance.get('/v1/bankaccounts', {
        params: {
          $filter: `IBAN eq '${ibanClean}'`,
          $top: 1,
        },
      });

      const accounts = response.data?.Items || response.data?.items || response.data || [];

      if (Array.isArray(accounts) && accounts.length > 0) {
        const account = accounts[0];
        // Le solde peut être dans différents champs selon la version de l'API
        const balance = account.Balance || account.CurrentBalance || account.BalanceEUR || account.Amount || 0;
        const balanceNum = parseFloat(String(balance));

        console.log(`✅ Solde réel trouvé pour ${ibanClean}: €${balanceNum.toFixed(2)}`);
        return balanceNum;
      }

      console.log(`⚠️ Aucun compte trouvé pour l'IBAN ${ibanClean}`);
      return null;
    } catch (error: any) {
      console.error(`❌ Erreur lors de la récupération du solde pour ${iban}:`, error.message);
      // Si l'endpoint n'existe pas (404), retourner null pour utiliser l'ancienne méthode
      if (error.response?.status === 404) {
        console.log(`ℹ️ Endpoint /v1/bankaccounts non disponible, solde réel non récupérable`);
      }
      return null;
    }
  }

  /**
   * Parse une date depuis différents formats
   */
  static parseDate(dateStr: string): Date | null {
    // Format: YYYY-MM-DD
    const match1 = dateStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (match1) {
      return new Date(parseInt(match1[1]), parseInt(match1[2]) - 1, parseInt(match1[3]));
    }

    // Format: DD/MM/YYYY
    const match2 = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (match2) {
      return new Date(parseInt(match2[3]), parseInt(match2[2]) - 1, parseInt(match2[1]));
    }

    // Format: DD-MM-YYYY
    const match3 = dateStr.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
    if (match3) {
      return new Date(parseInt(match3[3]), parseInt(match3[2]) - 1, parseInt(match3[1]));
    }

    return null;
  }
}
