/**
 * Liste TOUTES les descriptions uniques des transactions bancaires
 */

import { BankClient } from './src/bank-client';

async function listAllDescriptions() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔍 LISTE DE TOUTES LES DESCRIPTIONS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const bankClient = new BankClient();

  try {
    // Récupérer toutes les transactions
    const startDate = new Date();
    startDate.setFullYear(startDate.getFullYear() - 1);
    const endDate = new Date();

    console.log('📥 Récupération des transactions...\n');
    const transactions = await bankClient.getTransactionsByPeriod(startDate, endDate);

    console.log(`✅ ${transactions.length} transactions récupérées\n`);

    // Grouper par description
    const descriptionMap = new Map<string, {
      count: number;
      totalAmount: number;
      type: string;
      dates: string[];
    }>();

    transactions.forEach(tx => {
      const desc = tx.description?.trim() || 'Sans description';

      if (!descriptionMap.has(desc)) {
        descriptionMap.set(desc, {
          count: 0,
          totalAmount: 0,
          type: tx.type,
          dates: []
        });
      }

      const data = descriptionMap.get(desc)!;
      data.count++;
      data.totalAmount += Math.abs(tx.amount);
      data.dates.push(tx.date);
    });

    // Trier par nombre d'occurrences
    const sorted = Array.from(descriptionMap.entries())
      .sort((a, b) => b[1].count - a[1].count);

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📋 ${sorted.length} descriptions uniques trouvées`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Séparer en catégories
    const debits = sorted.filter(([_, data]) => data.type === 'Debit');
    const credits = sorted.filter(([_, data]) => data.type === 'Credit');

    console.log('\n💸 SORTIES (DÉBITS) - Fournisseurs potentiels:\n');
    debits.forEach(([desc, data], idx) => {
      const amount = new Intl.NumberFormat('fr-BE', { style: 'currency', currency: 'EUR' }).format(data.totalAmount);
      console.log(`${idx + 1}. ${desc.substring(0, 60)}`);
      console.log(`   📊 ${data.count}× | ${amount}`);
      console.log('');
    });

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('💵 ENTRÉES (CRÉDITS):\n');
    credits.forEach(([desc, data], idx) => {
      const amount = new Intl.NumberFormat('fr-BE', { style: 'currency', currency: 'EUR' }).format(data.totalAmount);
      console.log(`${idx + 1}. ${desc.substring(0, 60)}`);
      console.log(`   📊 ${data.count}× | ${amount}`);
      console.log('');
    });

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📊 Total: ${sorted.length} descriptions uniques`);
    console.log(`   💸 Débits: ${debits.length}`);
    console.log(`   💵 Crédits: ${credits.length}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  } catch (error: any) {
    console.error('❌ Erreur:', error.message);
  }
}

listAllDescriptions().catch(console.error);
