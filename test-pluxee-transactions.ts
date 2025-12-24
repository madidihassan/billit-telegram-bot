import { BankClient } from './src/bank-client';

async function testPluxeeTransactions() {
  const bankClient = new BankClient();

  console.log('=== Test des transactions Pluxee ===\n');

  // Période décembre 2025
  const startDate = new Date(2025, 11, 1); // 1er décembre 2025
  const endDate = new Date(2025, 11, 31, 23, 59, 59); // 31 décembre 2025

  console.log(`Période: ${startDate.toLocaleDateString('fr-BE')} - ${endDate.toLocaleDateString('fr-BE')}\n`);

  try {
    // 1. Récupérer toutes les transactions de décembre
    const allTransactions = await bankClient.getTransactionsByPeriod(startDate, endDate);
    console.log(`✓ ${allTransactions.length} transactions trouvées en décembre\n`);

    // 2. Chercher les transactions Pluxee avec searchByDescription
    const pluxeeTransactions = await bankClient.searchByDescription('pluxee', startDate, endDate);
    console.log(`✓ ${pluxeeTransactions.length} transactions Pluxee trouvées\n`);

    if (pluxeeTransactions.length > 0) {
      console.log('Détails des 5 premières transactions Pluxee:\n');
      pluxeeTransactions.slice(0, 5).forEach((tx, idx) => {
        console.log(`${idx + 1}. Type: ${tx.type} | Montant: ${tx.amount} € | Date: ${new Date(tx.date).toLocaleDateString('fr-BE')}`);
        console.log(`   Description: ${tx.description?.substring(0, 60)}...`);
        console.log('');
      });

      // Stats
      const credits = pluxeeTransactions.filter(tx => tx.type === 'Credit');
      const debits = pluxeeTransactions.filter(tx => tx.type === 'Debit');

      console.log(`\n📊 Statistiques:`);
      console.log(`   Crédits (reçus): ${credits.length} transactions`);
      console.log(`   Débits (payés): ${debits.length} transactions`);

      if (credits.length > 0) {
        const totalCredits = credits.reduce((sum, tx) => sum + tx.amount, 0);
        console.log(`   Total crédits: ${totalCredits.toFixed(2)} €`);
      }

      if (debits.length > 0) {
        const totalDebits = debits.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
        console.log(`   Total débits: ${totalDebits.toFixed(2)} €`);
      }
    } else {
      console.log('❌ Aucune transaction Pluxee trouvée en décembre 2025');

      // Tester avec d'autres variantes
      console.log('\nTest avec autres variantes:');
      const pluxi = await bankClient.searchByDescription('pluxi', startDate, endDate);
      console.log(`- "pluxi": ${pluxi.length} résultats`);

      const pluxeebelgium = await bankClient.searchByDescription('pluxee belgium', startDate, endDate);
      console.log(`- "pluxee belgium": ${pluxeebelgium.length} résultats`);
    }
  } catch (error: any) {
    console.error('❌ Erreur:', error.message);
  }
}

testPluxeeTransactions();
