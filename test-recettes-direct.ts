import { BankClient } from './src/bank-client';
import { CommandHandler } from './src/command-handler';
import { BillitClient } from './src/billit-client';
import { TelegramClient } from './src/telegram-client';

async function testRecettes() {
  console.log('🧪 Test direct des recettes du mois...\n');

  try {
    const billitClient = new BillitClient();
    const telegramClient = new TelegramClient();
    const commandHandler = new CommandHandler(billitClient, telegramClient);

    // Tester la commande recettes_mois
    console.log('📋 Exécution de la commande recettes_mois...\n');
    const result = await commandHandler.handleCommand('recettes_mois', []);

    console.log('\n✅ RÉSULTAT:\n');
    console.log(result);

  } catch (error: any) {
    console.error('\n❌ ERREUR:');
    console.error('Message:', error.message);
    console.error('Stack:', error.stack);

    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

testRecettes();
