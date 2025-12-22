#!/usr/bin/env ts-node
/**
 * Script pour tester les limites de l'historique des transactions bancaires sur Billit
 */

import { BankClient } from './src/bank-client';

async function testHistoryLimits() {
  console.log('🔍 TEST DES LIMITES D\'HISTORIQUE - API BILLIT\n');
  console.log('='.repeat(70));

  const bankClient = new BankClient();

  // Test 1: Récupérer TOUTES les transactions disponibles (sans filtre de date)
  console.log('\n📊 TEST 1: Maximum de transactions sans filtre de date');
  console.log('-'.repeat(70));

  try {
    console.log('Récupération avec $top=1000...');
    const allTransactions = await bankClient.getAllTransactions(1000);
    
    if (allTransactions.length > 0) {
      // Trier par date pour trouver la plus ancienne et la plus récente
      const sorted = allTransactions.sort((a, b) => 
        new Date(a.date).getTime() - new Date(b.date).getTime()
      );

      const oldest = sorted[0];
      const newest = sorted[sorted.length - 1];

      console.log(`\n✓ ${allTransactions.length} transactions récupérées`);
      console.log(`\n📅 Transaction la plus ANCIENNE:`);
      console.log(`   Date: ${new Date(oldest.date).toLocaleDateString('fr-BE')}`);
      console.log(`   Montant: ${oldest.amount.toFixed(2)} €`);
      console.log(`   Description: ${oldest.description.substring(0, 60)}`);

      console.log(`\n📅 Transaction la plus RÉCENTE:`);
      console.log(`   Date: ${new Date(newest.date).toLocaleDateString('fr-BE')}`);
      console.log(`   Montant: ${newest.amount.toFixed(2)} €`);
      console.log(`   Description: ${newest.description.substring(0, 60)}`);

      // Calculer la période couverte
      const oldestDate = new Date(oldest.date);
      const newestDate = new Date(newest.date);
      const diffDays = Math.floor((newestDate.getTime() - oldestDate.getTime()) / (1000 * 60 * 60 * 24));
      const diffMonths = Math.floor(diffDays / 30);

      console.log(`\n📊 PÉRIODE COUVERTE:`);
      console.log(`   Du ${oldestDate.toLocaleDateString('fr-BE')} au ${newestDate.toLocaleDateString('fr-BE')}`);
      console.log(`   Soit: ${diffDays} jours (≈ ${diffMonths} mois)`);
    }
  } catch (error: any) {
    console.error('❌ Erreur:', error.message);
  }

  // Test 2: Tester une date très ancienne (début d'année)
  console.log('\n\n📊 TEST 2: Récupération depuis le début de l\'année 2025');
  console.log('-'.repeat(70));

  try {
    const startOfYear = new Date('2025-01-01');
    const today = new Date();

    console.log(`Période demandée: ${startOfYear.toLocaleDateString('fr-BE')} - ${today.toLocaleDateString('fr-BE')}`);
    
    const yearTransactions = await bankClient.getTransactionsByPeriod(startOfYear, today);
    
    console.log(`\n✓ ${yearTransactions.length} transactions trouvées depuis le 01/01/2025`);

    if (yearTransactions.length > 0) {
      const sorted = yearTransactions.sort((a, b) => 
        new Date(a.date).getTime() - new Date(b.date).getTime()
      );

      const oldest = sorted[0];
      console.log(`\n📅 Transaction la plus ancienne trouvée:`);
      console.log(`   Date: ${new Date(oldest.date).toLocaleDateString('fr-BE')}`);
      console.log(`   Montant: ${oldest.amount.toFixed(2)} €`);
    }
  } catch (error: any) {
    console.error('❌ Erreur:', error.message);
  }

  // Test 3: Tester avec une très vieille date (2024)
  console.log('\n\n📊 TEST 3: Récupération depuis 2024');
  console.log('-'.repeat(70));

  try {
    const startOf2024 = new Date('2024-01-01');
    const endOf2024 = new Date('2024-12-31');

    console.log(`Période demandée: ${startOf2024.toLocaleDateString('fr-BE')} - ${endOf2024.toLocaleDateString('fr-BE')}`);
    
    const old2024Transactions = await bankClient.getTransactionsByPeriod(startOf2024, endOf2024);
    
    if (old2024Transactions.length > 0) {
      console.log(`\n✓ ${old2024Transactions.length} transactions trouvées en 2024`);
      console.log(`   → L'API conserve l'historique 2024 ! ✅`);
    } else {
      console.log(`\n⚠️ Aucune transaction trouvée en 2024`);
      console.log(`   → L'historique ne remonte probablement pas jusqu'à 2024`);
    }
  } catch (error: any) {
    console.error('❌ Erreur:', error.message);
  }

  // Test 4: Tester mois par mois pour 2025
  console.log('\n\n📊 TEST 4: Analyse mois par mois pour 2025');
  console.log('-'.repeat(70));

  const months = [
    { name: 'Janvier', start: '2025-01-01', end: '2025-01-31' },
    { name: 'Février', start: '2025-02-01', end: '2025-02-28' },
    { name: 'Mars', start: '2025-03-01', end: '2025-03-31' },
    { name: 'Avril', start: '2025-04-01', end: '2025-04-30' },
    { name: 'Mai', start: '2025-05-01', end: '2025-05-31' },
    { name: 'Juin', start: '2025-06-01', end: '2025-06-30' },
    { name: 'Juillet', start: '2025-07-01', end: '2025-07-31' },
    { name: 'Août', start: '2025-08-01', end: '2025-08-31' },
    { name: 'Septembre', start: '2025-09-01', end: '2025-09-30' },
    { name: 'Octobre', start: '2025-10-01', end: '2025-10-31' },
    { name: 'Novembre', start: '2025-11-01', end: '2025-11-30' },
    { name: 'Décembre', start: '2025-12-01', end: '2025-12-31' },
  ];

  let firstMonthWithData = null;

  for (const month of months) {
    const start = new Date(month.start);
    const end = new Date(month.end);
    
    // Skip les mois futurs
    if (start > new Date()) break;

    try {
      const monthTransactions = await bankClient.getTransactionsByPeriod(start, end);
      const status = monthTransactions.length > 0 ? '✅' : '❌';
      
      console.log(`${status} ${month.name} 2025: ${monthTransactions.length} transaction(s)`);

      if (monthTransactions.length > 0 && !firstMonthWithData) {
        firstMonthWithData = month.name;
      }
    } catch (error: any) {
      console.log(`❌ ${month.name} 2025: Erreur`);
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('📊 RÉSUMÉ:');
  if (firstMonthWithData) {
    console.log(`   Premier mois avec données disponibles: ${firstMonthWithData} 2025`);
  }
  console.log('='.repeat(70));
}

testHistoryLimits().catch(console.error);
