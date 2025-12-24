import axios from 'axios';
import { config } from './src/config';

async function checkBillitAccounts() {
  console.log('=== Vérification des comptes bancaires Billit ===\n');

  const axiosInstance = axios.create({
    baseURL: config.billit.apiUrl,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'apikey': config.billit.apiKey,
    },
  });

  if (config.billit.partyId) {
    axiosInstance.defaults.headers.common['partyID'] = config.billit.partyId;
  }

  try {
    // 1. Vérifier les comptes bancaires disponibles
    console.log('🏦 Récupération des comptes bancaires...\n');
    const accountsResponse = await axiosInstance.get('/bankaccounts');
    console.log('Réponse comptes bancaires:', JSON.stringify(accountsResponse.data, null, 2));
    console.log('\n');

    // 2. Récupérer les transactions avec plus de détails
    console.log('💰 Récupération des transactions financières...\n');

    // Essayer différentes périodes
    const today = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(today.getDate() - 30);

    const params = {
      from: thirtyDaysAgo.toISOString().split('T')[0],
      to: today.toISOString().split('T')[0],
      limit: 50,
    };

    console.log('Paramètres de recherche:', params);
    console.log('');

    const transactionsResponse = await axiosInstance.get('/financialtransactions', { params });

    console.log(`✓ ${transactionsResponse.data.data?.length || 0} transactions récupérées\n`);

    if (transactionsResponse.data.data && transactionsResponse.data.data.length > 0) {
      // Chercher des transactions contenant "plux" dans n'importe quel champ
      const pluxeeTransactions = transactionsResponse.data.data.filter((tx: any) => {
        const json = JSON.stringify(tx).toLowerCase();
        return json.includes('plux');
      });

      console.log(`🔍 Transactions contenant "plux": ${pluxeeTransactions.length}\n`);

      if (pluxeeTransactions.length > 0) {
        console.log('Détails des transactions Pluxee trouvées:\n');
        pluxeeTransactions.slice(0, 5).forEach((tx: any, idx: number) => {
          console.log(`${idx + 1}. Transaction ID: ${tx.id}`);
          console.log(`   Type: ${tx.type}`);
          console.log(`   Montant: ${tx.amount}`);
          console.log(`   Date: ${tx.bookingDate}`);
          console.log(`   Description: ${tx.description}`);
          console.log(`   Contrepartie: ${tx.counterpartyName}`);
          console.log(`   Compte bancaire ID: ${tx.bankAccountId}`);
          console.log('   Objet complet:', JSON.stringify(tx, null, 2));
          console.log('');
        });
      } else {
        console.log('❌ Aucune transaction Pluxee trouvée dans les 30 derniers jours\n');

        // Afficher un échantillon de transactions
        console.log('📋 Échantillon de 10 transactions récentes:\n');
        transactionsResponse.data.data.slice(0, 10).forEach((tx: any, idx: number) => {
          console.log(`${idx + 1}. [${tx.type}] ${tx.bookingDate} - ${tx.amount} ${tx.currency}`);
          console.log(`   Description: ${tx.description?.substring(0, 100)}`);
          console.log(`   Contrepartie: ${tx.counterpartyName}`);
          console.log('');
        });
      }
    }

  } catch (error: any) {
    console.error('❌ Erreur:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

checkBillitAccounts();
