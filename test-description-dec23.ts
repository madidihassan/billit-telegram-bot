/**
 * Script de test pour voir les descriptions des transactions du 23 décembre
 */

import { BankClient } from './src/bank-client';

async function testDescriptions() {
  const bankClient = new BankClient();

  console.log('🔍 Test des descriptions des transactions du 23 décembre 2025\n');

  // Récupérer les transactions du 23 décembre
  const startDate = new Date(2025, 11, 23); // 23 décembre 2025
  const endDate = new Date(2025, 11, 23, 23, 59, 59, 999);

  const transactions = await bankClient.getTransactionsByPeriod(startDate, endDate);

  console.log(`✅ ${transactions.length} transaction(s) trouvée(s)\n`);

  // Chercher spécifiquement la transaction de 162,78 €
  const targetTx = transactions.find(tx => Math.abs(tx.amount - 162.78) < 0.01);

  if (targetTx) {
    console.log('💰 Transaction de 162,78 € trouvée :\n');
    console.log('   ID:', targetTx.id);
    console.log('   Date:', targetTx.date);
    console.log('   Type:', targetTx.type);
    console.log('   Montant:', targetTx.amount, '€');
    console.log('   Description:', `"${targetTx.description}"`);
    console.log('   IBAN:', targetTx.iban);
    console.log('   Bank Account ID:', targetTx.bankAccountId);
  } else {
    console.log('❌ Transaction de 162,78 € NON trouvée\n');
  }

  // Afficher toutes les transactions du 23 décembre
  console.log('\n📋 Toutes les transactions du 23 décembre :\n');
  transactions.forEach((tx, idx) => {
    console.log(`${idx + 1}. ${tx.type} - ${tx.amount}€`);
    console.log(`   Description: "${tx.description}"`);
    console.log(`   Date: ${tx.date}\n`);
  });

  // Tester la détection de fournisseurs
  console.log('\n🧪 Test d\'extraction de fournisseurs depuis les descriptions :\n');
  const { SupplierLearningService } = await import('./src/supplier-learning-service');
  const learningService = new SupplierLearningService();

  transactions.forEach((tx, idx) => {
    const extracted = learningService.extractSupplierFromDescription(tx.description);
    console.log(`${idx + 1}. "${tx.description}"`);
    console.log(`   ➜ Fournisseur extrait: ${extracted || '❌ Aucun'}\n`);
  });

  process.exit(0);
}

testDescriptions().catch(error => {
  console.error('❌ Erreur:', error);
  process.exit(1);
});
