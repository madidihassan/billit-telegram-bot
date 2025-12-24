/**
 * Test des transactions par date spécifique
 */

import { BankClient } from './src/bank-client';

async function testDateTransactions() {
  const bankClient = new BankClient();

  console.log('🔍 Test des transactions du 24 décembre 2024...\n');

  try {
    const transactions = await bankClient.getTransactionsByDate(new Date('2024-12-24'));

    console.log(`✅ ${transactions.length} transaction(s) trouvée(s) pour le 24/12/2024\n`);

    if (transactions.length > 0) {
      console.log('📋 Détails des transactions :');
      transactions.forEach((tx, idx) => {
        console.log(`   ${idx + 1}. ${tx.type} - ${tx.amount}€ - ${tx.description}`);
        console.log(`      Date: ${tx.date}`);
      });
    } else {
      console.log('❌ Aucune transaction trouvée pour le 24/12/2024');
    }

    console.log('\n🔍 Test des transactions du 24 décembre 2025...\n');
    const transactions2025 = await bankClient.getTransactionsByDate(new Date('2025-12-24'));

    console.log(`✅ ${transactions2025.length} transaction(s) trouvée(s) pour le 24/12/2025\n`);

    if (transactions2025.length > 0) {
      console.log('📋 Détails des transactions :');
      transactions2025.forEach((tx, idx) => {
        console.log(`   ${idx + 1}. ${tx.type} - ${tx.amount}€ - ${tx.description}`);
        console.log(`      Date: ${tx.date}`);
      });
    } else {
      console.log('❌ Aucune transaction trouvée pour le 24/12/2025');
    }

  } catch (error: any) {
    console.error('❌ Erreur:', error.message);
  }

  process.exit(0);
}

testDateTransactions();
