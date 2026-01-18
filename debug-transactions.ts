/**
 * Script de diagnostic pour les transactions bancaires
 * Permet de voir ce que l'API Billit retourne reellement
 */

import { BankClient } from './src/bank-client';
import { config } from './src/config';

async function debugTransactions() {
  console.log('Diagnostic des transactions bancaires...\n');

  const bankClient = new BankClient();

  // Recuperer les transactions des 6 derniers mois
  const endDate = new Date();
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - 6);

  console.log(`Periode: ${startDate.toLocaleDateString('fr-FR')} au ${endDate.toLocaleDateString('fr-FR')}\n`);

  try {
    const transactions = await bankClient.getTransactionsByPeriod(startDate, endDate);

    console.log(`${transactions.length} transactions trouvees\n`);

    // Afficher les 10 premieres transactions en detail
    console.log('10 PREMIERES TRANSACTIONS:\n');
    transactions.slice(0, 10).forEach((tx, i) => {
      const descLower = (tx.description || '').toLowerCase();
      const isSalary = descLower.includes('salaire') || descLower.includes('salair');

      console.log(`${i + 1}. [${tx.type}] ${tx.date}`);
      console.log(`   Montant: ${tx.amount.toFixed(2)} EUR`);
      console.log(`   Description: ${tx.description?.substring(0, 80) || '(vide)'}${tx.description?.length > 80 ? '...' : ''}`);
      console.log(`   Salaire? ${isSalary ? 'OUI' : 'non'}`);
      console.log('');
    });

    // Chercher specifiquement les transactions avec "salaire"
    console.log('\nRECHERCHE "SALAIRE":\n');
    const salaryTransactions = transactions.filter(tx => {
      const desc = (tx.description || '').toLowerCase();
      return desc.includes('salaire') || desc.includes('salair');
    });

    if (salaryTransactions.length > 0) {
      console.log(`${salaryTransactions.length} transactions de salaire trouvees:\n`);
      salaryTransactions.forEach((tx, i) => {
        console.log(`${i + 1}. ${tx.date} - ${tx.amount.toFixed(2)} EUR`);
        console.log(`   Description: ${tx.description}`);
        console.log('');
      });
    } else {
      console.log('AUCUNE transaction de salaire trouvee!\n');
    }

    // Chercher les virements (pour voir les formats)
    console.log('\nRECHERCHE VIREMENTS:\n');
    const virements = transactions.filter(tx => {
      const desc = (tx.description || '').toLowerCase();
      return desc.includes('virement') || desc.includes('vire');
    });

    console.log(`${virements.length} virements trouves:\n`);
    virements.slice(0, 5).forEach((tx, i) => {
      console.log(`${i + 1}. ${tx.date} - ${tx.amount.toFixed(2)} EUR`);
      console.log(`   Description: ${tx.description}`);
      console.log('');
    });

  } catch (error: any) {
    console.error('Erreur:', error.message);
    console.error(error);
  }
}

debugTransactions();
