/**
 * Service de mise à jour automatique des soldes bancaires
 * S'exécute en arrière-plan pour maintenir les soldes à jour
 */

import { BankBalanceService } from './bank-balance-service';

export class BankBalanceUpdater {
  private balanceService: BankBalanceService;
  private intervalMs: number;
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;

  constructor(intervalMinutes: number = 10) {
    this.balanceService = new BankBalanceService();
    this.intervalMs = intervalMinutes * 60 * 1000;
  }

  /**
   * Démarre la mise à jour automatique
   */
  public start(): void {
    if (this.isRunning) {
      console.log('⚠️  Le service de mise à jour des soldes est déjà en cours d\'exécution');
      return;
    }

    // Vérifier si les soldes sont initialisés
    if (!this.balanceService.isInitialized()) {
      console.log('⚠️  Les soldes ne sont pas initialisés. Utilisez /init_balances pour commencer.');
      return;
    }

    console.log(`🔄 Démarrage de la mise à jour automatique des soldes (toutes les ${this.intervalMs / 60000} minutes)...`);

    // Faire une première mise à jour immédiatement
    this.updateBalances();

    // Puis planifier les mises à jour régulières
    this.intervalId = setInterval(() => {
      this.updateBalances();
    }, this.intervalMs);

    this.isRunning = true;
  }

  /**
   * Arrête la mise à jour automatique
   */
  public stop(): void {
    if (!this.isRunning) {
      console.log('⚠️  Le service de mise à jour des soldes n\'est pas en cours d\'exécution');
      return;
    }

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.isRunning = false;
    console.log('🛑 Service de mise à jour des soldes arrêté');
  }

  /**
   * Met à jour les soldes
   */
  private async updateBalances(): Promise<void> {
    try {
      console.log('🔄 Mise à jour automatique des soldes...');
      const result = await this.balanceService.updateBalances();

      if (result.transactionsProcessed > 0) {
        console.log(`✅ ${result.transactionsProcessed} transaction(s) traitée(s), ${result.accountsUpdated.length} compte(s) mis à jour`);

        // Afficher les détails des mises à jour
        for (const update of result.updates) {
          const account = this.balanceService.getBalance(update.iban);
          if (account) {
            const diff = update.newBalance - update.previousBalance;
            const diffSign = diff >= 0 ? '+' : '';
            console.log(`   ${account.name}: ${diffSign}€${diff.toFixed(2)} (€${update.previousBalance.toFixed(2)} → €${update.newBalance.toFixed(2)})`);
          }
        }
      } else {
        console.log('✓ Soldes à jour (aucune nouvelle transaction)');
      }
    } catch (error: any) {
      console.error('❌ Erreur lors de la mise à jour automatique des soldes:', error.message);
    }
  }

  /**
   * Vérifie si le service est en cours d'exécution
   */
  public isActive(): boolean {
    return this.isRunning;
  }

  /**
   * Retourne le service de soldes bancaires
   */
  public getBalanceService(): BankBalanceService {
    return this.balanceService;
  }
}
