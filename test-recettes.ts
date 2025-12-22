import axios from 'axios';
import { config } from './src/config';

async function testRecettes() {
  console.log('🔍 Test des factures de VENTE (recettes/revenus)...\n');

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
    // Test 1: Factures de vente (recettes)
    console.log('📋 Factures de VENTE (OrderDirection = Sales/Income)');

    const directions = ['Sales', 'Income', 'Revenue'];

    for (const direction of directions) {
      try {
        console.log(`\n   Test avec OrderDirection = '${direction}':`);
        const response = await axiosInstance.get('/v1/orders', {
          params: {
            $filter: `OrderDirection eq '${direction}'`,
            $top: 20,
          },
        });

        const items = response.data.Items || response.data.items || response.data || [];
        console.log(`   ✓ Trouvé: ${items.length} document(s)`);

        if (items.length > 0) {
          // Analyser les types
          const typeStats: Record<string, number> = {};
          items.forEach((item: any) => {
            const type = item.OrderType || 'Unknown';
            typeStats[type] = (typeStats[type] || 0) + 1;
          });

          console.log('      Types:', JSON.stringify(typeStats));

          // Afficher quelques exemples
          console.log('\n      Exemples:');
          items.slice(0, 3).forEach((item: any, index: number) => {
            console.log(`\n      ${index + 1}. ${item.OrderNumber || 'Sans numéro'}`);
            console.log(`         Type: ${item.OrderType}, Status: ${item.OrderStatus}`);
            console.log(`         Direction: ${item.OrderDirection}`);
            console.log(`         Client: ${item.CounterParty?.DisplayName || 'Inconnu'}`);
            console.log(`         Montant: ${item.TotalIncl || 0} ${item.Currency || 'EUR'}`);
            console.log(`         Date: ${item.OrderDate}`);
            console.log(`         Paid: ${item.Paid}`);
          });
        }
      } catch (error: any) {
        console.log(`   ✗ Erreur avec '${direction}': ${error.response?.status || error.message}`);
      }
    }

    // Test 2: Tous les types de direction disponibles
    console.log('\n\n📋 TOUS LES DOCUMENTS (sans filtre Direction):');
    const allDocs = await axiosInstance.get('/v1/orders', {
      params: { $top: 50 },
    });

    const allItems = allDocs.data.Items || allDocs.data.items || allDocs.data || [];
    console.log(`   Total: ${allItems.length} documents`);

    const directionStats: Record<string, number> = {};
    allItems.forEach((item: any) => {
      const dir = item.OrderDirection || 'Unknown';
      directionStats[dir] = (directionStats[dir] || 0) + 1;
    });

    console.log('\n   Répartition par OrderDirection:');
    Object.entries(directionStats).forEach(([dir, count]) => {
      console.log(`      ${dir}: ${count}`);
    });

  } catch (error: any) {
    console.error('❌ Erreur:', error.response?.data || error.message);
  }
}

testRecettes();
