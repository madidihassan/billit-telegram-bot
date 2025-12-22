import axios from 'axios';
import { config } from './src/config';

async function testAllEndpoints() {
  console.log('🔍 Exploration complète de l\'API Billit...\n');

  const axiosInstance = axios.create({
    baseURL: config.billit.apiUrl,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'apikey': config.billit.apiKey,
      'partyID': config.billit.partyId,
    },
  });

  // Afficher les 5 documents actuels
  console.log('📄 Documents actuels dans le compte:');
  try {
    const response = await axiosInstance.get('/v1/orders', {
      params: { $top: 10 },
    });
    const items = response.data.Items || response.data.items || response.data || [];

    items.forEach((item: any, index: number) => {
      console.log(`\n   ${index + 1}. ${item.OrderNumber || 'Sans numéro'}`);
      console.log(`      Type: ${item.OrderType}`);
      console.log(`      Direction: ${item.OrderDirection}`);
      console.log(`      Status: ${item.OrderStatus}`);
      console.log(`      Partie: ${item.CounterParty?.DisplayName || 'Inconnu'}`);
      console.log(`      Montant: ${item.TotalIncl} ${item.Currency}`);
    });
  } catch (error: any) {
    console.error('   ✗ Erreur:', error.message);
  }

  // Tester différents endpoints possibles
  console.log('\n\n🔍 Test des endpoints API disponibles:');

  const endpoints = [
    '/v1/orders',          // Commandes/Factures
    '/v1/invoices',        // Factures spécifiques
    '/v1/sales',           // Ventes
    '/v1/quotes',          // Devis
    '/v1/contacts',        // Contacts/Clients
    '/v1/parties',         // Parties (clients/fournisseurs)
    '/v1/products',        // Produits
    '/v1/transactions',    // Transactions
    '/v1/payments',        // Paiements
  ];

  for (const endpoint of endpoints) {
    try {
      const response = await axiosInstance.get(endpoint, {
        params: { $top: 1 },
      });
      const items = response.data.Items || response.data.items || response.data || [];
      const count = Array.isArray(items) ? items.length : 'N/A';
      console.log(`   ✓ ${endpoint.padEnd(25)} → Disponible (${count} items)`);
    } catch (error: any) {
      const status = error.response?.status || 'erreur';
      console.log(`   ✗ ${endpoint.padEnd(25)} → ${status}`);
    }
  }

  // Tester les différentes valeurs de OrderDirection possibles
  console.log('\n\n🔍 Test des valeurs OrderDirection possibles:');
  const directions = ['Cost', 'Sales', 'Income', 'Revenue', 'Purchase', 'Expense'];

  for (const dir of directions) {
    try {
      const response = await axiosInstance.get('/v1/orders', {
        params: {
          $filter: `OrderDirection eq '${dir}'`,
          $top: 1,
        },
      });
      const items = response.data.Items || response.data.items || response.data || [];
      console.log(`   ${dir.padEnd(15)} → ${items.length} document(s)`);
    } catch (error: any) {
      console.log(`   ${dir.padEnd(15)} → erreur`);
    }
  }
}

testAllEndpoints();
