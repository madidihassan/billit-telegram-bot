/**
 * Point d'entrée « notifications seules ».
 *
 * Ne charge que ce qui sert réellement en production : la surveillance des
 * factures Billit et leur diffusion sur Telegram, plus le bouton
 * « Marquer Payé ». L'agent IA, les commandes, le vocal, la réconciliation et
 * le suivi des soldes bancaires ne sont pas instanciés — cf. index-bot.ts pour
 * l'ancien bot complet.
 */

import { validateConfig } from './config';
import { BillitClient } from './billit-client';
import { TelegramNotifier } from './notify/telegram-notifier';
import { InvoiceMonitoringService, MonitoringConfig } from './invoice-monitoring-service';
import { closeDatabase } from './database';

const DEFAULT_MONITORING_INTERVAL_MINUTES = 5;
const DEFAULT_MONITORING_STORAGE = './data/processed-invoices.json';

function readMonitoringConfig(): MonitoringConfig {
  return {
    enabled: process.env.INVOICE_MONITORING_ENABLED === 'true',
    intervalMinutes: parseInt(
      process.env.INVOICE_MONITORING_INTERVAL || String(DEFAULT_MONITORING_INTERVAL_MINUTES),
      10
    ),
    checkPaid: process.env.INVOICE_MONITORING_CHECK_PAID !== 'false',
    checkUnpaid: process.env.INVOICE_MONITORING_CHECK_UNPAID !== 'false',
    storageFile: process.env.INVOICE_MONITORING_STORAGE || DEFAULT_MONITORING_STORAGE,
  };
}

class BillitNotifier {
  private readonly notifier: TelegramNotifier;
  private readonly monitoring: InvoiceMonitoringService;

  constructor() {
    // Avant toute chose : TelegramNotifier ouvre le polling dès sa construction,
    // et un token vide produirait une avalanche de polling_error au lieu d'un
    // message d'erreur clair.
    validateConfig();
    console.log('✓ Configuration validée');

    this.notifier = new TelegramNotifier();
    this.monitoring = new InvoiceMonitoringService(
      this.notifier,
      new BillitClient(),
      readMonitoringConfig()
    );
    this.notifier.setInvoiceSource(this.monitoring);
  }

  async start(): Promise<void> {
    console.log('🚀 Démarrage du Billit Notifier (notifications de factures)...\n');

    try {
      await this.notifier.sendStartupMessage('🔔 <b>Billit Notifier démarré</b>');
    } catch (error: any) {
      console.error('❌ Impossible de se connecter à Telegram:', error.message);
      throw error;
    }

    await this.monitoring.start();
    console.log('\n📊 Surveillance des factures active.\n');
  }

  stop(): void {
    this.monitoring.stop();
    this.notifier.stop();
    closeDatabase();
    console.log('\n👋 Arrêt du notifier...');
  }
}

async function main(): Promise<void> {
  let notifier: BillitNotifier;

  // La construction valide la configuration et ouvre le polling : elle doit
  // rester dans le try pour rapporter une erreur lisible plutôt qu'une stack.
  try {
    notifier = new BillitNotifier();
  } catch (error: any) {
    console.error('❌ Démarrage impossible:', error.message);
    process.exit(1);
  }

  const shutdown = (signal: string) => {
    console.log(`\n📴 Signal ${signal} reçu`);
    notifier.stop();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  try {
    await notifier.start();
  } catch (error: any) {
    console.error('❌ Démarrage impossible:', error.message);
    process.exit(1);
  }
}

main();
