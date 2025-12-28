/**
 * Trouver toutes les factures Coca-Cola dans Billit
 */

const { BillitClient } = require('./dist/billit-client');

async function findCocaInvoices() {
  console.log('🔍 RECHERCHE DES FACTURES COCA-COLA DANS BILLIT\n');
  console.log('===============================================\n');

  const billitClient = new BillitClient();

  // Récupérer TOUTES les factures (120 max)
  const invoices = await billitClient.getInvoices({ limit: 120 });

  console.log(`Total factures récupérées: ${invoices.length}\n`);

  // Chercher toutes les factures qui contiennent "coca" dans le nom du fournisseur
  const cocaInvoices = invoices.filter(inv => {
    const supplier = (inv.supplier_name || '').toLowerCase();
    return supplier.includes('coca');
  });

  console.log(`✅ Factures Coca-Cola trouvées: ${cocaInvoices.length}\n`);

  let total = 0;
  cocaInvoices.forEach((inv, index) => {
    const amount = inv.total_amount;
    total += amount;
    console.log(`${index + 1}. ${amount.toFixed(2)}€ - ${inv.invoice_date}`);
    console.log(`   Fournisseur: ${inv.supplier_name}`);
    console.log(`   Numéro: ${inv.invoice_number}`);
    console.log(`   Statut: ${inv.status}`);
    console.log('');
  });

  console.log(`\n💰 TOTAL: ${total.toFixed(2)}€`);
  console.log(`📊 Nombre de factures: ${cocaInvoices.length}`);
}

findCocaInvoices()
  .then(() => {
    console.log('\n✅ Recherche terminée');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Erreur:', error);
    process.exit(1);
  });
