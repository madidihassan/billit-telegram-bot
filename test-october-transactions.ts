import { BankClient } from './src/bank-client';

async function checkOctoberTransactions() {
  const bankClient = new BankClient();

  console.log('=== Vérification des transactions d\'octobre 2025 ===\n');

  const startDate = new Date(2025, 9, 1); // 1er octobre 2025
  const endDate = new Date(2025, 9, 31, 23, 59, 59); // 31 octobre 2025

  console.log(`Période: ${startDate.toLocaleDateString('fr-BE')} - ${endDate.toLocaleDateString('fr-BE')}\n`);

  try {
    const transactions = await bankClient.getTransactionsByPeriod(startDate, endDate);
    console.log(`✓ ${transactions.length} transactions trouvées en octobre 2025\n`);

    if (transactions.length > 0) {
      // Stats
      const credits = transactions.filter(tx => tx.type === 'Credit');
      const debits = transactions.filter(tx => tx.type === 'Debit');

      const totalCredits = credits.reduce((sum, tx) => sum + tx.amount, 0);
      const totalDebits = debits.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

      console.log('📊 Statistiques:');
      console.log(`   Crédits (recettes): ${credits.length} transactions pour ${totalCredits.toFixed(2)} €`);
      console.log(`   Débits (dépenses): ${debits.length} transactions pour ${totalDebits.toFixed(2)} €`);
      console.log(`   Balance: ${(totalCredits - totalDebits).toFixed(2)} €`);
      console.log('');

      console.log('📋 Échantillon de 5 transactions:');
      transactions.slice(0, 5).forEach((tx, idx) => {
        console.log(`${idx + 1}. [${tx.type}] ${new Date(tx.date).toLocaleDateString('fr-BE')} - ${tx.amount} €`);
        console.log(`   ${tx.description?.substring(0, 80)}`);
        console.log('');
      });
    } else {
      console.log('❌ Aucune transaction en octobre 2025');
    }

  } catch (error: any) {
    console.error('❌ Erreur:', error.message);
  }
}

checkOctoberTransactions();
