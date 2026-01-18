// Test direct de l'outil get_supplier_expenses pour KBC
const { BillitClient } = require('./dist/billit-client');
const { BankClient } = require('./dist/bank-client');

async function testKBC() {
  console.log('🧪 Test de l\'outil get_supplier_expenses pour KBC\n');

  const billitClient = new BillitClient();
  const bankClient = new BankClient(billitClient);

  // Récupérer les factures
  console.log('📋 Récupération des factures Billit...');
  const invoices = await billitClient.getInvoices({ limit: 120 });
  console.log(`✅ ${invoices.length} facture(s) récupérée(s)\n`);

  // Chercher les factures KBC
  const kbcInvoices = invoices.filter(inv =>
    inv.supplier_name && inv.supplier_name.toLowerCase().includes('kbc')
  );
  console.log(`📊 Factures KBC trouvées: ${kbcInvoices.length}`);
  kbcInvoices.forEach(inv => {
    console.log(`  - ${inv.invoice_number}: ${inv.total_amount}€ (${inv.supplier_name})`);
  });
  console.log('');

  // Récupérer les transactions bancaires
  console.log('🏦 Récupération des transactions bancaires...');
  const transactions = await bankClient.getAllTransactions();
  console.log(`✅ ${transactions.length} transaction(s) récupérée(s)\n`);

  // Chercher les transactions KBC
  const kbcTransactions = transactions.filter(tx =>
    tx.description && tx.description.toLowerCase().includes('kbc')
  );
  console.log(`📊 Transactions avec "kbc" trouvées: ${kbcTransactions.length}`);
  kbcTransactions.slice(0, 5).forEach(tx => {
    console.log(`  - ${new Date(tx.date).toLocaleDateString('fr-FR')}: ${tx.amount}€ (${tx.description.substring(0, 80)})`);
  });
  console.log('');

  // Chercher avec "RECOUVREMENT"
  const recouvrementTransactions = transactions.filter(tx =>
    tx.description && tx.description.toLowerCase().includes('recouvrement')
  );
  console.log(`📊 Transactions avec "recouvrement" trouvées: ${recouvrementTransactions.length}`);
  recouvrementTransactions.slice(0, 10).forEach(tx => {
    const desc = tx.description.substring(0, 100);
    console.log(`  - ${new Date(tx.date).toLocaleDateString('fr-FR')}: ${tx.amount.toFixed(2)}€`);
    console.log(`    ${desc}...`);
  });
}

testKBC().catch(error => {
  console.error('❌ Erreur:', error);
  process.exit(1);
});
