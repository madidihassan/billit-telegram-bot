import axios from 'axios';
import { config } from './src/config';

async function testODataMetadata() {
  console.log('🔍 Exploration de la structure de l\'API via OData $metadata...\n');

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
    // Tester le endpoint $metadata OData
    console.log('📋 Tentative de récupération du $metadata:');
    const response = await axiosInstance.get('/v1/$metadata');
    console.log('\n✓ Métadonnées trouvées !');
    console.log(response.data);

  } catch (error: any) {
    console.log('✗ $metadata non disponible');
  }

  // Tester avec différents filtres OData sur /v1/orders
  console.log('\n\n📋 Test des filtres avancés sur /v1/orders:');

  const filters = [
    // Chercher des factures de vente
    "OrderType eq 'SalesInvoice'",
    "OrderType eq 'Sale'",

    // Chercher des types spécifiques
    "OrderType eq 'Receipt'",
    "OrderType eq 'CreditNote'",
    "OrderType eq 'DebitNote'",
  ];

  for (const filter of filters) {
    try {
      const response = await axiosInstance.get('/v1/orders', {
        params: {
          $filter: filter,
          $top: 5,
        },
      });
      const items = response.data.Items || response.data.items || response.data || [];
      console.log(`\n   "${filter}"`);
      console.log(`   → ${items.length} résultat(s)`);

      if (items.length > 0) {
        items.slice(0, 2).forEach((item: any) => {
          console.log(`      - ${item.OrderNumber}: ${item.CounterParty?.DisplayName}, ${item.TotalIncl} EUR`);
        });
      }
    } catch (error: any) {
      console.log(`\n   "${filter}"`);
      console.log(`   → Erreur: ${error.response?.status || error.message}`);
    }
  }
}

testODataMetadata();
