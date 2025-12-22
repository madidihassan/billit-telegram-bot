/**
 * Script de test pour valider la pagination des transactions bancaires
 */

import { BankClient } from './src/bank-client';

async function testPagination() {
  console.log('🧪 TEST DE PAGINATION - TRANSACTIONS BANCAIRES\n');
  console.log('='.repeat(60));

  const bankClient = new BankClient();

  // Test 1: Octobre 2025
  console.log('\n\n📅 TEST 1: Recettes d\'octobre 2025');
  console.log('-'.repeat(60));
  
  const octobreStart = new Date('2025-10-01');
  const octobreEnd = new Date('2025-10-31T23:59:59');

  try {
    const octobreTransactions = await bankClient.getTransactionsByPeriod(octobreStart, octobreEnd);
    const octobreCredits = octobreTransactions.filter(tx => tx.type === 'Credit');
    const totalOctobre = octobreCredits.reduce((sum, tx) => sum + tx.amount, 0);

    console.log(`✓ ${octobreCredits.length} recettes trouvées en octobre`);
    console.log(`💰 Total: ${totalOctobre.toFixed(2)} €`);
    
    if (octobreCredits.length > 0) {
      console.log('\n📝 Premières transactions:');
      octobreCredits.slice(0, 3).forEach(tx => {
        console.log(`  - ${tx.date}: ${tx.amount.toFixed(2)} € - ${tx.description.substring(0, 50)}`);
      });
    }
  } catch (error: any) {
    console.error('❌ Erreur octobre:', error.message);
  }

  // Test 2: Juillet 2025
  console.log('\n\n📅 TEST 2: Recettes de juillet 2025');
  console.log('-'.repeat(60));
  
  const juilletStart = new Date('2025-07-01');
  const juilletEnd = new Date('2025-07-31T23:59:59');

  try {
    const juilletTransactions = await bankClient.getTransactionsByPeriod(juilletStart, juilletEnd);
    const juilletCredits = juilletTransactions.filter(tx => tx.type === 'Credit');
    const totalJuillet = juilletCredits.reduce((sum, tx) => sum + tx.amount, 0);

    console.log(`✓ ${juilletCredits.length} recettes trouvées en juillet`);
    console.log(`💰 Total: ${totalJuillet.toFixed(2)} €`);
    
    if (juilletCredits.length > 0) {
      console.log('\n📝 Premières transactions:');
      juilletCredits.slice(0, 3).forEach(tx => {
        console.log(`  - ${tx.date}: ${tx.amount.toFixed(2)} € - ${tx.description.substring(0, 50)}`);
      });
    }
  } catch (error: any) {
    console.error('❌ Erreur juillet:', error.message);
  }

  // Test 3: Septembre 2025 (jusqu'au 18)
  console.log('\n\n📅 TEST 3: Recettes de septembre 2025 (jusqu\'au 18)');
  console.log('-'.repeat(60));
  
  const septembreStart = new Date('2025-09-01');
  const septembreEnd = new Date('2025-09-18T23:59:59');

  try {
    const septembreTransactions = await bankClient.getTransactionsByPeriod(septembreStart, septembreEnd);
    const septembreCredits = septembreTransactions.filter(tx => tx.type === 'Credit');
    const totalSeptembre = septembreCredits.reduce((sum, tx) => sum + tx.amount, 0);

    console.log(`✓ ${septembreCredits.length} recettes trouvées en septembre (1-18)`);
    console.log(`💰 Total: ${totalSeptembre.toFixed(2)} €`);
    
    if (septembreCredits.length > 0) {
      console.log('\n📝 Premières transactions:');
      septembreCredits.slice(0, 3).forEach(tx => {
        console.log(`  - ${tx.date}: ${tx.amount.toFixed(2)} € - ${tx.description.substring(0, 50)}`);
      });
    }
  } catch (error: any) {
    console.error('❌ Erreur septembre:', error.message);
  }

  // Test 4: Décembre 2025 (mois actuel)
  console.log('\n\n📅 TEST 4: Recettes de décembre 2025 (mois actuel)');
  console.log('-'.repeat(60));
  
  const decembreStart = new Date('2025-12-01');
  const decembreEnd = new Date('2025-12-31T23:59:59');

  try {
    const decembreTransactions = await bankClient.getTransactionsByPeriod(decembreStart, decembreEnd);
    const decembreCredits = decembreTransactions.filter(tx => tx.type === 'Credit');
    const totalDecembre = decembreCredits.reduce((sum, tx) => sum + tx.amount, 0);

    console.log(`✓ ${decembreCredits.length} recettes trouvées en décembre`);
    console.log(`💰 Total: ${totalDecembre.toFixed(2)} €`);
    
    if (decembreCredits.length > 0) {
      console.log('\n📝 Dernières transactions:');
      decembreCredits.slice(-3).reverse().forEach(tx => {
        console.log(`  - ${tx.date}: ${tx.amount.toFixed(2)} € - ${tx.description.substring(0, 50)}`);
      });
    }
  } catch (error: any) {
    console.error('❌ Erreur décembre:', error.message);
  }

  console.log('\n\n' + '='.repeat(60));
  console.log('✓ Tests terminés !');
}

// Exécuter les tests
testPagination().catch(console.error);
