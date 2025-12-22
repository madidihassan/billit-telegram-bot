import axios from 'axios';
import { config } from './src/config';

async function testBillitAPI() {
  console.log('🔍 Test de l\'API Billit pour voir tous les types de documents...\n');

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
    // Test 1: Récupérer TOUS les orders sans filtre de type
    console.log('📋 Test 1: Tous les orders (Direction=Cost, sans filtre sur OrderType)');
    const allOrders = await axiosInstance.get('/v1/orders', {
      params: {
        $filter: "OrderDirection eq 'Cost'",
        $top: 20,
      },
    });

    const items = allOrders.data.Items || allOrders.data.items || allOrders.data || [];
    console.log(`   Trouvé: ${items.length} documents\n`);

    // Analyser les types
    const typeStats: Record<string, number> = {};
    const statusStats: Record<string, number> = {};

    items.forEach((item: any) => {
      const type = item.OrderType || 'Unknown';
      const status = item.OrderStatus || 'Unknown';

      typeStats[type] = (typeStats[type] || 0) + 1;
      statusStats[status] = (statusStats[status] || 0) + 1;
    });

    console.log('📊 Statistiques des OrderType:');
    Object.entries(typeStats).forEach(([type, count]) => {
      console.log(`   ${type}: ${count}`);
    });

    console.log('\n📊 Statistiques des OrderStatus:');
    Object.entries(statusStats).forEach(([status, count]) => {
      console.log(`   ${status}: ${count}`);
    });

    console.log('\n📄 Détails des 5 derniers documents:');
    items.slice(0, 5).forEach((item: any, index: number) => {
      console.log(`\n   ${index + 1}. ${item.OrderNumber || 'Sans numéro'}`);
      console.log(`      OrderType: ${item.OrderType}`);
      console.log(`      OrderStatus: ${item.OrderStatus}`);
      console.log(`      OrderDirection: ${item.OrderDirection}`);
      console.log(`      Fournisseur: ${item.CounterParty?.DisplayName || 'Inconnu'}`);
      console.log(`      Montant: ${item.TotalIncl || 0} ${item.Currency || 'EUR'}`);
      console.log(`      Date: ${item.OrderDate}`);
      console.log(`      Created: ${item.Created}`);
      console.log(`      LastModified: ${item.LastModified}`);
      console.log(`      Paid: ${item.Paid}`);
    });

  } catch (error: any) {
    console.error('❌ Erreur:', error.response?.data || error.message);
  }
}

testBillitAPI();
