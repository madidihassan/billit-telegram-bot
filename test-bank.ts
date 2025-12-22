import axios from 'axios';
import { config } from './src/config';

async function testBankStatements() {
  console.log('🏦 Exploration des extraits de banque et transactions...\n');

  const axiosInstance = axios.create({
    baseURL: config.billit.apiUrl,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'apikey': config.billit.apiKey,
      'partyID': config.billit.partyId,
    },
  });

  // Tester les endpoints bancaires possibles
  const bankEndpoints = [
    '/v1/bankstatements',
    '/v1/bank-statements',
    '/v1/banktransactions',
    '/v1/bank-transactions',
    '/v1/transactions',
    '/v1/bankaccounts',
    '/v1/bank-accounts',
    '/v1/accounts',
    '/v1/statements',
    '/v1/entries',
    '/v1/bankentries',
  ];

  console.log('📋 Test des endpoints bancaires:\n');

  for (const endpoint of bankEndpoints) {
    try {
      const response = await axiosInstance.get(endpoint, {
        params: { $top: 5 },
      });
      const items = response.data.Items || response.data.items || response.data || [];
      const count = Array.isArray(items) ? items.length : 'N/A';

      console.log(`✓ ${endpoint.padEnd(30)} → DISPONIBLE (${count} items)`);

      if (Array.isArray(items) && items.length > 0) {
        console.log(`   Exemples:`);
        items.slice(0, 3).forEach((item: any, index: number) => {
          console.log(`\n   ${index + 1}.`, JSON.stringify(item, null, 6).substring(0, 300) + '...');
        });
        console.log('\n');
      }
    } catch (error: any) {
      const status = error.response?.status || 'erreur';
      console.log(`✗ ${endpoint.padEnd(30)} → ${status}`);
    }
  }

  // Essayer de récupérer tous les endpoints disponibles
  console.log('\n\n📋 Tous les endpoints v1 testés:');
  const allEndpoints = [
    '/v1/orders',
    '/v1/parties',
    '/v1/products',
    '/v1/bankstatements',
    '/v1/banktransactions',
    '/v1/accounts',
    '/v1/journals',
    '/v1/ledgers',
    '/v1/vouchers',
    '/v1/receipts',
    '/v1/cashflow',
  ];

  const available: string[] = [];
  for (const endpoint of allEndpoints) {
    try {
      await axiosInstance.get(endpoint, { params: { $top: 1 } });
      available.push(endpoint);
      console.log(`   ✓ ${endpoint}`);
    } catch (error: any) {
      console.log(`   ✗ ${endpoint} (${error.response?.status})`);
    }
  }

  console.log(`\n\n📊 Résumé: ${available.length} endpoints disponibles`);
  console.log(`Endpoints accessibles: ${available.join(', ')}`);
}

testBankStatements();
