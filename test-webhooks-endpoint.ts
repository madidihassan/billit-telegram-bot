/**
 * Test pour découvrir le système de webhooks Billit
 */

import { config } from './src/config';
import axios from 'axios';

async function testWebhooksEndpoint() {
  const axiosInstance = axios.create({
    baseURL: config.billit.apiUrl,
    headers: {
      'apikey': config.billit.apiKey,
      'partyID': config.billit.partyId || '',
      'Content-Type': 'application/json'
    }
  });

  console.log('🔍 Recherche du système de webhooks Billit...\n');

  // 1. Tester les endpoints webhook courants
  const webhookEndpoints = [
    { path: '/v1/webhooks', name: 'Webhooks' },
    { path: '/v1/webhooks/subscriptions', name: 'Webhook Subscriptions' },
    { path: '/v1/hooks', name: 'Hooks' },
    { path: '/v1/callbacks', name: 'Callbacks' },
    { path: '/v1/eventsubscriptions', name: 'Event Subscriptions' },
    { path: '/v1/notifications', name: 'Notifications' },
    { path: '/api/webhooks', name: 'API Webhooks' },
    { path: '/webhooks', name: 'Webhooks (root)' },
  ];

  console.log('1️⃣ Test des endpoints webhook:\n');

  let workingEndpoint: string | null = null;

  for (const endpoint of webhookEndpoints) {
    console.log(`   📍 ${endpoint.name} (${endpoint.path}):`);
    try {
      const response = await axiosInstance.get(endpoint.path);
      const data = response.data;
      const items = data.Items || data.items || data.value || data.webhooks || data;
      const count = Array.isArray(items) ? items.length : (data.count || data.total || 0);

      console.log(`      ✅ SUCCÈS! ${count} webhook(s) configuré(s)`);

      if (count > 0) {
        console.log(`      📋 Webhooks existants:`);
        const itemsArray = Array.isArray(items) ? items : [items];
        itemsArray.slice(0, 3).forEach((wh: any, idx: number) => {
          console.log(`         ${idx + 1}. ${wh.Url || wh.url || wh.CallbackUrl || 'N/A'} → ${wh.Event || wh.event || 'N/A'}`);
        });
      }

      workingEndpoint = endpoint.path;
      console.log(`      ⭐ Endpoint trouvé: ${endpoint.path}\n`);

    } catch (error: any) {
      const status = error.response?.status;
      if (status === 404) {
        console.log(`      ❌ 404 - Non trouvé\n`);
      } else if (status === 405) {
        console.log(`      ⚠️ 405 - Méthode non autorisée (existe mais GET pas permis)\n`);
        // Essayer POST
        workingEndpoint = endpoint.path;
      } else if (status === 401) {
        console.log(`      ❌ 401 - Non autorisé\n`);
      } else if (status === 400) {
        console.log(`      ⚠️ 400 - Existe mais mauvais paramètres\n`);
        workingEndpoint = endpoint.path;
      } else {
        console.log(`      ❌ Erreur ${status || ''}: ${error.message}\n`);
      }
    }
  }

  // 2. Si un endpoint est trouvé, essayer de créer un webhook
  if (workingEndpoint) {
    console.log(`\n2️⃣ Test de création de webhook sur ${workingEndpoint}:\n`);

    // URL publique pour le webhook (ngrok ou autre)
    // Pour l'instant, utilisons une URL fictive pour tester
    const webhookPayload = {
      url: 'https://votre-serveur.com/billit-webhook',
      event: 'DocumentCreated',
      // ou
      // Url: 'https://votre-serveur.com/billit-webhook',
      // Event: 'DocumentCreated',
      // EntityType: 'PurchaseInvoice'
    };

    console.log(`   📝 Payload de test:`);
    console.log(`      ${JSON.stringify(webhookPayload, null, 3)}\n`);

    try {
      const response = await axiosInstance.post(workingEndpoint, webhookPayload);
      console.log(`   ✅ Webhook créé avec succès!`);
      console.log(`   📋 Réponse:`, JSON.stringify(response.data, null, 2));

    } catch (error: any) {
      console.log(`   ❌ Erreur création webhook:`);
      if (error.response) {
        console.log(`      Status: ${error.response.status}`);
        console.log(`      Data:`, JSON.stringify(error.response.data, null, 2));
      } else {
        console.log(`      ${error.message}`);
      }
    }
  }

  // 3. Chercher dans la documentation API
  console.log(`\n\n3️⃣ Test de la documentation API:\n`);

  const docEndpoints = [
    '/api/docs',
    '/v1/api-docs',
    '/swagger',
    '/swagger.json',
    '/openapi.json',
    '/docs',
  ];

  for (const endpoint of docEndpoints) {
    console.log(`   📍 ${endpoint}:`);
    try {
      const response = await axiosInstance.get(endpoint);
      console.log(`      ✅ Documentation trouvée!`);

      // Chercher "webhook" dans la documentation
      const docStr = JSON.stringify(response.data);
      if (docStr.toLowerCase().includes('webhook')) {
        console.log(`      ⭐ Contient des infos sur les webhooks!\n`);
        break;
      }

    } catch (error: any) {
      console.log(`      ❌ Non disponible`);
    }
  }

  // 4. Tester l'endpoint settings/configuration
  console.log(`\n\n4️⃣ Test des endpoints de configuration:\n`);

  const configEndpoints = [
    '/v1/settings/webhooks',
    '/v1/configuration/webhooks',
    '/api/settings/webhooks',
  ];

  for (const endpoint of configEndpoints) {
    console.log(`   📍 ${endpoint}:`);
    try {
      const response = await axiosInstance.get(endpoint);
      console.log(`      ✅ Config webhooks trouvée!`);
      console.log(`      📋:`, JSON.stringify(response.data).substring(0, 200));

    } catch (error: any) {
      console.log(`      ❌ Non disponible`);
    }
  }

  console.log(`\n\n5️⃣ Test de l'endpoint /v1 avec recherche de "web":\n`);

  try {
    const response = await axiosInstance.get('/v1');
    const v1Content = JSON.stringify(response.data);
    console.log(`   📋 Contenu de /v1:`, v1Content.substring(0, 300));

    // Chercher des mots-clés
    const keywords = ['webhook', 'callback', 'event', 'notification', 'subscription'];
    keywords.forEach(keyword => {
      if (v1Content.toLowerCase().includes(keyword)) {
        console.log(`   ⭐ Contient le mot-clé: "${keyword}"`);
      }
    });

  } catch (error: any) {
    console.log(`   ❌ Erreur: ${error.message}`);
  }
}

testWebhooksEndpoint();
