/**
 * Trouver toutes les transactions contenant "coca" dans la description
 */

const { BankClient } = require('./dist/bank-client');
const { normalizeSearchTerm } = require('./dist/utils/string-utils');

async function findCocaTransactions() {
  console.log('🔍 RECHERCHE DES TRANSACTIONS CONTENANT "COCA"\n');
  console.log('==============================================\n');

  const bankClient = new BankClient();
  const transactions = await bankClient.getAllTransactions();

  // Chercher toutes les transactions Debit qui contiennent "coca" (case-insensitive)
  const cocaTransactions = transactions.filter(tx => {
    if (tx.type !== 'Debit') return false;
    const desc = (tx.description || '').toLowerCase();
    return desc.includes('coca');
  });

  console.log(`✅ Transactions trouvées: ${cocaTransactions.length}\n`);

  let total = 0;
  cocaTransactions.forEach((tx, index) => {
    const amount = Math.abs(tx.amount);
    total += amount;
    console.log(`${index + 1}. ${amount.toFixed(2)}€ - ${tx.date}`);
    console.log(`   Description: ${tx.description}`);
    console.log(`   Normalized: ${normalizeSearchTerm(tx.description || '')}`);
    console.log('');
  });

  console.log(`\n💰 TOTAL: ${total.toFixed(2)}€`);
  console.log(`📊 Nombre de transactions: ${cocaTransactions.length}`);
}

findCocaTransactions()
  .then(() => {
    console.log('\n✅ Recherche terminée');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Erreur:', error);
    process.exit(1);
  });
