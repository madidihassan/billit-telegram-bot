/**
 * Test du filtrage des salaires
 */

import { BankClient } from './src/bank-client';
import { matchesSupplier } from './src/supplier-aliases';

// Liste des employés
const EMPLOYEE_KEYS = [
  'kalidechami', 'zamounlamya', 'elbarnoussi', 'krimfatima', 'mahjoub',
  'eljaouhari', 'azzabi', 'aboukhalid', 'elbalghiti', 'ourimchi',
  'benyamoune', 'kharbouche', 'afkir', 'ellalouimohamed', 'madidijawad',
  'samat', 'barilyagoubi', 'taglina', 'turbatu', 'qibouz', 'mrabet',
  'madidihassan', 'elmouden', 'satti', 'jamhounmokhlis'
];

function isSalaryTransaction(description: string): boolean {
  return EMPLOYEE_KEYS.some(employeeKey =>
    matchesSupplier(description, employeeKey)
  );
}

async function testSalaryFilter() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🧪 TEST - FILTRAGE DES SALAIRES');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const bankClient = new BankClient();

  // Récupérer les transactions de novembre 2025
  const startDate = new Date('2025-11-01');
  const endDate = new Date('2025-11-30');

  console.log('📅 Période: Novembre 2025\n');

  const transactions = await bankClient.getTransactionsByPeriod(startDate, endDate);

  console.log(`✅ ${transactions.length} transactions récupérées\n`);

  // Filtrer uniquement les débits (sorties)
  const debits = transactions.filter(tx => tx.type === 'Debit');
  console.log(`💸 ${debits.length} débits (sorties) au total\n`);

  // Filtrer uniquement les salaires
  const salaries = debits.filter(tx => isSalaryTransaction(tx.description || ''));
  console.log(`👥 ${salaries.length} salaires détectés\n`);

  // Afficher les salaires
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('👥 SALAIRES DE NOVEMBRE 2025');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  let totalSalaires = 0;

  salaries.forEach((tx, idx) => {
    const amount = Math.abs(tx.amount);
    totalSalaires += amount;

    const formatted = new Intl.NumberFormat('fr-BE', {
      style: 'currency',
      currency: 'EUR'
    }).format(amount);

    const date = new Date(tx.date).toLocaleDateString('fr-BE');

    // Extraire le nom de l'employé
    const match = tx.description?.match(/VIREMENT EN FAVEUR DE ([a-z\s\-]+) BE/i);
    const employeeName = match ? match[1].trim() : 'Inconnu';

    console.log(`${idx + 1}. ${formatted} - ${date}`);
    console.log(`   ${employeeName}`);
    console.log('');
  });

  const totalFormatted = new Intl.NumberFormat('fr-BE', {
    style: 'currency',
    currency: 'EUR'
  }).format(totalSalaires);

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`💰 TOTAL SALAIRES: ${totalFormatted}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // Comparer avec toutes les dépenses
  const totalDebits = debits.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
  const totalDebitsFormatted = new Intl.NumberFormat('fr-BE', {
    style: 'currency',
    currency: 'EUR'
  }).format(totalDebits);

  console.log(`\n📊 Total TOUTES dépenses: ${totalDebitsFormatted}`);
  console.log(`👥 Salaires: ${totalFormatted} (${((totalSalaires / totalDebits) * 100).toFixed(1)}%)`);
  console.log(`🏢 Autres (fournisseurs, achats): ${new Intl.NumberFormat('fr-BE', { style: 'currency', currency: 'EUR' }).format(totalDebits - totalSalaires)} (${(((totalDebits - totalSalaires) / totalDebits) * 100).toFixed(1)}%)`);
}

testSalaryFilter().catch(console.error);
