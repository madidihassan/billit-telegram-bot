import { BillitClient } from './src/billit-client';

async function testOrderDetails() {
  const billitClient = new BillitClient();
  const invoices = await billitClient.getInvoices({ limit: 1 });
  
  if (invoices.length > 0) {
    console.log('📋 Récupération des détails de la commande...');
    const details = await billitClient.getInvoiceDetails(invoices[0].id);
    console.log('\n📋 Détails complets de la commande (JSON):');
    console.log(JSON.stringify(details, null, 2));
  }
  process.exit(0);
}

testOrderDetails();
