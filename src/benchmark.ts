/**
 * Script principal pour exécuter le benchmark
 * Usage: npm run benchmark [version]
 *
 * Exemples:
 * - npm run benchmark before  (avant optimisations)
 * - npm run benchmark after   (après optimisations)
 */

import { BenchmarkRunner } from './benchmark/runner';
import { CommandHandler } from './command-handler';
import { BillitClient } from './billit-client';
import { TelegramClient } from './telegram-client';
import { config } from './config';

async function main() {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║        🚀 BENCHMARK BOT BILLIT - VITESSE & EXACTITUDE     ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
  `);

  // Récupérer la version depuis les arguments
  const version = process.argv[2] || 'current';
  console.log(`📌 Version testée: ${version}`);
  console.log(`📅 Date: ${new Date().toLocaleString('fr-BE')}`);

  // Initialiser les dépendances
  console.log(`\n🔧 Initialisation...`);
  const billitClient = new BillitClient();

  // TelegramClient pour le benchmark (utilise config automatiquement)
  const telegramClient = new TelegramClient();

  const commandHandler = new CommandHandler(billitClient, telegramClient);

  // Créer le runner
  const runner = new BenchmarkRunner(commandHandler);

  try {
    // Lancer le benchmark
    const report = await runner.runBenchmark(version);

    console.log(`\n✅ Benchmark terminé avec succès!`);
    console.log(`📊 Résultats disponibles dans: data/benchmarks/`);

    // Afficher un résumé compact
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📈 MÉTRIQUES CLÉS`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`   Exactitude : ${report.passedTests}/${report.totalTests} tests réussis (${Math.round(report.passedTests / report.totalTests * 100)}%)`);
    console.log(`   Score moyen: ${report.averageScore}%`);
    console.log(`   Temps moyen: ${report.averageResponseTime}ms`);
    console.log(`   Temps médian: ${report.medianResponseTime}ms`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    // Sortir avec code 0 si tous les tests passent, sinon 1
    process.exit(report.failedTests > 0 ? 1 : 0);

  } catch (error) {
    console.error(`\n❌ Erreur lors du benchmark:`, error);
    process.exit(1);
  }
}

// Gérer les erreurs non catchées
process.on('unhandledRejection', (error) => {
  console.error('❌ Erreur non gérée:', error);
  process.exit(1);
});

// Lancer le benchmark
main();
