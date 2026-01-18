// Test du parsing IA pour périodes
require('dotenv').config();

const { aiParsePeriod } = require('./dist/services/ai-helpers');
const Groq = require('groq-sdk').default;
const OpenAI = require('openai').default;

async function testPeriodParsing() {
  console.log('🧪 Test du parsing IA pour périodes\n');

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

  // Date actuelle pour contexte
  const now = new Date();
  console.log(`📅 Date actuelle: ${now.toISOString().split('T')[0]}\n`);

  // Cas de test
  const testCases = [
    {
      input: 'année 2025',
      expectedStart: '2025-01-01',
      expectedEnd: '2025-12-31',
      description: 'Année 2025 complète (NE DOIT PAS inclure 2026-01-XX)'
    },
    {
      input: 'janvier',
      expectedStart: '2026-01-01',
      expectedEnd: '2026-01-31',
      description: 'Janvier (mois actuel)'
    },
    {
      input: 'décembre',
      expectedStart: '2025-12-01',
      expectedEnd: '2025-12-31',
      description: 'Décembre (mois précédent car on est en janvier 2026)'
    },
    {
      input: 'cette année',
      expectedStart: '2026-01-01',
      expectedEnd: '2026-12-31',
      description: 'Année en cours (2026)'
    },
    {
      input: 'année 2024',
      expectedStart: '2024-01-01',
      expectedEnd: '2024-12-31',
      description: 'Année 2024 complète'
    },
    {
      input: 'novembre 2025',
      expectedStart: '2025-11-01',
      expectedEnd: '2025-11-30',
      description: 'Novembre 2025'
    },
  ];

  console.log('📊 Tests de parsing:\n');

  let successCount = 0;
  let failCount = 0;

  for (const test of testCases) {
    console.log(`🔍 Test: "${test.input}"`);
    console.log(`   📝 ${test.description}`);

    try {
      const result = await aiParsePeriod(test.input, provider);

      if (!result) {
        console.log(`   ❌ FAIL: Aucun résultat retourné\n`);
        failCount++;
        continue;
      }

      const actualStart = result.start.toISOString().split('T')[0];
      const actualEnd = result.end.toISOString().split('T')[0];

      // Vérifier que les dates correspondent
      const startMatch = actualStart === test.expectedStart;
      const endMatch = actualEnd === test.expectedEnd;

      if (startMatch && endMatch) {
        console.log(`   ✅ PASS: ${actualStart} à ${actualEnd}`);
        console.log(`   📌 Description: "${result.description}"\n`);
        successCount++;
      } else {
        console.log(`   ❌ FAIL:`);
        console.log(`      Attendu: ${test.expectedStart} à ${test.expectedEnd}`);
        console.log(`      Obtenu:  ${actualStart} à ${actualEnd}`);
        console.log(`      Description: "${result.description}"\n`);
        failCount++;
      }

      // Vérification critique pour "année 2025"
      if (test.input === 'année 2025' && actualEnd !== '2025-12-31') {
        console.log(`   ⚠️  CRITIQUE: "année 2025" ne doit PAS inclure 2026 !`);
        console.log(`      La fin devrait être 2025-12-31, mais c'est ${actualEnd}\n`);
      }

    } catch (error) {
      console.log(`   ❌ ERROR: ${error.message}\n`);
      failCount++;
    }

    // Pause de 500ms entre les appels
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Résumé
  console.log('═══════════════════════════════════════');
  console.log(`📊 RÉSUMÉ: ${successCount} réussites, ${failCount} échecs`);
  console.log(`✅ Taux de réussite: ${((successCount / testCases.length) * 100).toFixed(1)}%`);
  console.log('═══════════════════════════════════════\n');

  if (failCount === 0) {
    console.log('🎉 Tous les tests ont réussi !');
    console.log('✅ Le problème "année 2025 inclut janvier 2026" est RÉSOLU !');
  } else {
    console.log('⚠️  Certains tests ont échoué, vérifiez les résultats ci-dessus');
  }
}

testPeriodParsing().catch(error => {
  console.error('❌ Erreur:', error);
  process.exit(1);
});
