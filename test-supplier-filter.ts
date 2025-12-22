/**
 * Script de test pour valider le filtrage par fournisseur dans les transactions
 */

import { BankClient } from './src/bank-client';

async function testSupplierFilter() {
  console.log('🧪 TEST DE FILTRAGE PAR FOURNISSEUR\n');
  console.log('='.repeat(60));

  const bankClient = new BankClient();

  // Test: Transactions Foster en novembre 2025
  console.log('\n\n📅 TEST: Transactions Foster en novembre 2025');
  console.log('-'.repeat(60));
  
  const novembreStart = new Date('2025-11-01');
  const novembreEnd = new Date('2025-11-30T23:59:59');

  try {
    // Récupérer toutes les transactions de novembre
    const allTransactions = await bankClient.getTransactionsByPeriod(novembreStart, novembreEnd);
    console.log(`✓ ${allTransactions.length} transactions totales en novembre`);

    // Filtrer par "Foster" (normalisation)
    const normalizeSearchTerm = (text: string): string => {
      return text
        .toLowerCase()
        .replace(/[\s\-_\.\/\\]/g, '')
        .trim();
    };

    const fosterFilter = normalizeSearchTerm('Foster');
    const fosterTransactions = allTransactions.filter(tx => {
      const normalizedDesc = normalizeSearchTerm(tx.description);
      return normalizedDesc.includes(fosterFilter);
    });

    console.log(`✓ ${fosterTransactions.length} transactions trouvées pour Foster`);
    
    if (fosterTransactions.length > 0) {
      let totalCredits = 0;
      let totalDebits = 0;
      let creditCount = 0;
      let debitCount = 0;

      fosterTransactions.forEach(tx => {
        if (tx.type === 'Credit') {
          totalCredits += tx.amount;
          creditCount++;
        } else {
          totalDebits += Math.abs(tx.amount);
          debitCount++;
        }
      });

      console.log('\n📊 RÉSUMÉ FOSTER:');
      console.log(`💵 Rentrées: ${creditCount} transaction(s) - ${totalCredits.toFixed(2)} €`);
      console.log(`💸 Sorties: ${debitCount} transaction(s) - ${totalDebits.toFixed(2)} €`);
      console.log(`💰 Balance: ${(totalCredits - totalDebits).toFixed(2)} €`);
      
      console.log('\n📝 Transactions trouvées:');
      fosterTransactions.forEach((tx, idx) => {
        const emoji = tx.type === 'Credit' ? '💵' : '💸';
        const date = new Date(tx.date).toLocaleDateString('fr-BE');
        console.log(`${idx + 1}. ${emoji} ${Math.abs(tx.amount).toFixed(2)} € - ${date}`);
        console.log(`   ${tx.description.substring(0, 60)}`);
      });
    } else {
      console.log('\n⚠️ Aucune transaction Foster trouvée.');
      console.log('📝 Exemples de descriptions dans novembre:');
      allTransactions.slice(0, 5).forEach(tx => {
        console.log(`  - ${tx.description.substring(0, 70)}`);
      });
    }
  } catch (error: any) {
    console.error('❌ Erreur:', error.message);
  }

  console.log('\n\n' + '='.repeat(60));
  console.log('✓ Test terminé !');
}

// Exécuter le test
testSupplierFilter().catch(console.error);
