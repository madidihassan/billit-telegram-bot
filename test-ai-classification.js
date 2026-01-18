// Test de la classification IA
const { AIAgentServiceV2 } = require('./dist/ai-agent-service-v2');
const { BillitClient } = require('./dist/billit-client');
const { BankClient } = require('./dist/bank-client');

async function testClassification() {
  console.log('🧪 Test de la classification IA des questions\n');

  const billitClient = new BillitClient();
  const bankClient = new BankClient(billitClient);
  const aiAgent = new AIAgentServiceV2(billitClient, bankClient, null);

  // Questions de test
  const testQuestions = [
    "Quel est le montant total payé à KBC ?",
    "Combien j'ai payé à Foster ?",
    "Liste des factures impayées",
    "Salaires de décembre",
    "Top 10 des employés",
    "Analyse des dépenses chez Sligro",
    "Prévision des dépenses du mois prochain",
    "Résumé annuel 2025",
    "Dernières transactions bancaires",
  ];

  console.log('📋 Questions à tester:\n');

  for (const question of testQuestions) {
    console.log(`❓ "${question}"`);

    try {
      // Appeler directement la méthode de classification (on doit la rendre accessible)
      // Pour l'instant, on va tester via processQuestion qui utilise la classification
      const startTime = Date.now();

      // Simuler l'appel (ne pas vraiment exécuter pour éviter les coûts)
      console.log('   ⏳ Classification en cours...');

      // Note: Vous pouvez tester en appelant réellement processQuestion ici
      // const result = await aiAgent.processQuestion(question, '7887749968');

      const elapsed = Date.now() - startTime;
      console.log(`   ✅ Temps: ${elapsed}ms\n`);

    } catch (error) {
      console.log(`   ❌ Erreur: ${error.message}\n`);
    }
  }

  console.log('\n💡 Pour tester réellement, décommentez l\'appel à processQuestion dans le script');
  console.log('⚠️  Attention: chaque classification coûte ~0.001$ en appels IA\n');
}

testClassification().catch(error => {
  console.error('❌ Erreur:', error);
  process.exit(1);
});
