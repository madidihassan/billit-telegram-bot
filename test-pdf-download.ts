import { BillitClient } from './src/billit-client';
import { config } from './src/config';

async function testPdfDownload() {
  const billitClient = new BillitClient();
  const invoices = await billitClient.getInvoices({ limit: 1 });
  
  if (invoices.length > 0) {
    const invoice = invoices[0];
    console.log(`📋 Facture: ${invoice.invoice_number} (${invoice.supplier_name})`);
    
    const details = await billitClient.getInvoiceDetails(invoice.id);
    console.log(`📄 OrderPDF:`, details.OrderPDF);
    
    if (details.OrderPDF && details.OrderPDF.FileID) {
      const fileId = details.OrderPDF.FileID;
      console.log(`\n🔍 Test de téléchargement avec FileID: ${fileId}`);
      
      // Test endpoint 1: /v1/files/{FileID}
      console.log('\n1️⃣ Test: /v1/files/${FileID}');
      const url1 = `https://my.billit.eu/api/v1/files/${fileId}`;
      console.log(`   URL: ${url1}`);
      
      const response1 = await fetch(url1, {
        headers: {
          'apikey': config.billit.apiKey,
          'partyID': config.billit.partyId || '',
          'Accept': 'application/pdf',
        },
      });
      console.log(`   Status: ${response1.status} ${response1.statusText}`);
      
      if (response1.ok) {
        const buffer = Buffer.from(await response1.arrayBuffer());
        console.log(`   ✅ PDF téléchargé ! Taille: ${buffer.length} bytes`);
        process.exit(0);
      }
      
      // Test endpoint 2: /v1/orders/{OrderID}/files/{FileID}
      console.log('\n2️⃣ Test: /v1/orders/${OrderID}/files/${FileID}');
      const url2 = `https://my.billit.eu/api/v1/orders/${invoice.id}/files/${fileId}`;
      console.log(`   URL: ${url2}`);
      
      const response2 = await fetch(url2, {
        headers: {
          'apikey': config.billit.apiKey,
          'partyID': config.billit.partyId || '',
          'Accept': 'application/pdf',
        },
      });
      console.log(`   Status: ${response2.status} ${response2.statusText}`);
      
      if (response2.ok) {
        const buffer = Buffer.from(await response2.arrayBuffer());
        console.log(`   ✅ PDF téléchargé ! Taille: ${buffer.length} bytes`);
        process.exit(0);
      }
      
      // Test endpoint 3: /v1/documents/{FileID}
      console.log('\n3️⃣ Test: /v1/documents/${FileID}');
      const url3 = `https://my.billit.eu/api/v1/documents/${fileId}`;
      console.log(`   URL: ${url3}`);
      
      const response3 = await fetch(url3, {
        headers: {
          'apikey': config.billit.apiKey,
          'partyID': config.billit.partyId || '',
          'Accept': 'application/pdf',
        },
      });
      console.log(`   Status: ${response3.status} ${response3.statusText}`);
      
      if (response3.ok) {
        const buffer = Buffer.from(await response3.arrayBuffer());
        console.log(`   ✅ PDF téléchargé ! Taille: ${buffer.length} bytes`);
        process.exit(0);
      }
      
      console.log('\n❌ Aucun endpoint n\'a fonctionné');
    }
  }
  process.exit(1);
}

testPdfDownload();
