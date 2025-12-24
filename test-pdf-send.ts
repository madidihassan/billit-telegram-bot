/**
 * Test de l'envoi de PDF pour la dernière facture
 */

import { BillitClient } from './src/billit-client';
import TelegramBot from 'node-telegram-bot-api';
import { config } from './src/config';

async function testPdfSend() {
  try {
    console.log('🧪 Test d\'envoi de PDF de facture...\n');

    // Initialiser les clients
    const billitClient = new BillitClient();
    const bot = new TelegramBot(config.telegram.botToken);

    // Récupérer la dernière facture
    console.log('📥 Récupération de la dernière facture...');
    const invoices = await billitClient.getInvoices({ limit: 1 });

    if (invoices.length === 0) {
      console.log('❌ Aucune facture trouvée');
      process.exit(1);
    }

    const invoice = invoices[0];
    console.log(`\n✅ Dernière facture trouvée:`);
    console.log(`   Fournisseur: ${invoice.supplier_name}`);
    console.log(`   N° Facture: ${invoice.invoice_number}`);
    console.log(`   Montant: ${invoice.total_amount} ${invoice.currency}`);
    console.log(`   Date: ${new Date(invoice.invoice_date).toLocaleDateString('fr-FR')}`);
    console.log(`   Statut: ${invoice.status}`);
    console.log(`   ID: ${invoice.id}\n`);

    // Préparer le message
    const isPaid = invoice.status.toLowerCase() === 'paid' || invoice.status.toLowerCase() === 'payé';
    const statusIcon = isPaid ? '✅' : '⏳';
    const statusText = isPaid ? 'PAYÉE' : 'IMPAYÉE';

    const message = `
${statusIcon} <b>Test - Facture ${statusText}</b>

🏢 <b>Fournisseur:</b> ${invoice.supplier_name}
📄 <b>N° Facture:</b> ${invoice.invoice_number}
💰 <b>Montant:</b> ${invoice.total_amount.toFixed(2)} ${invoice.currency}
📅 <b>Date:</b> ${new Date(invoice.invoice_date).toLocaleDateString('fr-FR')}

🧪 <b>TEST D'ENVOI DE FICHIER PDF</b>
    `.trim();

    // Télécharger le PDF
    console.log('📥 Téléchargement du PDF via l\'API Billit...');
    const pdfBuffer = await billitClient.downloadInvoicePdf(invoice.id);

    if (!pdfBuffer) {
      console.log('❌ Impossible de télécharger le PDF');
      console.log('📤 Envoi du message avec lien à la place...');

      const messageWithLink = message + `\n\n📥 <a href="https://my.billit.eu/invoices/${invoice.id}">Télécharger le PDF</a>`;

      // Envoyer à tous les chats autorisés
      for (const chatId of config.telegram.allowedChatIds) {
        await bot.sendMessage(chatId, messageWithLink, {
          parse_mode: 'HTML',
          disable_web_page_preview: false,
        });
      }

      console.log('✅ Message avec lien envoyé');
      process.exit(0);
    }

    console.log(`✅ PDF téléchargé (${pdfBuffer.length} bytes)\n`);

    // Envoyer le PDF
    const filename = `Facture_${invoice.invoice_number}_${invoice.supplier_name.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
    console.log(`📤 Envoi du fichier PDF: ${filename}`);

    // Envoyer à tous les chats autorisés
    for (const chatId of config.telegram.allowedChatIds) {
      await bot.sendDocument(chatId, pdfBuffer, {
        caption: message,
        parse_mode: 'HTML',
      }, {
        filename: filename,
        contentType: 'application/pdf',
      });
      console.log(`   ✅ Fichier PDF envoyé au chat ${chatId}`);
    }

    console.log('\n✅ Test réussi ! Le fichier PDF a été envoyé sur Telegram.');
    process.exit(0);

  } catch (error: any) {
    console.error('❌ Erreur lors du test:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// Exécuter le test
testPdfSend();
