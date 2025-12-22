/**
 * Test pour trouver les transactions EDENRED
 */

import { BankClient } from './src/bank-client';

async function testEdenred() {
  console.log('🧪 TEST RECHERCHE EDENRED\n');
  console.log('='.repeat(60));

  const bankClient = new BankClient();
  
  const decembreStart = new Date('2025-12-01');
  const decembreEnd = new Date('2025-12-31T23:59:59');

  try {
    // Récupérer toutes les transactions de décembre
    const allTransactions = await bankClient.getTransactionsByPeriod(decembreStart, decembreEnd);
    console.log(`✓ ${allTransactions.length} transactions totales en décembre`);

    // Chercher "EDENRED" dans les descriptions
    const edenredTransactions = allTransactions.filter(tx => 
      tx.description.toLowerCase().includes('edenred') ||
      tx.description.toLowerCase().includes('eden')
    );

    console.log(`✓ ${edenredTransactions.length} transactions EDENRED trouvées`);
    
    if (edenredTransactions.length > 0) {
      console.log('\n📝 Exemples de descriptions EDENRED:');
      edenredTransactions.slice(0, 5).forEach(tx => {
        const emoji = tx.type === 'Credit' ? '💵' : '💸';
        const date = new Date(tx.date).toLocaleDateString('fr-BE');
        console.log(`${emoji} ${Math.abs(tx.amount).toFixed(2)} € - ${date}`);
        console.log(`   ${tx.description}`);
      });

      // Stats
      let credits = 0;
      let debits = 0;
      let creditCount = 0;
      let debitCount = 0;

      edenredTransactions.forEach(tx => {
        if (tx.type === 'Credit') {
          credits += tx.amount;
          creditCount++;
        } else {
          debits += Math.abs(tx.amount);
          debitCount++;
        }
      });

      console.log('\n📊 STATS EDENRED (décembre):');
      console.log(`💵 Rentrées: ${creditCount} transaction(s) - ${credits.toFixed(2)} €`);
      console.log(`💸 Sorties: ${debitCount} transaction(s) - ${debits.toFixed(2)} €`);
    }

    // Test de normalisation
    console.log('\n🔍 TEST NORMALISATION:');
    const normalizeSearchTerm = (text: string): string => {
      return text
        .toLowerCase()
        .replace(/[\s\-_\.\/\\]/g, '')
        .trim();
    };

    console.log(`"Eden Red" normalisé: "${normalizeSearchTerm('Eden Red')}"`);
    console.log(`"EDENRED" normalisé: "${normalizeSearchTerm('EDENRED')}"`);
    
    const edenRedNormalized = normalizeSearchTerm('Eden Red');
    const matchingTx = allTransactions.filter(tx => {
      const normalizedDesc = normalizeSearchTerm(tx.description);
      return normalizedDesc.includes(edenRedNormalized);
    });

    console.log(`\n✓ ${matchingTx.length} transactions trouvées avec "Eden Red" normalisé`);

  } catch (error: any) {
    console.error('❌ Erreur:', error.message);
  }

  console.log('\n' + '='.repeat(60));
}

testEdenred().catch(console.error);
