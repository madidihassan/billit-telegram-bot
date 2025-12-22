/**
 * Test pour vérifier les transactions Foster en octobre
 */

import { BankClient } from './src/bank-client';

async function testFosterOctober() {
  console.log('🧪 TEST FOSTER - OCTOBRE 2025\n');
  console.log('='.repeat(60));

  const bankClient = new BankClient();
  
  const octobreStart = new Date('2025-10-01');
  const octobreEnd = new Date('2025-10-31T23:59:59');

  try {
    // Récupérer toutes les transactions d'octobre
    const allTransactions = await bankClient.getTransactionsByPeriod(octobreStart, octobreEnd);
    console.log(`✓ ${allTransactions.length} transactions totales en octobre`);

    // Filtrer par "Foster"
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

    console.log(`✓ ${fosterTransactions.length} transactions Foster trouvées`);
    
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

      console.log('\n📊 RÉSUMÉ FOSTER OCTOBRE:');
      console.log(`💵 Rentrées: ${creditCount} transaction(s) - ${totalCredits.toFixed(2)} €`);
      console.log(`💸 Sorties: ${debitCount} transaction(s) - ${totalDebits.toFixed(2)} €`);
      console.log(`💰 Balance: ${(totalCredits - totalDebits).toFixed(2)} €`);
      console.log(`\n🎯 TOTAL PAYÉ À FOSTER: ${totalDebits.toFixed(2)} €`);
      
      console.log('\n📝 Transactions Foster en octobre:');
      fosterTransactions.forEach((tx, idx) => {
        const emoji = tx.type === 'Credit' ? '💵' : '💸';
        const date = new Date(tx.date).toLocaleDateString('fr-BE');
        console.log(`${idx + 1}. ${emoji} ${Math.abs(tx.amount).toFixed(2)} € - ${date}`);
        console.log(`   ${tx.description.substring(0, 60)}`);
      });
    }
  } catch (error: any) {
    console.error('❌ Erreur:', error.message);
  }

  console.log('\n' + '='.repeat(60));
  console.log('✓ Test terminé !');
}

testFosterOctober().catch(console.error);
