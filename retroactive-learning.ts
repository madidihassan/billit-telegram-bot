/**
 * Scan rétroactif pour apprendre TOUS les fournisseurs depuis les transactions existantes
 */

import { BankClient } from './src/bank-client';
import { SupplierLearningService } from './src/supplier-learning-service';

async function retroactiveLearning() {
  const bankClient = new BankClient();
  const learningService = new SupplierLearningService();

  console.log('🔍 Scan rétroactif pour apprendre les fournisseurs...\n');

  // Récupérer TOUTES les transactions du mois
  console.log('📊 Récupération de toutes les transactions de décembre...');
  const transactions = await bankClient.getMonthlyTransactions();

  console.log(`✅ ${transactions.length} transactions trouvées\n`);

  let learnedCount = 0;
  let alreadyKnownCount = 0;
  let notExtractedCount = 0;

  // Analyser chaque transaction
  transactions.forEach((tx, idx) => {
    const description = tx.description;

    // Essayer d'extraire un fournisseur
    const extracted = learningService.extractSupplierFromDescription(description);

    if (extracted) {
      // Vérifier s'il est déjà connu
      const isKnown = learningService.isSupplierKnown(extracted);

      if (!isKnown) {
        // Apprendre ce fournisseur
        const learned = learningService.learnFromDescription(description);
        if (learned) {
          learnedCount++;
          console.log(`🧑‍🎓 [${idx + 1}/${transactions.length}] Nouveau fournisseur appris: "${extracted}"`);
        }
      } else {
        alreadyKnownCount++;
      }
    } else {
      notExtractedCount++;
    }
  });

  console.log('\n📊 Résultats du scan rétroactif:');
  console.log(`   ✅ Nouveaux fournisseurs appris: ${learnedCount}`);
  console.log(`   ℹ️  Fournisseurs déjà connus: ${alreadyKnownCount}`);
  console.log(`   ❌ Descriptions sans fournisseur: ${notExtractedCount}`);
  console.log(`   📁 Total fournisseurs dans la BD: ${learningService.getSupplierCount()}`);

  process.exit(0);
}

retroactiveLearning().catch(error => {
  console.error('❌ Erreur:', error);
  process.exit(1);
});
