import axios from 'axios';
import { config } from './src/config';

async function testBankAccounts() {
  console.log('🏦 Exploration de /v1/bankaccounts...\n');

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
    // 1. Récupérer tous les comptes bancaires
    console.log('📋 Comptes bancaires disponibles:');
    const response = await axiosInstance.get('/v1/bankaccounts');

    console.log('\nRéponse complète:');
    console.log(JSON.stringify(response.data, null, 2));

    const items = response.data.Items || response.data.items || response.data || [];

    if (Array.isArray(items)) {
      console.log(`\n\n✓ ${items.length} compte(s) bancaire(s) trouvé(s)\n`);

      items.forEach((account: any, index: number) => {
        console.log(`\n${index + 1}. Compte:`);
        console.log(`   ID: ${account.BankAccountID || account.ID || account.id}`);
        console.log(`   Nom: ${account.Name || account.AccountName || 'N/A'}`);
        console.log(`   IBAN: ${account.IBAN || 'N/A'}`);
        console.log(`   Banque: ${account.BankName || 'N/A'}`);
        console.log(`   Balance: ${account.Balance || 'N/A'}`);
        console.log(`   Devise: ${account.Currency || 'N/A'}`);
      });

      // 2. Tester si on peut récupérer les transactions pour chaque compte
      console.log('\n\n📋 Test des transactions par compte:');

      for (const account of items) {
        const accountId = account.BankAccountID || account.ID || account.id;

        if (accountId) {
          console.log(`\n   Compte ${accountId}:`);

          const endpoints = [
            `/v1/bankaccounts/${accountId}/transactions`,
            `/v1/bankaccounts/${accountId}/statements`,
            `/v1/bankaccounts/${accountId}/entries`,
            `/v1/bankaccounts/${accountId}`,
          ];

          for (const endpoint of endpoints) {
            try {
              const txResponse = await axiosInstance.get(endpoint);
              const txItems = txResponse.data.Items || txResponse.data.items || txResponse.data || [];
              const count = Array.isArray(txItems) ? txItems.length : 'objet';
              console.log(`      ✓ ${endpoint} → ${count}`);

              if (Array.isArray(txItems) && txItems.length > 0) {
                console.log(`\n      Exemple de transaction:`);
                console.log(JSON.stringify(txItems[0], null, 8).substring(0, 500));
              }
            } catch (error: any) {
              console.log(`      ✗ ${endpoint} → ${error.response?.status || 'erreur'}`);
            }
          }
        }
      }
    } else {
      console.log('\n⚠️  Réponse non-array, structure différente');
    }

  } catch (error: any) {
    console.error('❌ Erreur:', error.response?.data || error.message);
  }
}

testBankAccounts();
