/**
 * Débogage du filtrage par date
 */

import { BankClient } from './src/bank-client';

async function debugDateFilter() {
  const bankClient = new BankClient();

  console.log('🔍 Débogage du filtrage de date pour le 24/12/2025\n');

  // 1. Créer les dates comme le fait le bot
  const startDateStr = '2025-12-24';
  const endDateStr = '2025-12-24';

  const match1 = startDateStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const startDate = new Date(parseInt(match1![1]), parseInt(match1![2]) - 1, parseInt(match1![3]));

  const match2 = endDateStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const endDate = new Date(parseInt(match2![1]), parseInt(match2![2]) - 1, parseInt(match2![3]));

  console.log('📅 Dates de recherche :');
  console.log(`   Start Date: ${startDate.toISOString()}`);
  console.log(`   End Date:   ${endDate.toISOString()}`);
  console.log(`   Start (local): ${startDate.toLocaleString('fr-FR')}`);
  console.log(`   End (local):   ${endDate.toLocaleString('fr-FR')}\n`);

  // 2. Récupérer les transactions filtrées par l'API
  const transactions = await bankClient.getTransactionsByPeriod(startDate, endDate);

  console.log(`✅ ${transactions.length} transaction(s) trouvée(s) après filtrage\n`);

  // 3. Récupérer TOUTES les transactions du mois
  const allTransactions = await bankClient.getMonthlyTransactions();
  console.log(`✅ ${allTransactions.length} transaction(s) totale(s) ce mois-ci\n`);

  // 4. Filtrer manuellement pour le 24 décembre
  const dec24 = allTransactions.filter(tx => {
    const txDate = new Date(tx.date);
    console.log(`   Transaction: ${tx.date} -> ${txDate.toLocaleDateString('fr-FR')}`);
    return txDate.getDate() === 24 &&
           txDate.getMonth() === 11 &&
           txDate.getFullYear() === 2025;
  });

  console.log(`\n📅 ${dec24.length} transaction(s) du 24/12/2025 trouvée(s) manuellement:\n`);

  if (dec24.length > 0) {
    dec24.forEach((tx, idx) => {
      const txDate = new Date(tx.date);
      console.log(`   ${idx + 1}. ${tx.type} - ${tx.amount}€`);
      console.log(`      Date brute: ${tx.date}`);
      console.log(`      Date obj:  ${txDate.toISOString()}`);
      console.log(`      Date FR:   ${txDate.toLocaleString('fr-FR')}`);
      console.log(`      ≥ start:  ${txDate >= startDate} (${txDate.toISOString()} >= ${startDate.toISOString()})`);
      console.log(`      ≤ end:    ${txDate <= endDate} (${txDate.toISOString()} <= ${endDate.toISOString()})`);
      console.log();
    });
  }

  process.exit(0);
}

debugDateFilter();
