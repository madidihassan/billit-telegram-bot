/**
 * Implémentations des outils d'agrégation et analyse de périodes
 * PHASE 2 : Agrégation intelligente pour résumés annuels, comparaisons et rapports trimestriels
 *
 * @module AggregationAnalytics
 * @category AI Implementations
 */

import { BankClient } from '../../bank-client';
import { BillitClient } from '../../billit-client';

interface PeriodSummary {
  totalRevenue: number;
  totalExpenses: number;
  netBalance: number;
  transactionCount: number;
  topSuppliers: Array<{ name: string; amount: number }>;
  topEmployees?: Array<{ name: string; amount: number }>;
  categoryBreakdown: Map<string, number>;
}

/**
 * Résumé annuel complet
 */
export async function getYearSummary(
  bankClient: BankClient,
  billitClient: BillitClient,
  year?: string,
  include_comparison: boolean = true
): Promise<string> {
  try {
    const targetYear = year ? parseInt(year) : new Date().getFullYear();

    // Récupérer toutes les transactions de l'année
    const startDate = new Date(targetYear, 0, 1);
    const endDate = new Date(targetYear, 11, 31, 23, 59, 59);
    const transactions = await bankClient.getTransactionsByPeriod(startDate, endDate);

    // Calculer totaux
    const revenues = transactions.filter(t => t.type === 'Credit');
    const expenses = transactions.filter(t => t.type === 'Debit');

    const totalRevenue = revenues.reduce((sum, t) => sum + Math.abs(t.amount), 0);
    const totalExpenses = expenses.reduce((sum, t) => sum + Math.abs(t.amount), 0);
    const netBalance = totalRevenue - totalExpenses;

    // Top 10 fournisseurs
    const supplierMap = new Map<string, number>();
    expenses.forEach(t => {
      const supplier = t.description.split(' ')[0].toUpperCase();
      supplierMap.set(supplier, (supplierMap.get(supplier) || 0) + Math.abs(t.amount));
    });

    const topSuppliers = Array.from(supplierMap.entries())
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10);

    // Catégorisation des dépenses
    const categoryMap = new Map<string, number>();
    expenses.forEach(t => {
      const desc = t.description.toLowerCase();
      let category = 'Autres';

      if (desc.includes('salaire') || desc.includes('salary')) category = 'Salaires';
      else if (desc.includes('onss') || desc.includes('rszppo')) category = 'Charges sociales';
      else if (desc.includes('precompte') || desc.includes('tax')) category = 'Impôts';
      else if (desc.includes('loyer') || desc.includes('rent')) category = 'Loyers';
      else if (desc.includes('electricite') || desc.includes('eau') || desc.includes('gaz')) category = 'Utilities';
      else if (desc.includes('foster') || desc.includes('sligro') || desc.includes('colruyt')) category = 'Alimentation';

      categoryMap.set(category, (categoryMap.get(category) || 0) + Math.abs(t.amount));
    });

    const sortedCategories = Array.from(categoryMap.entries())
      .sort((a, b) => b[1] - a[1]);

    // Construire la réponse
    let response = `📊 Résumé annuel ${targetYear}\n`;
    response += `${'='.repeat(30)}\n\n`;

    response += `💰 Finances globales:\n`;
    response += `  📈 Recettes: ${totalRevenue.toFixed(2)}€ (${revenues.length} tx)\n`;
    response += `  📉 Dépenses: ${totalExpenses.toFixed(2)}€ (${expenses.length} tx)\n`;
    response += `  💵 Solde net: ${netBalance >= 0 ? '+' : ''}${netBalance.toFixed(2)}€\n`;
    response += `  📊 Total transactions: ${transactions.length}\n\n`;

    response += `🏆 Top 10 fournisseurs:\n`;
    topSuppliers.forEach((s, i) => {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
      const percent = (s.amount / totalExpenses * 100).toFixed(1);
      response += `  ${medal} ${s.name}: ${s.amount.toFixed(2)}€ (${percent}%)\n`;
    });

    response += `\n📊 Répartition par catégorie:\n`;
    sortedCategories.forEach(([cat, amount]) => {
      const percent = (amount / totalExpenses * 100).toFixed(1);
      const barLength = Math.round((amount / totalExpenses) * 20);
      const bar = '█'.repeat(barLength) + '░'.repeat(20 - barLength);
      response += `  ${cat}: ${bar} ${percent}% (${amount.toFixed(2)}€)\n`;
    });

    // Comparaison avec année précédente
    if (include_comparison && targetYear > 2020) {
      const prevYear = targetYear - 1;
      const prevStart = new Date(prevYear, 0, 1);
      const prevEnd = new Date(prevYear, 11, 31, 23, 59, 59);

      try {
        const prevTransactions = await bankClient.getTransactionsByPeriod(prevStart, prevEnd);
        const prevRevenue = prevTransactions.filter(t => t.type === 'Credit').reduce((sum, t) => sum + Math.abs(t.amount), 0);
        const prevExpenses = prevTransactions.filter(t => t.type === 'Debit').reduce((sum, t) => sum + Math.abs(t.amount), 0);

        const revenueChange = ((totalRevenue - prevRevenue) / prevRevenue * 100);
        const expensesChange = ((totalExpenses - prevExpenses) / prevExpenses * 100);

        response += `\n📊 Évolution vs ${prevYear}:\n`;
        response += `  Recettes: ${revenueChange > 0 ? '+' : ''}${revenueChange.toFixed(1)}% (${prevRevenue.toFixed(2)}€ → ${totalRevenue.toFixed(2)}€)\n`;
        response += `  Dépenses: ${expensesChange > 0 ? '+' : ''}${expensesChange.toFixed(1)}% (${prevExpenses.toFixed(2)}€ → ${totalExpenses.toFixed(2)}€)\n`;
      } catch (e) {
        // Pas de données année précédente
      }
    }

    return JSON.stringify({ direct_response: response });

  } catch (error: any) {
    console.error('❌ Erreur get_year_summary:', error);
    return `❌ Erreur lors du résumé annuel: ${error.message}`;
  }
}

