/**
 * Script de test pour détecter les brouillons dans Billit
 */

import { BillitClient } from './src/billit-client';

async function testDraftsDetection() {
  const billitClient = new BillitClient();

  console.log('🔍 Test de détection des brouillons...\n');

  try {
    // 1. Récupérer les factures normales
    console.log('1️⃣ Récupération des factures normales (OrderType = Invoice)...');
    const normalInvoices = await billitClient.getInvoices({ limit: 100 });
    console.log(`   ✓ ${normalInvoices.length} facture(s) normale(s) trouvée(s)\n`);

    // 2. Récupérer tous les documents (y compris brouillons)
    console.log('2️⃣ Récupération de TOUS les documents (Invoice + Draft)...');
    const allDocuments = await billitClient.getAllDocuments({ limit: 100 });
    console.log(`   ✓ ${allDocuments.length} document(s) total(ux)\n`);

    // 3. Afficher les détails de tous les documents
    console.log('3️⃣ Détails des documents :\n');
    allDocuments.forEach((doc, index) => {
      const isDraft = !doc.invoice_number || doc.invoice_number.startsWith('BRO') || doc.invoice_number === '';
      const type = isDraft ? '📝 BROUILLON' : '✅ FACTURE';

      console.log(`${index + 1}. ${type}`);
      console.log(`   ID: ${doc.id}`);
      console.log(`   Fournisseur: ${doc.supplier_name}`);
      console.log(`   N° Facture: ${doc.invoice_number || 'PAS DE NUMÉRO'}`);
      console.log(`   Montant: ${doc.total_amount.toFixed(2)} ${doc.currency}`);
      console.log(`   Statut: ${doc.status}`);
      console.log(`   Date: ${doc.invoice_date}`);
      console.log(`   Créé le: ${doc.created_at}`);
      console.log('');
    });

    // 4. Chercher spécifiquement les brouillons
    console.log('4️⃣ Recherche spécifique des brouillons...\n');
    const drafts = allDocuments.filter(doc =>
      !doc.invoice_number ||
      doc.invoice_number.startsWith('BRO') ||
      doc.invoice_number === '' ||
      doc.status.toLowerCase().includes('draft') ||
      doc.status.toLowerCase().includes('brouillon')
    );

    if (drafts.length > 0) {
      console.log(`   🎯 ${drafts.length} brouillon(s) détecté(s) :`);
      drafts.forEach((draft, index) => {
        console.log(`      ${index + 1}. ID: ${draft.id} | Fournisseur: ${draft.supplier_name} | Montant: ${draft.total_amount.toFixed(2)} EUR`);
      });
    } else {
      console.log('   ⚠️ Aucun brouillon détecté avec les filtres actuels');
    }

    // 5. Comparaison
    console.log('\n5️⃣ Comparaison :\n');
    const difference = allDocuments.length - normalInvoices.length;
    if (difference > 0) {
      console.log(`   ✅ ${difference} document(s) supplémentaire(s) trouvé(s) en incluant les brouillons`);
    } else {
      console.log('   ℹ️ Aucune différence : les filtres retournent le même nombre de documents');
    }

  } catch (error: any) {
    console.error('❌ Erreur:', error.message);
    if (error.response) {
      console.error('Response:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

testDraftsDetection();
