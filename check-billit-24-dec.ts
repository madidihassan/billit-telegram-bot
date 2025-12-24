/**
 * Vérification directe des transactions Billit du 24 décembre 2025
 */

import { BankClient } from './src/bank-client';
import { BillitClient } from './src/billit-client';

async function checkBillit() {
  console.log('🔍 Vérification directe dans Billit - 24 décembre 2025\n');

  const bankClient = new BankClient();
  const billitClient = new BillitClient();

  // 1. Récupérer toutes les transactions de décembre 2025
  console.log('📊 Récupération des transactions de décembre 2025...');
  try {
    // Récupérer les transactions du mois de décembre
    const allTransactions = await bankClient.getMonthlyTransactions();

    console.log(`✅ ${allTransactions.length} transactions trouvées ce mois-ci\n`);

    // 2. Filtrer celles du 24 décembre
    const dec24Transactions = allTransactions.filter((tx: any) => {
      const txDate = new Date(tx.date);
      return txDate.getDate() === 24 &&
             txDate.getMonth() === 11 && // Décembre = 11
             txDate.getFullYear() === 2025;
    });

    console.log(`📅 ${dec24Transactions.length} transaction(s) le 24/12/2025:\n`);

    if (dec24Transactions.length > 0) {
      dec24Transactions.forEach((tx: any, idx: number) => {
        console.log(`   ${idx + 1}. ${tx.type.toUpperCase()} - ${tx.amount.toFixed(2)} €`);
        console.log(`      Description: ${tx.description}`);
        console.log(`      Date: ${new Date(tx.date).toLocaleString('fr-FR')}`);
        console.log(`      IBAN: ${tx.iban}`);
        console.log();
      });
    } else {
      console.log('❌ Aucune transaction trouvée le 24/12/2025\n');
    }

    // 3. Vérifier les factures du 24 décembre
    console.log('📄 Vérification des factures du 24/12/2025...');
    const allInvoices = await billitClient.getInvoices({ limit: 100 });

    const dec24Invoices = allInvoices.filter((inv: any) => {
      const invDate = new Date(inv.invoice_date);
      return invDate.getDate() === 24 &&
             invDate.getMonth() === 11 &&
             invDate.getFullYear() === 2025;
    });

    console.log(`📋 ${dec24Invoices.length} facture(s) créée(s) le 24/12/2025:\n`);

    if (dec24Invoices.length > 0) {
      dec24Invoices.forEach((inv: any, idx: number) => {
        console.log(`   ${idx + 1}. ${inv.supplier_name}`);
        console.log(`      N° Facture: ${inv.invoice_number}`);
        console.log(`      Montant: ${inv.total_amount.toFixed(2)} €`);
        console.log(`      Statut: ${inv.status}`);
        console.log(`      Communication: ${inv.communication || 'N/A'}`);
        console.log();
      });
    } else {
      console.log('❌ Aucune facture créée le 24/12/2025\n');
    }

    // 4. Afficher un résumé
    console.log('📊 RÉSUMÉ:');
    console.log(`   Transactions le 24/12/2025: ${dec24Transactions.length}`);
    console.log(`   Factures créées le 24/12/2025: ${dec24Invoices.length}`);
    console.log(`   Total des transactions en décembre: ${allTransactions.length}`);

  } catch (error: any) {
    console.error('❌ Erreur:', error.message);
    console.error(error);
  }

  process.exit(0);
}

checkBillit();
