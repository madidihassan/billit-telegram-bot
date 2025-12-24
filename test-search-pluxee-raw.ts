import { BankClient } from './src/bank-client';

async function searchPluxeeInRawTransactions() {
  const bankClient = new BankClient();

  console.log('=== Recherche manuelle de Pluxee dans les transactions ===\n');

  const startDate = new Date(2025, 11, 1);
  const endDate = new Date(2025, 11, 31, 23, 59, 59);

  try {
    const allTransactions = await bankClient.getTransactionsByPeriod(startDate, endDate);
    console.log(`✓ ${allTransactions.length} transactions en décembre 2025\n`);

    // Chercher "plux" dans les descriptions (cas insensible)
    console.log('🔍 Recherche de "plux" dans les descriptions...\n');
    const pluxMatches = allTransactions.filter(tx =>
      tx.description?.toLowerCase().includes('plux')
    );
    console.log(`Résultats: ${pluxMatches.length} transactions\n`);

    if (pluxMatches.length > 0) {
      pluxMatches.forEach((tx, idx) => {
        console.log(`${idx + 1}. ${tx.type} | ${tx.amount} € | ${new Date(tx.date).toLocaleDateString('fr-BE')}`);
        console.log(`   ${tx.description}`);
        console.log('');
      });
    }

    // Chercher "N.V." ou "n.v."
    console.log('\n🔍 Recherche de "n.v." dans les descriptions...\n');
    const nvMatches = allTransactions.filter(tx =>
      tx.description?.toLowerCase().includes('n.v.')
    );
    console.log(`Résultats: ${nvMatches.length} transactions\n`);

    if (nvMatches.length > 0 && nvMatches.length <= 10) {
      nvMatches.forEach((tx, idx) => {
        console.log(`${idx + 1}. ${tx.type} | ${tx.amount} € | ${new Date(tx.date).toLocaleDateString('fr-BE')}`);
        console.log(`   ${tx.description}`);
        console.log('');
      });
    } else if (nvMatches.length > 10) {
      console.log(`Trop de résultats (${nvMatches.length}), affichage limité aux 5 premiers:`);
      nvMatches.slice(0, 5).forEach((tx, idx) => {
        console.log(`${idx + 1}. ${tx.type} | ${tx.amount} € | ${new Date(tx.date).toLocaleDateString('fr-BE')}`);
        console.log(`   ${tx.description?.substring(0, 80)}`);
        console.log('');
      });
    }

    // Afficher un échantillon de descriptions
    console.log('\n📋 Échantillon de 10 descriptions de transactions:\n');
    allTransactions.slice(0, 10).forEach((tx, idx) => {
      console.log(`${idx + 1}. [${tx.type}] ${new Date(tx.date).toLocaleDateString('fr-BE')} - ${tx.amount} €`);
      console.log(`   ${tx.description?.substring(0, 100)}`);
      console.log('');
    });

  } catch (error: any) {
    console.error('❌ Erreur:', error.message);
  }
}

searchPluxeeInRawTransactions();
