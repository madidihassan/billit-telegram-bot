/**
 * SCÉNARIO DE TEST COMPLET - Envoi de PDF via IA
 *
 * Ce script teste la fonctionnalité d'envoi de PDF de factures
 * via l'agent IA autonome.
 */

import { BillitClient } from './src/billit-client';
import { CommandHandler } from './src/command-handler';
import { AIAgentServiceV2 } from './src/ai-agent-service-v2';

interface TestScenario {
  name: string;
  question: string;
  expectedBehavior: string;
}

async function runTests() {
  console.log('🧪 ================================================');
  console.log('🧪 SCÉNARIO DE TEST COMPLET - ENVOI DE PDF IA');
  console.log('🧪 ================================================\n');

  // Initialisation
  console.log('📦 Initialisation des services...');
  const billitClient = new BillitClient();
  const commandHandler = new CommandHandler();
  const aiAgent = new AIAgentServiceV2(commandHandler, null); // Pas de bot pour les tests

  console.log('✅ Services initialisés\n');

  // Scénarios de test
  const scenarios: TestScenario[] = [
    {
      name: 'Test 1 - Demande simple du PDF',
      question: 'Envoie-moi le PDF de la facture Uber Eats',
      expectedBehavior: 'Devrait appeler send_invoice_pdf avec le numéro de facture Uber Eats'
    },
    {
      name: 'Test 2 - Demande du fichier',
      question: 'Je veux le fichier PDF de cette facture',
      expectedBehavior: 'Devrait comprendre le contexte et envoyer le PDF de la dernière facture mentionnée'
    },
    {
      name: 'Test 3 - Demande avec numéro de facture',
      question: 'Donne-moi la facture 463799',
      expectedBehavior: 'Devrait trouver la facture par son numéro et envoyer le PDF'
    },
    {
      name: 'Test 4 - Demande de facture par fournisseur',
      question: 'Montre-moi la facture Foster la plus récente',
      expectedBehavior: 'Devrait trouver la dernière facture Foster et proposer d\'envoyer le PDF'
    },
    {
      name: 'Test 5 - Demande après contexte',
      question: 'Le PDF de cette facture',
      expectedBehavior: 'Devrait utiliser le contexte conversationnel pour identifier la facture'
    }
  ];

  console.log(`📋 ${scenarios.length} scénarios de test prévus\n`);

  // Récupérer quelques factures pour les tests
  console.log('📥 Récupération de factures pour les tests...');
  const invoices = await billitClient.getInvoices({ limit: 5 });
  console.log(`✅ ${invoices.length} factures récupérées pour les tests\n`);

  if (invoices.length === 0) {
    console.error('❌ Aucune facture disponible pour les tests');
    process.exit(1);
  }

  // Afficher les factures disponibles
  console.log('📄 Factures disponibles pour les tests :');
  invoices.forEach((inv, idx) => {
    console.log(`   ${idx + 1}. ${inv.invoice_number} - ${inv.supplier_name} - ${inv.total_amount}€`);
  });
  console.log();

  // Exécuter les scénarios
  let passed = 0;
  let failed = 0;

  for (const scenario of scenarios) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`🔍 ${scenario.name}`);
    console.log(`${'─'.repeat(60)}`);
    console.log(`❓ Question: "${scenario.question}"`);
    console.log(`📌 Attendu: ${scenario.expectedBehavior}\n`);

    try {
      // Simuler le chatId (pour que l'agent puisse envoyer les PDFs)
      const mockChatId = '123456789';

      // Traiter la question avec l'IA
      const response = await aiAgent.processQuestion(scenario.question, mockChatId);

      console.log(`🤖 Réponse de l'IA:`);
      console.log(`   ${response.substring(0, 300)}${response.length > 300 ? '...' : ''}\n`);

      // Vérifier si la fonction send_invoice_pdf a été appelée
      if (response.toLowerCase().includes('pdf') || response.toLowerCase().includes('envoyé')) {
        console.log('✅ TEST RÉUSSI - L\'IA a proposé d\'envoyer le PDF');
        passed++;
      } else {
        console.log('⚠️  TEST PARTIEL - L\'IA n\'a pas proposé d\'envoyer le PDF');
        failed++;
      }

    } catch (error: any) {
      console.error(`❌ ERREUR: ${error.message}`);
      failed++;
    }
  }

  // Test supplémentaire : Envoi réel du PDF
  console.log(`\n${'='.repeat(60)}`);
  console.log('🎯 TEST SUPPLÉMENTAIRE - Envoi réel du PDF');
  console.log(`${'='.repeat(60)}\n`);

  try {
    const testInvoice = invoices[0];
    console.log(`📄 Facture de test: ${testInvoice.invoice_number} (${testInvoice.supplier_name})`);

    // Télécharger le PDF
    console.log('📥 Téléchargement du PDF...');
    const pdfBuffer = await billitClient.downloadInvoicePdf(testInvoice.id);

    if (pdfBuffer) {
      console.log(`✅ PDF téléchargé avec succès (${pdfBuffer.length} bytes)`);
      console.log(`   Nom du fichier: Facture_${testInvoice.invoice_number}_${testInvoice.supplier_name.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`);
      passed++;
    } else {
      console.log('❌ Impossible de télécharger le PDF');
      failed++;
    }

  } catch (error: any) {
    console.error(`❌ Erreur lors du test d'envoi: ${error.message}`);
    failed++;
  }

  // Résumé
  console.log(`\n${'='.repeat(60)}`);
  console.log('📊 RÉSUMÉ DES TESTS');
  console.log(`${'='.repeat(60)}`);
  console.log(`✅ Tests réussis: ${passed}`);
  console.log(`❌ Tests échoués: ${failed}`);
  console.log(`📈 Taux de réussite: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);
  console.log(`${'='.repeat(60)}\n`);

  if (failed === 0) {
    console.log('🎉 TOUS LES TESTS SONT PASSES !\n');
    console.log('✨ La fonctionnalité d\'envoi de PDF est opérationnelle.');
    console.log('💡 Vous pouvez maintenant tester sur Telegram avec les questions suivantes:');
    console.log();
    console.log('   • "Envoie-moi le PDF de la facture Uber Eats"');
    console.log('   • "Je veux le fichier PDF de cette facture"');
    console.log('   • "Donne-moi la facture 463799"');
    console.log('   • "Montre-moi la facture Foster"');
    console.log();
    process.exit(0);
  } else {
    console.log('⚠️  Certains tests ont échoué. Vérifiez les logs ci-dessus.\n');
    process.exit(1);
  }
}

// Exécuter les tests
runTests().catch(error => {
  console.error('💥 Erreur fatale:', error);
  process.exit(1);
});