/**
 * Comparer 2 périodes personnalisées
 */
export async function comparePeriods(
  bankClient: BankClient,
  period1_start: string,
  period1_end: string,
  period2_start: string,
  period2_end: string
): Promise<string> {
  try {
    // Fonction helper pour parser les dates
    const parseDate = (dateStr: string): Date => {
      // Format YYYY-MM-DD
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        return new Date(dateStr);
      }

      // Format "janvier 2025"
      const monthMap: { [key: string]: number } = {
        'janvier': 0, 'février': 1, 'mars': 2, 'avril': 3,
        'mai': 4, 'juin': 5, 'juillet': 6, 'août': 7,
        'septembre': 8, 'octobre': 9, 'novembre': 10, 'décembre': 11,
      };

      const parts = dateStr.toLowerCase().split(' ');
      if (parts.length === 2) {
        const month = monthMap[parts[0]];
        const year = parseInt(parts[1]);
        if (month !== undefined && !isNaN(year)) {
          return new Date(year, month, 1);
        }
      }

      throw new Error(`Format de date invalide: ${dateStr}`);
    };

    // Parser les dates
    const p1Start = parseDate(period1_start);
    const p1End = parseDate(period1_end);
    const p2Start = parseDate(period2_start);
    const p2End = parseDate(period2_end);

    // S'assurer que les dates de fin sont à 23:59:59
    p1End.setHours(23, 59, 59, 999);
    p2End.setHours(23, 59, 59, 999);

    // Récupérer les transactions des 2 périodes
    const txPeriod1 = await bankClient.getTransactionsByPeriod(p1Start, p1End);
    const txPeriod2 = await bankClient.getTransactionsByPeriod(p2Start, p2End);

    // Calculer les métriques pour chaque période
    const analyzePeriod = (transactions: any[]) => {
      const revenues = transactions.filter(t => t.type === 'Credit');
      const expenses = transactions.filter(t => t.type === 'Debit');

      const revenueTotal = revenues.reduce((sum, t) => sum + Math.abs(t.amount), 0);
      const expenseTotal = expenses.reduce((sum, t) => sum + Math.abs(t.amount), 0);

      return {
        revenue: revenueTotal,
        expenses: expenseTotal,
        netBalance: revenueTotal - expenseTotal,
        txCount: transactions.length,
      };
    };

    const period1 = analyzePeriod(txPeriod1);
    const period2 = analyzePeriod(txPeriod2);

    // Calculer les changements
    const revenueChange = period1.revenue - period2.revenue;
    const revenueChangePercent = period2.revenue > 0 ? (revenueChange / period2.revenue * 100) : 0;

    const expensesChange = period1.expenses - period2.expenses;
    const expensesChangePercent = period2.expenses > 0 ? (expensesChange / period2.expenses * 100) : 0;

    const netChange = period1.netBalance - period2.netBalance;

    // Construire la réponse
    let response = `📊 Comparaison de périodes\n`;
    response += `${'='.repeat(30)}\n\n`;

    response += `📅 Période 1: ${p1Start.toLocaleDateString('fr-FR')} → ${p1End.toLocaleDateString('fr-FR')}\n`;
    response += `📅 Période 2: ${p2Start.toLocaleDateString('fr-FR')} → ${p2End.toLocaleDateString('fr-FR')}\n\n`;

    response += `💰 Recettes:\n`;
    response += `  P1: ${period1.revenue.toFixed(2)}€\n`;
    response += `  P2: ${period2.revenue.toFixed(2)}€\n`;
    response += `  📈 Évolution: ${revenueChange >= 0 ? '+' : ''}${revenueChange.toFixed(2)}€ (${revenueChangePercent >= 0 ? '+' : ''}${revenueChangePercent.toFixed(1)}%)\n\n`;

    response += `💸 Dépenses:\n`;
    response += `  P1: ${period1.expenses.toFixed(2)}€\n`;
    response += `  P2: ${period2.expenses.toFixed(2)}€\n`;
    response += `  📉 Évolution: ${expensesChange >= 0 ? '+' : ''}${expensesChange.toFixed(2)}€ (${expensesChangePercent >= 0 ? '+' : ''}${expensesChangePercent.toFixed(1)}%)\n\n`;

    response += `💵 Solde net:\n`;
    response += `  P1: ${period1.netBalance >= 0 ? '+' : ''}${period1.netBalance.toFixed(2)}€\n`;
    response += `  P2: ${period2.netBalance >= 0 ? '+' : ''}${period2.netBalance.toFixed(2)}€\n`;
    response += `  📊 Évolution: ${netChange >= 0 ? '+' : ''}${netChange.toFixed(2)}€\n\n`;

    response += `📈 Transactions:\n`;
    response += `  P1: ${period1.txCount} transactions\n`;
    response += `  P2: ${period2.txCount} transactions\n`;

    // Résumé
    response += `\n🎯 Résumé:\n`;
    if (revenueChange > 0) response += `  ✅ Recettes en hausse de ${revenueChangePercent.toFixed(1)}%\n`;
    else if (revenueChange < 0) response += `  ⚠️ Recettes en baisse de ${Math.abs(revenueChangePercent).toFixed(1)}%\n`;

    if (expensesChange > 0) response += `  ⚠️ Dépenses en hausse de ${expensesChangePercent.toFixed(1)}%\n`;
    else if (expensesChange < 0) response += `  ✅ Dépenses en baisse de ${Math.abs(expensesChangePercent).toFixed(1)}%\n`;

    if (netChange > 0) response += `  ✅ Solde net amélioré de ${netChange.toFixed(2)}€`;
    else if (netChange < 0) response += `  ⚠️ Solde net dégradé de ${Math.abs(netChange).toFixed(2)}€`;

    return JSON.stringify({ direct_response: response });

  } catch (error: any) {
    console.error('❌ Erreur compare_periods:', error);
    return `❌ Erreur lors de la comparaison: ${error.message}`;
  }
}

