/**
 * Script de test pour identifier les transactions mal attribuées à Coca-Cola
 */

const { BankClient } = require('./dist/bank-client');
const { matchesSupplier, SUPPLIER_ALIASES } = require('./dist/supplier-aliases');

async function testCocaMatching() {
  console.log('🔍 TEST DES CORRESPONDANCES COCA-COLA\n');
  console.log('=====================================\n');

  const bankClient = new BankClient();
  const transactions = await bankClient.getAllTransactions();

  console.log(`Total transactions récupérées: ${transactions.length}\n`);

  // Filtrer les transactions qui matchent Coca-Cola (nom exact de la BD)
  const cocaTransactions = transactions.filter(tx =>
    tx.type === 'Debit' && matchesSupplier(tx.description || '', 'COCA-COLA EUROPACIFIC PARTNERS BELGIUM SRL')
  );

  console.log(`✅ Transactions matchées pour Coca-Cola: ${cocaTransactions.length}\n`);

  // Afficher toutes les transactions matchées
  let total = 0;
  cocaTransactions.forEach((tx, index) => {
    const amount = Math.abs(tx.amount);
    total += amount;
    console.log(`${index + 1}. ${amount.toFixed(2)}€ - ${tx.date}`);
    console.log(`   Description: ${tx.description}`);
    console.log('');
  });

  console.log(`\n💰 TOTAL: ${total.toFixed(2)}€`);
  console.log(`📊 Nombre de transactions: ${cocaTransactions.length}`);

  // Vérifier les alias Coca-Cola
  console.log('\n\n🔍 ALIAS COCA-COLA CONFIGURÉS:\n');
  const cocaSupplier = SUPPLIER_ALIASES['COCA-COLA EUROPACIFIC PARTNERS BELGIUM SRL'];
  if (cocaSupplier) {
    console.log('Aliases:', cocaSupplier.aliases);
    console.log('Patterns:', cocaSupplier.patterns);
  } else {
    console.log('❌ Coca-Cola non trouvé dans SUPPLIER_ALIASES');
  }
}

testCocaMatching()
  .then(() => {
    console.log('\n✅ Test terminé');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Erreur:', error);
    process.exit(1);
  });
