import axios from 'axios';
import { config } from './src/config';

async function testBankTransactions() {
  console.log('🏦 Exploration des transactions bancaires...\n');

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
    const response = await axiosInstance.get('/v1/bankaccounts');
    const accounts = response.data.BankAccounts || [];

    console.log(`✓ ${accounts.length} compte(s) bancaire(s) trouvé(s)\n`);

    for (const account of accounts) {
      const accountId = account.BankAccountID;
      const iban = account.IBAN;

      console.log(`\n${'='.repeat(70)}`);
      console.log(`🏦 Compte ${accountId} - ${iban}`);
      console.log('='.repeat(70));

      // Tester différents endpoints pour ce compte
      const endpoints = [
        `/v1/bankaccounts/${accountId}/transactions`,
        `/v1/bankaccounts/${accountId}/statements`,
        `/v1/bankaccounts/${accountId}/entries`,
        `/v1/bankaccounts/${accountId}/lines`,
        `/v1/bankaccounts/${accountId}`,
      ];

      for (const endpoint of endpoints) {
        try {
          const txResponse = await axiosInstance.get(endpoint, {
            params: { $top: 10 },
          });

          const txData = txResponse.data;
          const txItems = txData.Items || txData.items || txData.Transactions || txData.Entries || txData.Lines || [];

          if (Array.isArray(txItems) && txItems.length > 0) {
            console.log(`\n✓ ${endpoint}`);
            console.log(`   → ${txItems.length} transaction(s) trouvée(s)\n`);

            // Afficher les 5 premières transactions
            txItems.slice(0, 5).forEach((tx: any, index: number) => {
              console.log(`   ${index + 1}. Transaction:`);
              console.log(`      Date: ${tx.Date || tx.TransactionDate || tx.ValueDate || 'N/A'}`);
              console.log(`      Montant: ${tx.Amount || tx.TotalAmount || 'N/A'} ${tx.Currency || ''}`);
              console.log(`      Description: ${tx.Description || tx.Communication || tx.Memo || 'N/A'}`);
              console.log(`      Contrepartie: ${tx.CounterParty || tx.CounterPartyName || 'N/A'}`);
              console.log(`      Type: ${tx.Type || tx.TransactionType || 'N/A'}`);
              console.log(`      ID: ${tx.TransactionID || tx.ID || 'N/A'}`);
              console.log('');
            });

            // Analyser les rentrées vs sorties
            let rentrees = 0;
            let sorties = 0;
            let totalRentrees = 0;
            let totalSorties = 0;

            txItems.forEach((tx: any) => {
              const amount = parseFloat(tx.Amount || tx.TotalAmount || 0);
              if (amount > 0) {
                rentrees++;
                totalRentrees += amount;
              } else if (amount < 0) {
                sorties++;
                totalSorties += Math.abs(amount);
              }
            });

            console.log(`   📊 Statistiques (sur ${txItems.length} transactions):`);
            console.log(`      Rentrées: ${rentrees} (${totalRentrees.toFixed(2)} EUR)`);
            console.log(`      Sorties: ${sorties} (${totalSorties.toFixed(2)} EUR)`);
            console.log(`      Balance: ${(totalRentrees - totalSorties).toFixed(2)} EUR`);

            break; // On a trouvé les transactions, pas besoin de tester les autres endpoints

          } else if (txData && typeof txData === 'object' && !Array.isArray(txData)) {
            console.log(`\n✓ ${endpoint} → Détails du compte:`);
            console.log(JSON.stringify(txData, null, 2).substring(0, 500));
          } else {
            console.log(`   ✗ ${endpoint} → Vide`);
          }

        } catch (error: any) {
          console.log(`   ✗ ${endpoint} → ${error.response?.status || 'erreur'}`);
        }
      }
    }

  } catch (error: any) {
    console.error('❌ Erreur:', error.response?.data || error.message);
  }
}

testBankTransactions();
