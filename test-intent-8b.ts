/**
 * Test du nouveau modèle Llama 3.1 8B Instant
 */

import { IntentService } from './src/intent-service';

const intentService = new IntentService();

// Liste de phrases de test
const testPhrases = [
  "Facture impayée",
  "Liste des fournisseurs",
  "Donne-moi la liste des fournisseurs",
  "Impayé",
  "Fournisseurs",
  "Payé",
  "En retard",
  "Recettes du mois",
  "Liste les factures de Foster",
  "Transactions Foster"
];

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🧪 TEST - Llama 3.1 8B Instant');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

async function runTests() {
  for (const phrase of testPhrases) {
    console.log(`\n📝 Phrase: "${phrase}"`);

    try {
      const intent = await intentService.analyzeIntent(phrase);

      const confidenceEmoji = intent.confidence >= 0.9 ? '✅' : intent.confidence >= 0.7 ? '⚠️' : '❌';

      console.log(`${confidenceEmoji} Commande: ${intent.command}`);
      if (intent.args.length > 0) {
        console.log(`   Args: [${intent.args.join(', ')}]`);
      }
      console.log(`   Confiance: ${(intent.confidence * 100).toFixed(0)}%`);

    } catch (error: any) {
      console.log(`❌ Erreur: ${error.message}`);
    }

    // Pause pour éviter le rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ Tests terminés');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

runTests().catch(console.error);
