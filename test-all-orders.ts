/**
 * Test pour voir TOUS les ordres Billit sans filtre
 */

import { config } from './src/config';
import axios from 'axios';

async function testAllOrders() {
  console.log('🔍 Test de récupération de TOUS les ordres Billit (sans filtre)...\n');

  try {
    const response = await axios.get(`${config.billit.apiUrl}/v1/orders`, {
      headers: {
        'apikey': config.billit.apiKey,
        'partyID': config.billit.partyId || '',
        'Content-Type': 'application/json'
      },
      params: {
        $top: 100
      }
    });

    const allOrders = response.data.Items || response.data.items || response.data || [];

    console.log(`📊 Total des ordres récupérés: ${allOrders.length}\n`);

    // Grouper par OrderType
    const byType: Record<string, any[]> = {};
    allOrders.forEach((order: any) => {
      const type = order.OrderType || 'UNKNOWN';
      if (!byType[type]) {
        byType[type] = [];
      }
      byType[type].push(order);
    });

    console.log('📋 Répartition par OrderType:\n');
    Object.keys(byType).forEach(type => {
      console.log(`   ${type}: ${byType[type].length} document(s)`);
    });

    console.log('\n🔍 Détails des documents qui ne sont PAS des "Invoice":\n');

    const nonInvoices = allOrders.filter((order: any) => order.OrderType !== 'Invoice');

    if (nonInvoices.length === 0) {
      console.log('   ℹ️ Tous les documents sont de type "Invoice"');
    } else {
      nonInvoices.forEach((order: any, index: number) => {
        console.log(`${index + 1}. Type: ${order.OrderType}`);
        console.log(`   ID: ${order.OrderId}`);
        console.log(`   Numéro: ${order.OrderNumber || 'PAS DE NUMÉRO'}`);
        console.log(`   Direction: ${order.OrderDirection}`);
        console.log(`   Statut: ${order.Status}`);
        console.log(`   Fournisseur: ${order.CounterParty?.Name || 'N/A'}`);
        console.log(`   Montant: ${order.TotalAmount || 'N/A'}`);
        console.log(`   Créé le: ${order.CreationTime}`);
        console.log('');
      });
    }

    // Chercher spécifiquement les documents récents (dernières 24h)
    console.log('\n📅 Documents créés dans les dernières 24 heures:\n');
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const recentDocs = allOrders.filter((order: any) => {
      const creationTime = new Date(order.CreationTime);
      return creationTime > yesterday;
    });

    console.log(`   ${recentDocs.length} document(s) récent(s) trouvé(s)\n`);

    recentDocs.forEach((order: any, index: number) => {
      console.log(`${index + 1}. ${order.OrderType} - ${order.OrderNumber || 'SANS NUMÉRO'}`);
      console.log(`   Fournisseur: ${order.CounterParty?.Name || 'N/A'}`);
      console.log(`   Montant: ${order.TotalAmount || 'N/A'} ${order.Currency || ''}`);
      console.log(`   Statut: ${order.Status}`);
      console.log(`   Créé le: ${order.CreationTime}`);
      console.log('');
    });

  } catch (error: any) {
    console.error('❌ Erreur:', error.message);
    if (error.response) {
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

testAllOrders();
