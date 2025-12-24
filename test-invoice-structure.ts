import { BillitClient } from './src/billit-client';

async function testInvoiceStructure() {
  const billitClient = new BillitClient();
  const invoices = await billitClient.getInvoices({ limit: 1 });
  
  if (invoices.length > 0) {
    console.log('📋 Structure complète de la facture:');
    console.log(JSON.stringify(invoices[0], null, 2));
  }
  process.exit(0);
}

testInvoiceStructure();
