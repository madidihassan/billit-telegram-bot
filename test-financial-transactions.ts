import axios from 'axios';
import { config } from './src/config';

async function testFinancialTransactions() {
  console.log('💰 Récupération des transactions bancaires (RECETTES + DÉPENSES)...\n');

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
    // Récupérer toutes les transactions financières
    console.log('📋 Appel API: GET /v1/financialTransactions');
    const response = await axiosInstance.get('/v1/financialTransactions', {
      params: {
        $top: 50, // Récupérer jusqu'à 50 transactions
      },
    });

    const transactions = response.data.Items || response.data.items || response.data.FinancialTransactions || response.data || [];

    if (!Array.isArray(transactions)) {
      console.log('\n⚠️  Format de réponse inattendu:');
      console.log(JSON.stringify(response.data, null, 2));
      return;
    }

    console.log(`\n✓ ${transactions.length} transaction(s) bancaire(s) trouvée(s)\n`);
    console.log('='.repeat(80));

    // Analyser et afficher les transactions
    let totalRentrees = 0;
    let totalSorties = 0;
    let nbRentrees = 0;
    let nbSorties = 0;

    // Afficher les 10 dernières transactions
    console.log('\n📊 Dernières transactions:\n');

    transactions.slice(0, 10).forEach((tx: any, index: number) => {
      const amount = parseFloat(tx.Amount || tx.TotalAmount || 0);
      const isRentree = amount > 0;

      if (isRentree) {
        totalRentrees += amount;
        nbRentrees++;
      } else {
        totalSorties += Math.abs(amount);
        nbSorties++;
      }

      const emoji = isRentree ? '💵 RENTRÉE' : '💸 SORTIE ';
      const amountStr = Math.abs(amount).toFixed(2);

      console.log(`${index + 1}. ${emoji}  ${amountStr.padStart(10)} EUR`);
      console.log(`   Date: ${tx.Date || tx.TransactionDate || tx.ValueDate || 'N/A'}`);
      console.log(`   Compte: ${tx.BankAccount || tx.IBAN || 'N/A'}`);
      console.log(`   Contrepartie: ${tx.CounterPartyName || tx.CounterParty || 'N/A'}`);
      console.log(`   Description: ${tx.Description || tx.Communication || tx.Memo || 'N/A'}`);
      console.log(`   ID: ${tx.FinancialTransactionID || tx.ID || 'N/A'}`);
      console.log('');
    });

    // Statistiques globales
    console.log('\n' + '='.repeat(80));
    console.log('📊 STATISTIQUES GLOBALES (sur les ' + transactions.length + ' transactions):');
    console.log('='.repeat(80));
    console.log(`\n💵 RENTRÉES (recettes):`);
    console.log(`   Nombre: ${nbRentrees}`);
    console.log(`   Total:  ${totalRentrees.toFixed(2)} EUR`);
    console.log(`\n💸 SORTIES (dépenses):`);
    console.log(`   Nombre: ${nbSorties}`);
    console.log(`   Total:  ${totalSorties.toFixed(2)} EUR`);
    console.log(`\n💰 BALANCE NET:`);
    console.log(`   ${(totalRentrees - totalSorties).toFixed(2)} EUR`);
    console.log('='.repeat(80));

    // Afficher quelques exemples de structure complète
    console.log('\n\n🔍 Structure complète d\'une transaction (exemple):');
    if (transactions.length > 0) {
      console.log(JSON.stringify(transactions[0], null, 2));
    }

  } catch (error: any) {
    console.error('❌ Erreur:', error.response?.data || error.message);

    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      console.error(`   Data:`, JSON.stringify(error.response.data, null, 2));
    }
  }
}

testFinancialTransactions();
