/**
 * Script de test pour vérifier la configuration Billit et Telegram
 */

import { config, validateConfig } from './config';
import { BillitClient } from './billit-client';
import { TelegramClient } from './telegram-client';

async function testConnection() {
  console.log('🧪 Test de connexion Billit & Telegram\n');
  console.log('─'.repeat(50));

  // Test 1: Validation de la configuration
  console.log('\n1️⃣  Validation de la configuration...');
  try {
    validateConfig();
    console.log('   ✅ Configuration valide');
  } catch (error: any) {
    console.log('   ❌ Configuration invalide:', error.message);
    return;
  }

  // Test 2: Connexion Telegram
  console.log('\n2️⃣  Test de connexion Telegram...');
  try {
    const telegramClient = new TelegramClient();
    await telegramClient.sendTestMessage();
    console.log('   ✅ Connexion Telegram réussie');
    console.log(`   📱 Chat ID: ${config.telegram.chatId}`);
  } catch (error: any) {
    console.log('   ❌ Erreur Telegram:', error.message);
    console.log('\n   💡 Assurez-vous que:');
    console.log('      - Le TELEGRAM_BOT_TOKEN est correct');
    console.log('      - Le TELEGRAM_CHAT_ID est correct');
    console.log('      - Vous avez envoyé au moins un message au bot');
    return;
  }

  // Test 3: Connexion Billit
  console.log('\n3️⃣  Test de connexion Billit...');
  try {
    const billitClient = new BillitClient();
    const invoices = await billitClient.getInvoices({ limit: 5 });
    console.log('   ✅ Connexion Billit réussie');
    console.log(`   📄 ${invoices.length} facture(s) récente(s) trouvée(s)`);

    if (invoices.length > 0) {
      console.log('\n   Dernière facture:');
      const last = invoices[0];
      console.log(`      - Fournisseur: ${last.supplier_name}`);
      console.log(`      - Numéro: ${last.invoice_number}`);
      console.log(`      - Montant: ${last.total_amount} ${last.currency}`);
      console.log(`      - Date: ${new Date(last.invoice_date).toLocaleDateString('fr-BE')}`);
    }
  } catch (error: any) {
    console.log('   ❌ Erreur Billit:', error.message);
    console.log('\n   💡 Assurez-vous que:');
    console.log('      - Le BILLIT_API_KEY est correct');
    console.log('      - L\'API Key est bien activée sur my.billit.eu');
    console.log('      - L\'URL de l\'API est correcte');
    console.log('      - Si nécessaire, ajoutez le BILLIT_PARTY_ID');
    return;
  }

  // Résumé
  console.log('\n' + '─'.repeat(50));
  console.log('\n🎉 Tous les tests ont réussi !');
  console.log('\nVous pouvez maintenant lancer l\'application avec:');
  console.log('   npm run dev    (mode développement)');
  console.log('   npm start      (mode production)');
  console.log('\n' + '─'.repeat(50) + '\n');
}

// Exécuter le test
testConnection().catch(error => {
  console.error('\n❌ Erreur fatale:', error);
  process.exit(1);
});
