import { AIConversationService } from './src/ai-conversation-service';
import { BillitClient } from './src/billit-client';
import { CommandHandler } from './src/command-handler';
import { TelegramClient } from './src/telegram-client';
import { config } from './src/config';

/**
 * Script de test du système IA conversationnel
 *
 * Usage :
 * npm run test:ai
 *
 * Ou compiler et exécuter :
 * npx ts-node test-ai-conversation.ts
 */

async function testAIConversation() {
  console.log('🧪 Test du système IA Conversationnel\n');

  // Initialisation des services
  const billitClient = new BillitClient();
  const telegramClient = new TelegramClient();
  const commandHandler = new CommandHandler(billitClient, telegramClient);
  const aiService = new AIConversationService(commandHandler);

  // Vérifier la configuration
  if (!aiService.isConfigured()) {
    console.error('❌ Le service IA n\'est pas configuré.');
    console.error('Veuillez ajouter GROQ_API_KEY dans votre fichier .env');
    process.exit(1);
  }

  console.log('✅ Service IA configuré\n');

  // Questions de test
  const testQuestions = [
    'Combien ai-je de factures impayées ?',
    'Quelles sont mes recettes ce mois-ci ?',
    'Compare mes recettes et dépenses',
    'Liste tous mes fournisseurs',
  ];

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📝 Tests de questions IA');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Tester chaque question
  for (let i = 0; i < testQuestions.length; i++) {
    const question = testQuestions[i];
    console.log(`\n${'='.repeat(50)}`);
    console.log(`❓ Question ${i + 1}: ${question}`);
    console.log('='.repeat(50));

    try {
      const response = await aiService.processQuestion(question);
      console.log('\n🤖 Réponse IA :');
      console.log(response);
    } catch (error: any) {
      console.error(`\n❌ Erreur: ${error.message}`);
    }

    // Pause entre les questions
    if (i < testQuestions.length - 1) {
      console.log('\n⏳ Pause avant la prochaine question...\n');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  console.log('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ Tests terminés');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('💡 Pour tester avec votre propre question :');
  console.log('   Modifiez le tableau testQuestions dans ce fichier\n');
}

// Exécuter les tests
testAIConversation().catch(error => {
  console.error('❌ Erreur fatale:', error);
  process.exit(1);
});
