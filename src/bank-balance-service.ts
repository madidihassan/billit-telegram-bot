/**
 * Service de gestion des soldes bancaires
 * Maintient les soldes à jour en fonction des transactions
 */

import fs from 'fs';
import path from 'path';
import { BankClient, BankTransaction } from './bank-client';
import { BankAccountBalance, BankBalancesStore, BalanceUpdateResult } from './types/bank-balances';

export class BankBalanceService {
  private storePath: string;
  private bankClient: BankClient;

  constructor() {
    this.storePath = path.join(__dirname, '..', 'data', 'bank-balances.json');
    this.bankClient = new BankClient();
    this.ensureDataDirectory();
  }

  /**
   * Assure que le répertoire data existe
   */
  private ensureDataDirectory(): void {
    const dataDir = path.dirname(this.storePath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
  }

  /**
   * Charge les soldes depuis le fichier
   */
  private loadBalances(): BankBalancesStore | null {
    try {
      if (!fs.existsSync(this.storePath)) {
        return null;
      }
      const data = fs.readFileSync(this.storePath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      console.error('❌ Erreur lors du chargement des soldes:', error);
      return null;
    }
  }

  /**
   * Sauvegarde les soldes dans le fichier
   */
  private saveBalances(store: BankBalancesStore): void {
    try {
      fs.writeFileSync(this.storePath, JSON.stringify(store, null, 2), 'utf-8');
      console.log('💾 Soldes sauvegardés avec succès');
    } catch (error) {
      console.error('❌ Erreur lors de la sauvegarde des soldes:', error);
      throw error;
    }
  }

  /**
   * Initialise les soldes bancaires
   */
  public async initializeBalances(balances: { iban: string; name: string; balance: number }[]): Promise<void> {
    console.log('🏦 Initialisation des soldes bancaires...');

    // Récupérer la dernière transaction pour chaque compte
    const allTransactions = await this.bankClient.getAllTransactions(10); // Les 10 dernières suffisent

    const accounts: { [iban: string]: BankAccountBalance } = {};

    for (const bal of balances) {
      // Formater l'IBAN sans espaces
      const iban = bal.iban.replace(/\s/g, '');

      // Trouver la dernière transaction pour ce compte
      const lastTx = allTransactions
        .filter(tx => tx.iban.replace(/\s/g, '') === iban)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];

      accounts[iban] = {
        iban,
        name: bal.name,
        balance: bal.balance,
        lastTransactionId: lastTx?.id || '0',
        lastUpdate: new Date().toISOString(),
      };

      console.log(`  ✓ ${bal.name} (${iban}): €${bal.balance.toFixed(2)}`);
    }

    const store: BankBalancesStore = {
      lastUpdate: new Date().toISOString(),
      initializedAt: new Date().toISOString(),
      accounts,
    };

    this.saveBalances(store);
    console.log('✅ Soldes initialisés avec succès !');
  }

  /**
   * Récupère les soldes actuels
   */
  public getBalances(): BankBalancesStore | null {
    return this.loadBalances();
  }

  /**
   * Récupère le solde d'un compte spécifique
   */
  public getBalance(iban: string): BankAccountBalance | null {
    const store = this.loadBalances();
    if (!store) return null;

    const ibanClean = iban.replace(/\s/g, '');
    return store.accounts[ibanClean] || null;
  }

  /**
   * Met à jour les soldes avec les nouvelles transactions
   */
  public async updateBalances(): Promise<BalanceUpdateResult> {
    console.log('🔄 Mise à jour des soldes bancaires...');

    const store = this.loadBalances();
    if (!store) {
      throw new Error('Les soldes ne sont pas initialisés. Utilisez /init_balances d\'abord.');
    }

    const result: BalanceUpdateResult = {
      transactionsProcessed: 0,
      accountsUpdated: [],
      updates: [],
    };

    // Récupérer toutes les nouvelles transactions depuis la dernière mise à jour
    const allTransactions = await this.bankClient.getAllTransactions();

    // Trier par date croissante pour traiter dans l'ordre chronologique
    const sortedTransactions = allTransactions.sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    // Pour chaque compte, trouver les nouvelles transactions
    for (const [iban, account] of Object.entries(store.accounts)) {
      const previousBalance = account.balance;
      let newTransactionsCount = 0;
      let foundLastTransaction = false;

      // Si lastTransactionId est '0', traiter toutes les transactions après la date d'initialisation
      if (account.lastTransactionId === '0') {
        foundLastTransaction = true;
      }

      for (const tx of sortedTransactions) {
        const txIban = tx.iban.replace(/\s/g, '');

        // Ignorer les transactions d'autres comptes
        if (txIban !== iban) continue;

        // Si on n'a pas encore trouvé la dernière transaction traitée, continuer
        if (!foundLastTransaction) {
          if (tx.id === account.lastTransactionId) {
            foundLastTransaction = true;
          }
          continue;
        }

        // Cette transaction est nouvelle, l'appliquer
        if (tx.id !== account.lastTransactionId) {
          if (tx.type === 'Credit') {
            account.balance += tx.amount;
          } else {
            account.balance -= Math.abs(tx.amount);
          }

          account.lastTransactionId = tx.id;
          newTransactionsCount++;
          result.transactionsProcessed++;
        }
      }

      if (newTransactionsCount > 0) {
        account.lastUpdate = new Date().toISOString();
        result.accountsUpdated.push(iban);
        result.updates.push({
          iban,
          previousBalance,
          newBalance: account.balance,
          transactionsCount: newTransactionsCount,
        });

        console.log(`  ✓ ${account.name}: €${previousBalance.toFixed(2)} → €${account.balance.toFixed(2)} (${newTransactionsCount} tx)`);
      }
    }

    // Sauvegarder les soldes mis à jour
    store.lastUpdate = new Date().toISOString();
    this.saveBalances(store);

    if (result.transactionsProcessed > 0) {
      console.log(`✅ ${result.transactionsProcessed} transaction(s) traitée(s), ${result.accountsUpdated.length} compte(s) mis à jour`);
    } else {
      console.log('✓ Aucune nouvelle transaction');
    }

    return result;
  }

  /**
   * Met à jour manuellement le solde d'un compte
   */
  public async setBalance(iban: string, balance: number): Promise<void> {
    const store = this.loadBalances();
    if (!store) {
      throw new Error('Les soldes ne sont pas initialisés. Utilisez /init_balances d\'abord.');
    }

    const ibanClean = iban.replace(/\s/g, '');

    if (!store.accounts[ibanClean]) {
      throw new Error(`Compte ${iban} non trouvé dans le système.`);
    }

    const oldBalance = store.accounts[ibanClean].balance;
    store.accounts[ibanClean].balance = balance;
    store.accounts[ibanClean].lastUpdate = new Date().toISOString();
    store.lastUpdate = new Date().toISOString();

    this.saveBalances(store);

    console.log(`✅ Solde de ${store.accounts[ibanClean].name} mis à jour: €${oldBalance.toFixed(2)} → €${balance.toFixed(2)}`);
  }

  /**
   * Formatte les soldes pour affichage
   */
  public formatBalances(): string {
    const store = this.loadBalances();
    if (!store) {
      return '⚠️ Les soldes ne sont pas encore initialisés.\n\nUtilisez /init_balances pour commencer.';
    }

    let total = 0;
    let message = '💰 **Soldes des comptes bancaires**\n\n';

    for (const account of Object.values(store.accounts)) {
      message += `🏦 **${account.name}**\n`;
      message += `   ${this.formatIBAN(account.iban)}\n`;
      message += `   €${account.balance.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n\n`;
      total += account.balance;
    }

    message += `**Total**: €${total.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n\n`;
    message += `_Dernière mise à jour: ${new Date(store.lastUpdate).toLocaleString('fr-FR')}_`;

    return message;
  }

  /**
   * Formatte un IBAN avec des espaces tous les 4 caractères
   */
  private formatIBAN(iban: string): string {
    return iban.match(/.{1,4}/g)?.join(' ') || iban;
  }

  /**
   * Vérifie si les soldes sont initialisés
   */
  public isInitialized(): boolean {
    return this.loadBalances() !== null;
  }

  /**
   * Calcule le total de tous les comptes
   */
  public getTotalBalance(): number {
    const store = this.loadBalances();
    if (!store) return 0;

    return Object.values(store.accounts).reduce((sum, account) => sum + account.balance, 0);
  }

  /**
   * Récupère l'instance de BankClient pour accéder aux méthodes bancaires
   */
  public getBankClient(): BankClient {
    return this.bankClient;
  }
}
