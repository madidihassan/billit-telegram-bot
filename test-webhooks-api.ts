/**
 * Exploration détaillée de l'API webhooks Billit
 */

import { config } from './src/config';
import axios from 'axios';

async function exploreWebhooksAPI() {
  const axiosInstance = axios.create({
    baseURL: config.billit.apiUrl,
    headers: {
      'apikey': config.billit.apiKey,
      'partyID': config.billit.partyId || '',
      'Content-Type': 'application/json'
    }
  });

  console.log('🔍 Exploration de l\'API Webhooks Billit...\n');

  // 1. Explorer la structure de /v1/webhooks
  console.log('1️⃣ Structure de l\'endpoint /v1/webhooks:\n');

  try {
    const response = await axiosInstance.get('/v1/webhooks');
    console.log('   ✅ GET /v1/webhooks:');
    console.log('   📋 Réponse complète:', JSON.stringify(response.data, null, 2));

  } catch (error: any) {
    console.log(`   ❌ Erreur: ${error.message}`);
  }

  // 2. Tester différentes méthodes HTTP sur /v1/webhooks
  console.log('\n\n2️⃣ Test des méthodes HTTP sur /v1/webhooks:\n');

  const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

  for (const method of methods) {
    console.log(`   📡 ${method} /v1/webhooks:`);
    try {
      const response = await axiosInstance({
        method: method as any,
        url: '/v1/webhooks',
        data: method === 'POST' || method === 'PUT' || method === 'PATCH' ? {
          Url: 'https://test.com/webhook',
          Event: 'DocumentCreated'
        } : undefined,
        validateStatus: () => true // Accepter tous les status codes
      });

      const status = response.status;
      if (status === 200 || status === 201) {
        console.log(`      ✅ Succès (${status})`);
        console.log(`      📋:`, JSON.stringify(response.data).substring(0, 150));
      } else if (status === 405) {
        console.log(`      ⚠️ 405 - Méthode non supportée`);
      } else if (status === 404) {
        console.log(`      ❌ 404 - Non trouvé`);
      } else {
        console.log(`      ℹ️ Status ${status}:`, JSON.stringify(response.data).substring(0, 100));
      }

    } catch (error: any) {
      console.log(`      ❌ Erreur: ${error.message}`);
    }
  }

  // 3. Tester avec des sous-chemins
  console.log('\n\n3️⃣ Test des sous-chemins de /v1/webhooks:\n');

  const subPaths = [
    '/v1/webhooks/subscriptions',
    '/v1/webhooks/create',
    '/v1/webhooks/register',
    '/v1/webhooks/configure',
    '/v1/webhooks/list',
  ];

  for (const path of subPaths) {
    console.log(`   📍 GET ${path}:`);
    try {
      const response = await axiosInstance.get(path, { validateStatus: () => true });
      const status = response.status;
      if (status === 200) {
        console.log(`      ✅ Succès`);
        console.log(`      📋:`, JSON.stringify(response.data).substring(0, 150));
      } else if (status === 405) {
        console.log(`      ⚠️ 405 - Existe mais méthode différente`);
      } else {
        console.log(`      ℹ️ Status ${status}`);
      }

    } catch (error: any) {
      console.log(`      ❌ Erreur: ${error.response?.status || error.message}`);
    }
  }

  // 4. Explorer la documentation Swagger
  console.log('\n\n4️⃣ Exploration de la documentation Swagger:\n');

  try {
    const swaggerResponse = await axiosInstance.get('/swagger');
    const swagger = swaggerResponse.data;

    console.log('   ✅ Documentation Swagger chargée');
    console.log('   📋 Clés principales:', Object.keys(swagger).join(', '));

    // Chercher les définitions de webhooks
    const swaggerStr = JSON.stringify(swagger);
    if (swaggerStr.toLowerCase().includes('webhook')) {
      console.log('\n   ⭐ Contient des informations sur les webhooks!');

      // Extraire les chemins (paths) liés aux webhooks
      if (swagger.paths) {
        console.log('\n   📁 Chemins (paths) disponibles:');
        Object.keys(swagger.paths).forEach(path => {
          if (path.toLowerCase().includes('webhook') ||
              path.toLowerCase().includes('callback') ||
              path.toLowerCase().includes('subscription')) {
            console.log(`      ${path}`);
            const methods = Object.keys(swagger.paths[path]);
            console.log(`         Méthodes: ${methods.join(', ')}`);
          }
        });
      }

      // Extraire les définitions (schemas) liées aux webhooks
      if (swagger.definitions) {
        console.log('\n   📚 Définitions (schemas) liées aux webhooks:');
        Object.keys(swagger.definitions).forEach(defName => {
          if (defName.toLowerCase().includes('webhook') ||
              defName.toLowerCase().includes('callback') ||
              defName.toLowerCase().includes('subscription')) {
            console.log(`      ${defName}`);
          }
        });
      }
    }

  } catch (error: any) {
    console.log(`   ❌ Erreur chargement Swagger: ${error.message}`);
  }

  // 5. Tester la création avec différents formats
  console.log('\n\n5️⃣ Test de création de webhook avec différents formats:\n');

  const testPayloads = [
    {
      name: 'Format 1 (Url/Event)',
      payload: {
        Url: 'https://test.example.com/billit-webhook',
        Event: 'DocumentCreated'
      }
    },
    {
      name: 'Format 2 (url/event)',
      payload: {
        url: 'https://test.example.com/billit-webhook',
        event: 'DocumentCreated'
      }
    },
    {
      name: 'Format 3 (CallbackUrl/EventType)',
      payload: {
        CallbackUrl: 'https://test.example.com/billit-webhook',
        EventType: 'DocumentCreated'
      }
    },
    {
      name: 'Format 4 (avec EntityType)',
      payload: {
        Url: 'https://test.example.com/billit-webhook',
        Event: 'DocumentCreated',
        EntityType: 'PurchaseInvoice'
      }
    },
  ];

  for (const test of testPayloads) {
    console.log(`   📝 ${test.name}:`);
    try {
      const response = await axiosInstance.post('/v1/webhooks', test.payload, {
        validateStatus: () => true
      });

      if (response.status === 201 || response.status === 200) {
        console.log(`      ✅ Créé avec succès!`);
        console.log(`      📋:`, JSON.stringify(response.data).substring(0, 200));
      } else {
        console.log(`      ℹ️ Status ${response.status}`);
        console.log(`      Message:`, JSON.stringify(response.data).substring(0, 150));
      }

    } catch (error: any) {
      console.log(`      ❌ Erreur: ${error.response?.data?.Message || error.message}`);
    }
  }
}

exploreWebhooksAPI();
