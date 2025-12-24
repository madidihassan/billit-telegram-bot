import { config } from './src/config';

async function testDirectPdf() {
  const orderId = '85653045';

  // Test avec différents endpoints et headers
  const tests = [
    {
      name: 'GET /v1/orders/{id} avec Accept: application/pdf',
      url: `https://my.billit.eu/api/v1/orders/${orderId}`,
      headers: {
        'apikey': config.billit.apiKey,
        'partyID': config.billit.partyId || '',
        'Accept': 'application/pdf',
      }
    },
    {
      name: 'GET /v1/orders/{id}/pdf',
      url: `https://my.billit.eu/api/v1/orders/${orderId}/pdf`,
      headers: {
        'apikey': config.billit.apiKey,
        'partyID': config.billit.partyId || '',
        'Accept': 'application/pdf',
      }
    },
    {
      name: 'GET /v1/orders/{id}/document',
      url: `https://my.billit.eu/api/v1/orders/${orderId}/document`,
      headers: {
        'apikey': config.billit.apiKey,
        'partyID': config.billit.partyId || '',
        'Accept': 'application/pdf',
      }
    },
    {
      name: 'GET /api/orders/{id}/pdf (sans v1)',
      url: `https://my.billit.eu/api/orders/${orderId}/pdf`,
      headers: {
        'apikey': config.billit.apiKey,
        'partyID': config.billit.partyId || '',
        'Accept': 'application/pdf',
      }
    },
  ];

  for (const test of tests) {
    console.log(`\n🔍 ${test.name}`);
    console.log(`   URL: ${test.url}`);

    try {
      const response = await fetch(test.url, { headers: test.headers });
      console.log(`   Status: ${response.status} ${response.statusText}`);
      console.log(`   Content-Type: ${response.headers.get('content-type')}`);

      if (response.ok) {
        const contentType = response.headers.get('content-type');
        if (contentType?.includes('pdf')) {
          const buffer = Buffer.from(await response.arrayBuffer());
          console.log(`   ✅✅✅ PDF TROUVÉ ! Taille: ${buffer.length} bytes`);
          console.log(`\n🎯 ENDPOINT CORRECT: ${test.url}`);
          process.exit(0);
        } else {
          const text = await response.text();
          console.log(`   ⚠️  Réponse reçue mais pas un PDF:`, text.substring(0, 200));
        }
      }
    } catch (error: any) {
      console.log(`   ❌ Erreur: ${error.message}`);
    }
  }

  console.log('\n❌ Aucun endpoint ne fonctionne pour télécharger le PDF');
  process.exit(1);
}

testDirectPdf();
