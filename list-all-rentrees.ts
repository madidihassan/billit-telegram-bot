import axios from 'axios';
import { config } from './src/config';

async function listAllRentrees() {
  console.log('💰 Récupération de TOUTES les rentrées (recettes)...\n');

  const axiosInstance = axios.create({
    baseURL: config.billit.apiUrl,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'apikey': config.billit.apiKey,
      'partyID': config.billit.partyId,
    },
  });

  try {
    // Test 1: Récupérer avec filtre sur TransactionType = Credit
    console.log('📋 Test 1: Filtrer uniquement les RENTRÉES (TransactionType eq \'Credit\')');
    try {
      const response = await axiosInstance.get('/v1/financialTransactions', {
        params: {
          $filter: "TransactionType eq 'Credit'",
          $top: 100,
        },
      });
      const items = response.data.Items || response.data.items || response.data || [];
      console.log(`   ✓ ${items.length} rentrée(s) trouvée(s)`);
    } catch (error: any) {
      console.log(`   ✗ Filtre non supporté: ${error.response?.status}`);
    }

    // Test 2: Récupérer TOUTES les transactions (sans $top limit)
    console.log('\n📋 Test 2: Récupération de TOUTES les transactions (sans limit)');
    const allResponse = await axiosInstance.get('/v1/financialTransactions');
    const allTransactions = allResponse.data.Items || allResponse.data.items || allResponse.data || [];

    console.log(`   ✓ ${allTransactions.length} transaction(s) au total\n`);

    // Filtrer manuellement les rentrées et sorties
    const rentrees = allTransactions.filter((tx: any) => tx.TransactionType === 'Credit');
    const sorties = allTransactions.filter((tx: any) => tx.TransactionType === 'Debit');

    console.log('='.repeat(80));
    console.log('📊 ANALYSE COMPLÈTE DES TRANSACTIONS BANCAIRES');
    console.log('='.repeat(80));

    // Rentrées
    console.log(`\n💵 RENTRÉES (${rentrees.length} transactions):\n`);
    let totalRentrees = 0;

    // Grouper par date
    const rentreesParDate: Record<string, any[]> = {};
    rentrees.forEach((tx: any) => {
      const date = tx.ValueDate?.split('T')[0] || 'Date inconnue';
      if (!rentreesParDate[date]) rentreesParDate[date] = [];
      rentreesParDate[date].push(tx);
      totalRentrees += parseFloat(tx.TotalAmount || 0);
    });

    // Afficher les rentrées par date (dernières dates en premier)
    const dates = Object.keys(rentreesParDate).sort().reverse();
    dates.slice(0, 7).forEach(date => {
      const txs = rentreesParDate[date];
      const dailyTotal = txs.reduce((sum, tx) => sum + parseFloat(tx.TotalAmount || 0), 0);
      console.log(`\n   📅 ${date} - ${txs.length} rentrée(s) - Total: ${dailyTotal.toFixed(2)} EUR`);

      txs.slice(0, 5).forEach((tx: any, index: number) => {
        const note = (tx.Note || '').substring(0, 60);
        console.log(`      ${index + 1}. ${tx.TotalAmount.toFixed(2)} EUR - ${note}`);
      });

      if (txs.length > 5) {
        console.log(`      ... et ${txs.length - 5} autre(s)`);
      }
    });

    console.log(`\n   💰 TOTAL RENTRÉES: ${totalRentrees.toFixed(2)} EUR`);

    // Sorties
    console.log(`\n\n💸 SORTIES (${sorties.length} transactions):\n`);
    let totalSorties = 0;

    const sortiesParDate: Record<string, any[]> = {};
    sorties.forEach((tx: any) => {
      const date = tx.ValueDate?.split('T')[0] || 'Date inconnue';
      if (!sortiesParDate[date]) sortiesParDate[date] = [];
      sortiesParDate[date].push(tx);
      totalSorties += Math.abs(parseFloat(tx.TotalAmount || 0));
    });

    const datesSorties = Object.keys(sortiesParDate).sort().reverse();
    datesSorties.slice(0, 7).forEach(date => {
      const txs = sortiesParDate[date];
      const dailyTotal = txs.reduce((sum, tx) => sum + Math.abs(parseFloat(tx.TotalAmount || 0)), 0);
      console.log(`\n   📅 ${date} - ${txs.length} sortie(s) - Total: ${dailyTotal.toFixed(2)} EUR`);

      txs.slice(0, 5).forEach((tx: any, index: number) => {
        const note = (tx.Note || '').substring(0, 60);
        console.log(`      ${index + 1}. ${Math.abs(tx.TotalAmount).toFixed(2)} EUR - ${note}`);
      });

      if (txs.length > 5) {
        console.log(`      ... et ${txs.length - 5} autre(s)`);
      }
    });

    console.log(`\n   💰 TOTAL SORTIES: ${totalSorties.toFixed(2)} EUR`);

    // Balance
    console.log('\n' + '='.repeat(80));
    console.log(`💰 BALANCE NET: ${(totalRentrees - totalSorties).toFixed(2)} EUR`);
    console.log('='.repeat(80));

    // Comptes bancaires
    console.log('\n\n📊 Répartition par compte bancaire:');
    const parCompte: Record<string, { rentrees: number; sorties: number; count: number }> = {};

    allTransactions.forEach((tx: any) => {
      const iban = tx.IBAN || 'Inconnu';
      if (!parCompte[iban]) {
        parCompte[iban] = { rentrees: 0, sorties: 0, count: 0 };
      }

      parCompte[iban].count++;
      const amount = parseFloat(tx.TotalAmount || 0);
      if (tx.TransactionType === 'Credit') {
        parCompte[iban].rentrees += amount;
      } else {
        parCompte[iban].sorties += Math.abs(amount);
      }
    });

    Object.entries(parCompte).forEach(([iban, stats]) => {
      console.log(`\n   ${iban}:`);
      console.log(`      Transactions: ${stats.count}`);
      console.log(`      Rentrées: ${stats.rentrees.toFixed(2)} EUR`);
      console.log(`      Sorties: ${stats.sorties.toFixed(2)} EUR`);
      console.log(`      Balance: ${(stats.rentrees - stats.sorties).toFixed(2)} EUR`);
    });

  } catch (error: any) {
    console.error('❌ Erreur:', error.response?.data || error.message);
  }
}

listAllRentrees();
