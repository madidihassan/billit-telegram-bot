// Test du matching IA pour fournisseurs
require('dotenv').config();

const { aiMatchSupplier } = require('./dist/services/ai-helpers');
const { getAllSuppliers } = require('./dist/database');
const Groq = require('groq-sdk').default;
const OpenAI = require('openai').default;

async function testSupplierMatching() {
  console.log('🧪 Test du matching IA pour fournisseurs\n');

  // Configuration du provider IA
  const openRouterApiKey = process.env.OPENROUTER_API_KEY;
  const groqApiKey = process.env.GROQ_API_KEY;

  let provider;
  if (openRouterApiKey) {
    const openrouter = new OpenAI({
      apiKey: openRouterApiKey,
      baseURL: 'https://openrouter.ai/api/v1',
    });
    provider = {
      type: 'openrouter',
      client: openrouter
    };
    console.log('✅ Provider: OpenRouter (gpt-4o-mini)\n');
  } else if (groqApiKey) {
    const groq = new Groq({ apiKey: groqApiKey });
    provider = {
      type: 'groq',
      client: groq
    };
    console.log('✅ Provider: Groq (llama-3.3-70b)\n');
  } else {
    console.error('❌ Aucun provider IA configuré');
    process.exit(1);
  }

  // Récupérer tous les fournisseurs
  const suppliers = getAllSuppliers();
  const supplierNames = suppliers.map(s => s.name);
  console.log(`📋 ${supplierNames.length} fournisseurs dans la base de données\n`);

  // Cas de test
  const testCases = [
    { input: 'verisur', expected: 'VERISURE SA' },
    { input: 'VeriSUR', expected: 'VERISURE SA' },
    { input: 'kbc', expected: 'KBC Bank SA' },
    { input: 'KBC', expected: 'KBC Bank SA' },
    { input: 'coca cola', expected: 'COCA-COLA EUROPACIFIC PARTNERS BELGIUM SRL' },
    { input: 'foster', expected: 'FOSTER FAST FOOD SA' },
    { input: 'sligro', expected: 'Sligro-MFS Belgium SA' },
    { input: 'colruyt', expected: 'Colruyt' },
    { input: 'makro', expected: 'Makro' },
    { input: 'nonexistent', expected: null },
  ];

  console.log('📊 Tests de matching:\n');

  let successCount = 0;
  let failCount = 0;

  for (const test of testCases) {
    console.log(`🔍 Test: "${test.input}"`);

    try {
      const result = await aiMatchSupplier(test.input, supplierNames, provider);

      if (test.expected === null) {
        if (result === null) {
          console.log(`   ✅ PASS: Aucun match (comme attendu)\n`);
          successCount++;
        } else {
          console.log(`   ❌ FAIL: Match trouvé "${result}" alors que null était attendu\n`);
          failCount++;
        }
      } else {
        if (result === test.expected) {
          console.log(`   ✅ PASS: "${result}"\n`);
          successCount++;
        } else {
          console.log(`   ❌ FAIL: Attendu "${test.expected}", obtenu "${result}"\n`);
          failCount++;
        }
      }
    } catch (error) {
      console.log(`   ❌ ERROR: ${error.message}\n`);
      failCount++;
    }

    // Pause de 500ms entre les appels pour éviter le rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Résumé
  console.log('═══════════════════════════════════════');
  console.log(`📊 RÉSUMÉ: ${successCount} réussites, ${failCount} échecs`);
  console.log(`✅ Taux de réussite: ${((successCount / testCases.length) * 100).toFixed(1)}%`);
  console.log('═══════════════════════════════════════\n');

  if (failCount === 0) {
    console.log('🎉 Tous les tests ont réussi !');
  } else {
    console.log('⚠️  Certains tests ont échoué, vérifiez les résultats ci-dessus');
  }
}

testSupplierMatching().catch(error => {
  console.error('❌ Erreur:', error);
  process.exit(1);
});
