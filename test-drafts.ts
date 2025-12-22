import axios from 'axios';
import { config } from './src/config';

async function testDrafts() {
  console.log('🔍 Recherche de brouillons/documents non finalisés...\n');

  const axiosInstance = axios.create({
    baseURL: config.billit.apiUrl,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'apikey': config.billit.apiKey,
      'partyID': config.billit.partyId,
    },
  });

  // Tester différents filtres
  const filters = [
    "OrderDirection eq 'Cost'", // Sans filtre sur OrderType
    "OrderType eq 'Draft' and OrderDirection eq 'Cost'",
    "OrderType eq 'QuickEntry' and OrderDirection eq 'Cost'",
    "OrderType eq 'Order' and OrderDirection eq 'Cost'",
    "OrderStatus eq 'Draft'",
  ];

  for (const filter of filters) {
    try {
      console.log(`\n📋 Test avec filtre: ${filter}`);
      const response = await axiosInstance.get('/v1/orders', {
        params: {
          $filter: filter,
          $top: 10,
        },
      });

      const items = response.data.Items || response.data.items || response.data || [];
      console.log(`   ✓ Résultat: ${items.length} document(s) trouvé(s)`);

      if (items.length > 0) {
        items.slice(0, 3).forEach((item: any, index: number) => {
          console.log(`\n      ${index + 1}. ${item.OrderNumber || item.CounterParty?.DisplayName || 'Sans nom'}`);
          console.log(`         Type: ${item.OrderType}, Status: ${item.OrderStatus}`);
          console.log(`         Created: ${item.Created}`);
        });
      }
    } catch (error: any) {
      console.log(`   ✗ Erreur: ${error.response?.status || error.message}`);
    }
  }

  // Tester aussi les endpoints possibles pour les brouillons
  console.log('\n\n🔍 Test d\'endpoints alternatifs...');
  const endpoints = [
    '/v1/drafts',
    '/v1/documents',
    '/v1/quick-entries',
  ];

  for (const endpoint of endpoints) {
    try {
      console.log(`\n📋 Test endpoint: ${endpoint}`);
      const response = await axiosInstance.get(endpoint, {
        params: { $top: 5 },
      });
      const items = response.data.Items || response.data.items || response.data || [];
      console.log(`   ✓ Succès: ${items.length} document(s) trouvé(s)`);
    } catch (error: any) {
      console.log(`   ✗ Endpoint non disponible (${error.response?.status || 'erreur'})`);
    }
  }
}

testDrafts();
