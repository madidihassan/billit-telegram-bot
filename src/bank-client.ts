import axios, { AxiosInstance } from 'axios';
import { config } from './config';
import { matchesSupplier } from './supplier-aliases';

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
}

export class BankClient {
  private axiosInstance: AxiosInstance;
  private cache: Map<string, TransactionCache> = new Map();
  private cacheExpiryMs = 5 * 60 * 1000; // Cache de 5 minutes

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
  }

  /**
   * Récupère toutes les transactions bancaires avec pagination automatique et cache
   */
  async getAllTransactions(limit?: number, startDate?: Date, endDate?: Date): Promise<BankTransaction[]> {
    try {
      // Vérifier le cache si des dates sont fournies
      if (startDate && endDate) {
        const cacheKey = this.getCacheKey(startDate, endDate);
        const cached = this.getFromCache(cacheKey);
        
        if (cached) {
          console.log('✓ Transactions récupérées depuis le cache');
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

      // Si une période spécifique est demandée, utiliser la pagination pour contourner la limite de 120
      if (startDate && endDate) {
        transactions = await this.getAllTransactionsWithPagination(filter, limit);
        
        // Sauvegarder dans le cache
        const cacheKey = this.getCacheKey(startDate, endDate);
        this.saveToCache(cacheKey, transactions);
      } else {
        // Sinon, requête simple (comportement par défaut)
        const params: any = {
          $top: limit || 120,
        };

        if (filter) {
          params.$filter = filter;
        }

        const response = await this.axiosInstance.get<any>('/v1/financialTransactions', {
          params,
        });

        const items = response.data.Items || response.data.items || response.data || [];
        console.log(`✓ ${Array.isArray(items) ? items.length : 0} transaction(s) récupérée(s)`);
        transactions = Array.isArray(items) ? this.convertTransactions(items) : [];
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

        const response = await this.axiosInstance.get<any>('/v1/financialTransactions', {
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
    return allTransactions.filter(tx => {
      const txDate = new Date(tx.date);
      return txDate >= startDate && txDate <= endDate;
    });
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
   */
  private convertTransactions(transactions: any[]): BankTransaction[] {
    return transactions.map(tx => ({
      id: String(tx.BankAccountTransactionID || tx.ID || ''),
      iban: tx.IBAN || '',
      amount: parseFloat(tx.TotalAmount || 0),
      type: tx.TransactionType === 'Credit' ? 'Credit' : 'Debit',
      date: tx.ValueDate || tx.Date || new Date().toISOString(),
      description: tx.Note || tx.Description || tx.Communication || '',
      currency: tx.Currency || 'EUR',
      bankAccountId: tx.BankAccountID || 0,
    }));
  }

  /**
   * Normalise un texte pour la recherche
   */
  private normalizeSearchTerm(text: string): string {
    return text
      .toLowerCase()
      .replace(/[\s\-_\.\/\\]/g, '')
      .trim();
  }

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

    // Vérifier si le cache a expiré
    const now = Date.now();
    if (now - cached.timestamp > this.cacheExpiryMs) {
      this.cache.delete(cacheKey);
      return null;
    }

    return cached.transactions;
  }

  /**
   * Sauvegarde des transactions dans le cache
   */
  private saveToCache(cacheKey: string, transactions: BankTransaction[]): void {
    this.cache.set(cacheKey, {
      transactions,
      timestamp: Date.now(),
      periodKey: cacheKey,
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
