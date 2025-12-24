/**
 * Test pour trouver l'endpoint des fichiers uploadés (Saisie rapide)
 */

import { config } from './src/config';
import axios from 'axios';

async function testQuickEntryEndpoint() {
  const axiosInstance = axios.create({
    baseURL: config.billit.apiUrl,
    headers: {
      'apikey': config.billit.apiKey,
      'partyID': config.billit.partyId || '',
      'Content-Type': 'application/json'
    }
  });

  console.log('🔍 Test des endpoints pour le Saisie rapide...\n');

  // Liste des endpoints possibles à tester
  const endpoints = [
    { path: '/v1/documents', name: 'Documents' },
    { path: '/v1/imports', name: 'Imports' },
    { path: '/v1/uploads', name: 'Uploads' },
    { path: '/v1/files', name: 'Files' },
    { path: '/v1/inbox', name: 'Inbox' },
    { path: '/v1/pending', name: 'Pending' },
    { path: '/api/documents', name: 'API Documents' },
    { path: '/api/imports', name: 'API Imports' },
  ];

  for (const endpoint of endpoints) {
    console.log(`\n📍 Test: ${endpoint.name} (${endpoint.path})`);
    try {
      const response = await axiosInstance.get(endpoint.path, {
        params: { $top: 10 }
      });

      const data = response.data;
      const items = data.Items || data.items || data.results || data;
      const count = Array.isArray(items) ? items.length : (data.count || 0);

      console.log(`   ✅ Succès! ${count} élément(s) trouvé(s)`);

      if (count > 0) {
        console.log(`   📋 Premier élément:`);
        const firstItem = Array.isArray(items) ? items[0] : items;
        console.log(`      ${JSON.stringify(firstItem, null, 2).substring(0, 300)}...`);
      }

    } catch (error: any) {
      if (error.response) {
        const status = error.response.status;
        if (status === 404) {
          console.log(`   ❌ 404 - Endpoint non trouvé`);
        } else if (status === 401) {
          console.log(`   ❌ 401 - Non autorisé`);
        } else if (status === 400) {
          console.log(`   ❌ 400 - Mauvaise requête`);
        } else {
          console.log(`   ❌ Erreur ${status}: ${error.response.data?.errors?.[0]?.Code || 'Unknown'}`);
        }
      } else {
        console.log(`   ❌ Erreur: ${error.message}`);
      }
    }
  }

  // Tester aussi avec l'endpoint documents/incoming
  console.log('\n\n📍 Test: Documents incoming (spécifique Billit)');
  try {
    const response = await axiosInstance.get('/v1/documents/incoming', {
      params: { $top: 10 }
    });

    const data = response.data;
    const items = data.Items || data.items || data.results || data;
    const count = Array.isArray(items) ? items.length : (data.count || 0);

    console.log(`   ✅ Succès! ${count} élément(s) trouvé(s)`);

    if (count > 0) {
      console.log(`\n   📋 Fichiers en attente de traitement:\n`);
      const itemsArray = Array.isArray(items) ? items : [];
      itemsArray.forEach((item: any, index: number) => {
        console.log(`   ${index + 1}. ${item.FileName || item.Name || item.ID || 'Unknown'}`);
        console.log(`      Date: ${item.CreationTime || item.UploadDate || 'N/A'}`);
        console.log(`      Status: ${item.Status || item.State || 'N/A'}`);
        console.log('');
      });
    }

  } catch (error: any) {
    console.log(`   ❌ Erreur: ${error.message}`);
  }
}

testQuickEntryEndpoint();