/**
 * Rapport trimestriel (Q1-Q4)
 */
export async function getQuarterlyReport(
  bankClient: BankClient,
  billitClient: BillitClient,
  quarter: number,
  year?: string,
  compare_previous: boolean = true
): Promise<string> {
  try {
    if (quarter < 1 || quarter > 4) {
      return `❌ Trimestre invalide: ${quarter}. Utilisez 1, 2, 3 ou 4.`;
    }

    const targetYear = year ? parseInt(year) : new Date().getFullYear();

    // Définir les mois du trimestre
    const quarterMonths = {
      1: { start: 0, end: 2, label: 'Q1 (jan-mar)' },   // Janvier-Mars
      2: { start: 3, end: 5, label: 'Q2 (avr-jun)' },   // Avril-Juin
      3: { start: 6, end: 8, label: 'Q3 (jul-sep)' },   // Juillet-Septembre
      4: { start: 9, end: 11, label: 'Q4 (oct-déc)' }  // Octobre-Décembre
    };

    const q = quarterMonths[quarter as keyof typeof quarterMonths];
    const startDate = new Date(targetYear, q.start, 1);
    const endDate = new Date(targetYear, q.end + 1, 0, 23, 59, 59);

    // Récupérer les transactions
    const transactions = await bankClient.getTransactionsByPeriod(startDate, endDate);

    const revenues = transactions.filter(t => t.type === 'Credit');
    const expenses = transactions.filter(t => t.type === 'Debit');

    const totalRevenue = revenues.reduce((sum, t) => sum + Math.abs(t.amount), 0);
    const totalExpenses = expenses.reduce((sum, t) => sum + Math.abs(t.amount), 0);
    const netBalance = totalRevenue - totalExpenses;

    // Top 5 fournisseurs du trimestre
    const supplierMap = new Map<string, number>();
    expenses.forEach(t => {
      const supplier = t.description.split(' ')[0].toUpperCase();
      supplierMap.set(supplier, (supplierMap.get(supplier) || 0) + Math.abs(t.amount));
    });

    const topSuppliers = Array.from(supplierMap.entries())
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);

    // Construire la réponse
    let response = `📊 Rapport ${q.label} ${targetYear}\n`;
    response += `${'='.repeat(30)}\n\n`;

    response += `💰 Finances:\n`;
    response += `  📈 Recettes: ${totalRevenue.toFixed(2)}€ (${revenues.length} tx)\n`;
    response += `  📉 Dépenses: ${totalExpenses.toFixed(2)}€ (${expenses.length} tx)\n`;
    response += `  💵 Solde net: ${netBalance >= 0 ? '+' : ''}${netBalance.toFixed(2)}€\n\n`;

    response += `🏆 Top 5 fournisseurs:\n`;
    topSuppliers.forEach((s, i) => {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
      const percent = (s.amount / totalExpenses * 100).toFixed(1);
      response += `  ${medal} ${s.name}: ${s.amount.toFixed(2)}€ (${percent}%)\n`;
    });

    // Comparaison avec trimestre précédent
    if (compare_previous) {
      let prevQuarter = quarter - 1;
      let prevYear = targetYear;

      if (prevQuarter === 0) {
        prevQuarter = 4;
        prevYear -= 1;
      }

      const prevQ = quarterMonths[prevQuarter as keyof typeof quarterMonths];
      const prevStart = new Date(prevYear, prevQ.start, 1);
      const prevEnd = new Date(prevYear, prevQ.end + 1, 0, 23, 59, 59);

      try {
        const prevTransactions = await bankClient.getTransactionsByPeriod(prevStart, prevEnd);
        const prevRevenue = prevTransactions.filter(t => t.type === 'Credit').reduce((sum, t) => sum + Math.abs(t.amount), 0);
        const prevExpenses = prevTransactions.filter(t => t.type === 'Debit').reduce((sum, t) => sum + Math.abs(t.amount), 0);

        const revenueChange = ((totalRevenue - prevRevenue) / prevRevenue * 100);
        const expensesChange = ((totalExpenses - prevExpenses) / prevExpenses * 100);

        response += `\n📊 Évolution vs ${prevQ.label} ${prevYear}:\n`;
        response += `  Recettes: ${revenueChange > 0 ? '+' : ''}${revenueChange.toFixed(1)}%\n`;
        response += `  Dépenses: ${expensesChange > 0 ? '+' : ''}${expensesChange.toFixed(1)}%\n`;
      } catch (e) {
        // Pas de données trimestre précédent
      }
    }

    return JSON.stringify({ direct_response: response });

  } catch (error: any) {
    console.error('❌ Erreur get_quarterly_report:', error);
    return `❌ Erreur lors du rapport trimestriel: ${error.message}`;
  }
}
