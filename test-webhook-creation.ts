/**
 * Test de création de webhook avec les bons paramètres Billit
 */

import { config } from './src/config';
import axios from 'axios';

async function testWebhookCreation() {
  const axiosInstance = axios.create({
    baseURL: config.billit.apiUrl,
    headers: {
      'apikey': config.billit.apiKey,
      'partyID': config.billit.partyId || '',
      'Content-Type': 'application/json'
    }
  });

  console.log('🔍 Test de création de webhook Billit...\n');

  // Tester différents EntityTypes
  const entityTypes = [
    'PurchaseInvoice',
    'SalesInvoice',
    'Invoice',
    'Order',
    'PurchaseOrder',
    'Document',
    'Supplier',
    'Customer',
  ];

  // Pour chaque EntityType, tester plusieurs formats de payload
  for (const entityType of entityTypes) {
    console.log(`\n📝 Test EntityType: ${entityType}`);

    const payloads = [
      {
        name: 'Format WebhookUrl',
        payload: {
          EntityType: entityType,
          WebhookUrl: 'https://test.example.com/billit-webhook',
          Event: 'Created'
        }
      },
      {
        name: 'Format CallbackUrl',
        payload: {
          EntityType: entityType,
          CallbackUrl: 'https://test.example.com/billit-webhook',
          Event: 'Created'
        }
      },
      {
        name: 'Format Url',
        payload: {
          EntityType: entityType,
          Url: 'https://test.example.com/billit-webhook',
          Event: 'Created'
        }
      },
    ];

    for (const test of payloads) {
      console.log(`   → ${test.name}:`);
      try {
        const response = await axiosInstance.post('/v1/webhooks', test.payload, {
          validateStatus: () => true
        });

        if (response.status === 201 || response.status === 200) {
          console.log(`      ✅ SUCCÈS! Webhook créé`);
          console.log(`      📋`, JSON.stringify(response.data).substring(0, 200));
          // Arrêter là, on a trouvé le bon format
          return;
        } else if (response.status === 400) {
          const errors = response.data.errors;
          const hasWrongEntity = errors.some((e: any) => e.Code === 'WrongEntityTypeUsed');
          const hasEmptyUrl = errors.some((e: any) => e.Code === 'WebhookURLCannotBeEmpty');

          if (hasWrongEntity) {
            console.log(`      ✗ WrongEntityTypeUsed (mauvais type)`);
          } else if (hasEmptyUrl) {
            console.log(`      ✗ WebhookURLCannotBeEmpty (mauvais format URL)`);
          } else {
            console.log(`      ✗ ${errors.map((e: any) => e.Code).join(', ')}`);
          }
        } else {
          console.log(`      ✗ Status ${response.status}`);
        }

      } catch (error: any) {
        console.log(`      ✗ Erreur: ${error.message}`);
      }
    }
  }

  // Si on n'a pas réussi, essayer de voir les webhooks existants et leur structure
  console.log(`\n\n📋 Vérification des webhooks existants pour voir la structure:\n`);

  try {
    const response = await axiosInstance.get('/v1/webhooks');
    const webhooks = response.data;

    console.log(`Webhooks actuels:`, JSON.stringify(webhooks, null, 2));

    if (Array.isArray(webhooks) && webhooks.length > 0) {
      console.log(`\n📚 Structure d'un webhook existant:`);
      console.log(JSON.stringify(webhooks[0], null, 2));
    }

  } catch (error: any) {
    console.log(`Erreur:`, error.message);
  }
}

testWebhookCreation();
