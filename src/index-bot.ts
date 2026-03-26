import { config, validateConfig } from './config';
import { BillitClient } from './billit-client';
import { BankClient } from './bank-client';
import { TelegramClient } from './telegram-client';
import { TelegramBotInteractive } from './telegram-bot';
import { CommandHandler } from './command-handler';
import { Storage } from './storage';
import { BillitInvoice } from './types';
import { BankBalanceUpdater } from './bank-balance-updater';
import { PaymentReconciliationService } from './services/payment-reconciliation-service';

class BillitNotifierWithBot {
  private billitClient: BillitClient;
  private bankClient: BankClient;
  private telegramClient: TelegramClient;
  private telegramBot: TelegramBotInteractive;
  private commandHandler: CommandHandler;
  private storage: Storage;
  private bankBalanceUpdater: BankBalanceUpdater;
  private reconciliationService!: PaymentReconciliationService;
  private isRunning: boolean = false;
  private intervalId: NodeJS.Timeout | null = null;

  constructor() {
    this.billitClient = new BillitClient();
    this.bankClient = new BankClient();
    this.telegramClient = new TelegramClient();
    this.commandHandler = new CommandHandler(this.billitClient, this.telegramClient);
    this.telegramBot = new TelegramBotInteractive(this.commandHandler);
    this.storage = new Storage();
    this.bankBalanceUpdater = new BankBalanceUpdater(10); // Mise à jour toutes les 10 minutes
  }

  /**
   * Initialise le système
   */
  async initialize(): Promise<void> {
    console.log('🚀 Démarrage du Billit Bot (Notifications + Interactif)...\n');

    // Valider la configuration
    try {
      validateConfig();
      console.log('✓ Configuration validée');
    } catch (error: any) {
      console.error('❌', error.message);
      process.exit(1);
    }

    // Charger le stockage
    await this.storage.load();

    // Test de connexion Telegram
    try {
      await this.telegramClient.sendTestMessage();
    } catch (error) {
      console.error('❌ Impossible de se connecter à Telegram');
      throw error;
    }

    console.log(`\n⏱️  Intervalle de vérification: ${config.checkInterval / 1000} secondes`);
    console.log('📊 Surveillance active...');
    console.log('🤖 Bot interactif activé - Tapez /help sur Telegram');
    console.log('🔗 Réconciliation paiements activée (toutes les 30 min)\n');

    // Initialiser le service de réconciliation (après télégramBot car il en dépend)
    this.reconciliationService = new PaymentReconciliationService(
      this.billitClient,
      this.bankClient,
      this.telegramBot
    );
    // Enregistrer dans le bot pour la commande /reconcile
    this.telegramBot.setReconciliationService(this.reconciliationService);
  }

  /**
   * Vérifie les nouvelles factures
   */
  async checkForNewInvoices(): Promise<void> {
    try {
      const lastCheck = this.storage.getLastCheck();
      console.log(`🔍 Vérification des factures depuis ${lastCheck.toLocaleString('fr-BE')}...`);

      // Récupérer les factures récentes
      const invoices = await this.billitClient.getRecentInvoices(lastCheck);

      if (invoices.length === 0) {
        console.log('   Aucune facture trouvée');
        await this.storage.updateLastCheck();
        return;
      }

      console.log(`   ${invoices.length} facture(s) trouvée(s)`);

      // Filtrer les nouvelles factures
      const newInvoices = invoices.filter(invoice => !this.storage.isNotified(invoice.id));

      if (newInvoices.length === 0) {
        console.log('   Aucune nouvelle facture');
        await this.storage.updateLastCheck();
        return;
      }

      console.log(`   🆕 ${newInvoices.length} nouvelle(s) facture(s) détectée(s)`);

      // Trier par date de création (plus anciennes en premier)
      newInvoices.sort((a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );

      // Envoyer les notifications
      for (const invoice of newInvoices) {
        await this.telegramClient.sendInvoiceNotification(invoice);
        await this.storage.markAsNotified(invoice.id);

        // Petit délai pour éviter de surcharger Telegram
        await this.sleep(1000);
      }

      // Nettoyer le stockage périodiquement
      await this.storage.cleanup();
      await this.storage.updateLastCheck();

      console.log('   ✓ Toutes les notifications ont été envoyées\n');
    } catch (error: any) {
      console.error('❌ Erreur lors de la vérification:', error.message);

      // Notifier l'erreur sur Telegram
      try {
        await this.telegramClient.sendErrorMessage(
          `Erreur lors de la vérification des factures: ${error.message}`
        );
      } catch (telegramError) {
        console.error('❌ Impossible d\'envoyer la notification d\'erreur');
      }
    }
  }

  /**
   * Démarre le système (notifications + bot)
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('⚠️  Le système est déjà en cours d\'exécution');
      return;
    }

    await this.initialize();

    this.isRunning = true;

    // ⚠️ ANCIEN SYSTÈME DÉSACTIVÉ - Causait des doublons
    // Première vérification immédiate
    // await this.checkForNewInvoices();

    // Ensuite, vérification périodique
    // this.intervalId = setInterval(async () => {
    //   await this.checkForNewInvoices();
    // }, config.checkInterval);

    // ✅ NOUVEAU SYSTÈME DE MONITORING (avec PDF automatique)
    await this.telegramBot.startMonitoring();

    // Démarrer le service de mise à jour automatique des soldes bancaires
    this.bankBalanceUpdater.start();

    // Démarrer le service de réconciliation paiements-factures
    this.reconciliationService.start();
  }

  /**
   * Arrête le système
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.telegramBot.stop();
    this.bankBalanceUpdater.stop();
    this.reconciliationService.stop();
    this.isRunning = false;
    console.log('\n👋 Arrêt du système...');
  }

  /**
   * Utilitaire de délai
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Point d'entrée
async function main() {
  const notifier = new BillitNotifierWithBot();

  // Gestion des signaux d'arrêt
  process.on('SIGINT', () => {
    notifier.stop();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    notifier.stop();
    process.exit(0);
  });

  // Gestion des erreurs non capturées
  process.on('unhandledRejection', (error: any) => {
    console.error('❌ Erreur non gérée:', error);
  });

  try {
    await notifier.start();
  } catch (error: any) {
    console.error('❌ Erreur fatale:', error.message);
    process.exit(1);
  }
}

// Démarrer l'application
if (require.main === module) {
  main();
}

export { BillitNotifierWithBot };
