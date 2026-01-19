/**
 * Implémentations des outils d'analyse avancée pour les fournisseurs
 * PHASE 1 : Égaliser le système fournisseurs avec le système salaires
 *
 * @module SupplierAnalytics
 * @category AI Implementations
 */

import { BankClient } from '../../bank-client';
import { matchesSupplier } from '../../supplier-aliases';

interface MonthlySupplierData {
  month: string;
  year: number;
  total: number;
  count: number;
}

interface SupplierRankingItem {
  supplier: string;
  total: number;
  count: number;
  evolution?: {
    previous: number;
    change: number;
    changePercent: number;
  };
}

interface RecurringPattern {
  frequency: 'weekly' | 'biweekly' | 'monthly' | 'irregular';
  avgAmount: number;
  stdDeviation: number;
  lastAmount: number;
  isAnomaly: boolean;
}

/**
 * Analyser les tendances d'un fournisseur sur plusieurs mois
 */
export async function analyzeSupplierTrends(
  bankClient: BankClient,
  supplier_name: string,
  period_months: number = 6,
  year?: string
): Promise<string> {
  try {
    const currentDate = new Date();
    const endYear = year ? parseInt(year) : currentDate.getFullYear();
    const endMonth = currentDate.getMonth() + 1; // 1-12

    // Calculer les mois à analyser
    const monthsData: MonthlySupplierData[] = [];

    for (let i = period_months - 1; i >= 0; i--) {
      let targetMonth = endMonth - i;
      let targetYear = endYear;

      if (targetMonth <= 0) {
        targetMonth += 12;
        targetYear -= 1;
      }

      const monthName = new Date(targetYear, targetMonth - 1).toLocaleString('fr-FR', { month: 'long' });

      // Récupérer les transactions du mois
      const startDate = new Date(targetYear, targetMonth - 1, 1);
      const endDate = new Date(targetYear, targetMonth, 0, 23, 59, 59);
      const transactions = await bankClient.getTransactionsByPeriod(startDate, endDate);

      // Filtrer par fournisseur (fuzzy matching avec matchesSupplier)
      const supplierTransactions = transactions.filter(t =>
        matchesSupplier(t.description || '', supplier_name) &&
        t.amount < 0 // Débits uniquement
      );

      const total = Math.abs(supplierTransactions.reduce((sum, t) => sum + t.amount, 0));

      monthsData.push({
        month: monthName,
        year: targetYear,
        total: total,
        count: supplierTransactions.length
      });
    }

    // Calculer la tendance
    const totalFirst3 = monthsData.slice(0, 3).reduce((sum, m) => sum + m.total, 0) / 3;
    const totalLast3 = monthsData.slice(-3).reduce((sum, m) => sum + m.total, 0) / 3;
    const trend = totalLast3 - totalFirst3;
    const trendPercent = totalFirst3 > 0 ? ((trend / totalFirst3) * 100) : 0;

    // Détecter les variations significatives (>20%)
    const alerts: string[] = [];
    for (let i = 1; i < monthsData.length; i++) {
      const prev = monthsData[i - 1];
      const curr = monthsData[i];

      if (prev.total > 0) {
        const change = ((curr.total - prev.total) / prev.total) * 100;
        if (Math.abs(change) > 20) {
          const direction = change > 0 ? '📈 Hausse' : '📉 Baisse';
          alerts.push(`${direction} ${Math.abs(change).toFixed(0)}% en ${curr.month} ${curr.year}`);
        }
      }
    }

    // Construire le graphique textuel
    const maxTotal = Math.max(...monthsData.map(m => m.total));
    const graphLines = monthsData.map(m => {
      const barLength = Math.round((m.total / maxTotal) * 20);
      const bar = '█'.repeat(barLength) + '░'.repeat(20 - barLength);
      return `  ${m.month.substring(0, 4)} ${m.year}: ${bar} ${m.total.toFixed(2)}€ (${m.count} tx)`;
    });

    // Construire la réponse
    let response = `📊 Évolution: ${supplier_name}\n`;
    response += `Période: ${monthsData[0].month} ${monthsData[0].year} - ${monthsData[monthsData.length-1].month} ${monthsData[monthsData.length-1].year}\n\n`;

    response += `💰 Tendance:\n`;
    const trendIcon = trendPercent > 5 ? '📈' : trendPercent < -5 ? '📉' : '➡️';
    response += `${trendIcon} ${trendPercent > 0 ? '+' : ''}${trendPercent.toFixed(1)}% sur la période\n`;
    response += `Moyenne début: ${totalFirst3.toFixed(2)}€\n`;
    response += `Moyenne fin: ${totalLast3.toFixed(2)}€\n\n`;

    response += `📈 Graphique:\n${graphLines.join('\n')}\n`;

    if (alerts.length > 0) {
      response += `\n⚠️ Variations significatives:\n${alerts.join('\n')}`;
    }

    const totalPeriod = monthsData.reduce((sum, m) => sum + m.total, 0);
    const avgMonth = totalPeriod / monthsData.length;
    response += `\n\n💸 Total période: ${totalPeriod.toFixed(2)}€\n`;
    response += `Moyenne mensuelle: ${avgMonth.toFixed(2)}€`;

    return JSON.stringify({ direct_response: response });

  } catch (error: any) {
    console.error('❌ Erreur analyze_supplier_trends:', error);
    return `❌ Erreur lors de l'analyse des tendances: ${error.message}`;
  }
}

/**
 * Obtenir le classement des fournisseurs avec évolution
 */
export async function getSupplierRanking(
  bankClient: BankClient,
  limit: number = 10,
  month?: string,
  year?: string,
  show_evolution: boolean = true
): Promise<string> {
  try {
    const currentDate = new Date();
    const targetYear = year ? parseInt(year) : currentDate.getFullYear();
    const targetMonth = month || 'année';

    // Récupérer les transactions
    let transactions;
    if (month) {
      // Convertir le mois en dates
      const monthMap: { [key: string]: number } = {
        'janvier': 0, 'février': 1, 'mars': 2, 'avril': 3,
        'mai': 4, 'juin': 5, 'juillet': 6, 'août': 7,
        'septembre': 8, 'octobre': 9, 'novembre': 10, 'décembre': 11,
      };
      const monthIndex = monthMap[month.toLowerCase()] ?? parseInt(month) - 1;
      const startDate = new Date(targetYear, monthIndex, 1);
      const endDate = new Date(targetYear, monthIndex + 1, 0, 23, 59, 59);
      transactions = await bankClient.getTransactionsByPeriod(startDate, endDate);
    } else {
      // Toute l'année
      transactions = await bankClient.getAllTransactions();
      transactions = transactions.filter(t => {
        const txDate = new Date(t.date);
        return txDate.getFullYear() === targetYear;
      });
    }

    // 🔧 FIX BUG #24: Utiliser matchesSupplier pour identifier les fournisseurs
    // Charger la liste des fournisseurs connus depuis la BDD
    const { getAllSuppliers } = await import('../../database');
    const knownSuppliers = getAllSuppliers().map(s => s.name);

    // Grouper par fournisseur (débits uniquement)
    const supplierMap = new Map<string, { total: number; count: number }>();

    transactions
      .filter(t => t.type === 'Debit')
      .forEach(t => {
        // Trouver le fournisseur correspondant dans la liste des fournisseurs connus
        const matchedSupplier = knownSuppliers.find(supplier => 
          matchesSupplier(t.description || '', supplier)
        );

        if (matchedSupplier) {
          const existing = supplierMap.get(matchedSupplier) || { total: 0, count: 0 };
          supplierMap.set(matchedSupplier, {
            total: existing.total + Math.abs(t.amount),
            count: existing.count + 1
          });
        }
      });

    // Convertir en tableau et trier
    let ranking: SupplierRankingItem[] = Array.from(supplierMap.entries())
      .map(([supplier, data]) => ({
        supplier,
        total: data.total,
        count: data.count
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, limit);

    // Calculer l'évolution si demandé
    if (show_evolution && month) {
      // Récupérer le mois précédent
      const prevDate = new Date(targetYear, parseInt(month) - 2);
      const prevMonth = prevDate.toLocaleString('fr-FR', { month: 'long' });
      const prevYear = prevDate.getFullYear();

      const prevStartDate = new Date(prevYear, prevDate.getMonth(), 1);
      const prevEndDate = new Date(prevYear, prevDate.getMonth() + 1, 0, 23, 59, 59);
      const prevTransactions = await bankClient.getTransactionsByPeriod(prevStartDate, prevEndDate);
      const prevSupplierMap = new Map<string, number>();

      prevTransactions
        .filter(t => t.type === 'Debit')
        .forEach(t => {
          const matchedSupplier = knownSuppliers.find(supplier => 
            matchesSupplier(t.description || '', supplier)
          );
          if (matchedSupplier) {
            prevSupplierMap.set(matchedSupplier, (prevSupplierMap.get(matchedSupplier) || 0) + Math.abs(t.amount));
          }
        });

      ranking = ranking.map(item => {
        const prevTotal = prevSupplierMap.get(item.supplier) || 0;
        const change = item.total - prevTotal;
        const changePercent = prevTotal > 0 ? (change / prevTotal) * 100 : 100;

        return {
          ...item,
          evolution: {
            previous: prevTotal,
            change,
            changePercent
          }
        };
      });
    }

    // Construire la réponse
    const period = month ? `${month} ${targetYear}` : `année ${targetYear}`;
    let response = `🏆 Top ${limit} fournisseurs\n`;
    response += `Période: ${period}\n\n`;

    ranking.forEach((item, index) => {
      const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
      response += `${medal} ${item.supplier}\n`;
      response += `   💰 ${item.total.toFixed(2)}€ (${item.count} tx)\n`;

      if (item.evolution) {
        const evolutionIcon = item.evolution.change > 0 ? '📈' : item.evolution.change < 0 ? '📉' : '➡️';
        response += `   ${evolutionIcon} ${item.evolution.changePercent > 0 ? '+' : ''}${item.evolution.changePercent.toFixed(1)}%`;
        response += ` (${item.evolution.previous.toFixed(2)}€ le mois précédent)\n`;
      }
      response += '\n';
    });

    const total = ranking.reduce((sum, item) => sum + item.total, 0);
    response += `💸 Total top ${limit}: ${total.toFixed(2)}€`;

    return JSON.stringify({ direct_response: response });

  } catch (error: any) {
    console.error('❌ Erreur get_supplier_ranking:', error);
    return `❌ Erreur lors du classement: ${error.message}`;
  }
}

/**
 * Détecter les patterns de dépenses récurrentes d'un fournisseur
 */
export async function detectSupplierPatterns(
  bankClient: BankClient,
  supplier_name: string,
  period_months: number = 6
): Promise<string> {
  try {
    const currentDate = new Date();
    const endMonth = currentDate.getMonth() + 1;
    const endYear = currentDate.getFullYear();

    // Récupérer toutes les transactions sur la période
    const allTransactions: Array<{ date: Date; amount: number }> = [];

    for (let i = period_months - 1; i >= 0; i--) {
      let targetMonth = endMonth - i;
      let targetYear = endYear;

      if (targetMonth <= 0) {
        targetMonth += 12;
        targetYear -= 1;
      }

      const monthName = new Date(targetYear, targetMonth - 1).toLocaleString('fr-FR', { month: 'long' });
      const startDate = new Date(targetYear, targetMonth - 1, 1);
      const endDate = new Date(targetYear, targetMonth, 0, 23, 59, 59);
      const transactions = await bankClient.getTransactionsByPeriod(startDate, endDate);

      transactions
        .filter(t =>
          matchesSupplier(t.description || '', supplier_name) &&
          t.amount < 0
        )
        .forEach(t => {
          allTransactions.push({
            date: new Date(t.date),
            amount: Math.abs(t.amount)
          });
        });
    }

    if (allTransactions.length === 0) {
      return `❌ Aucune transaction trouvée pour ${supplier_name} sur les ${period_months} derniers mois`;
    }

    // Trier par date
    allTransactions.sort((a, b) => a.date.getTime() - b.date.getTime());

    // Calculer les intervalles entre paiements
    const intervals: number[] = [];
    for (let i = 1; i < allTransactions.length; i++) {
      const days = (allTransactions[i].date.getTime() - allTransactions[i-1].date.getTime()) / (1000 * 60 * 60 * 24);
      intervals.push(days);
    }

    // Détecter la fréquence
    const avgInterval = intervals.reduce((sum, i) => sum + i, 0) / intervals.length;
    let frequency: RecurringPattern['frequency'] = 'irregular';

    if (avgInterval >= 25 && avgInterval <= 35) frequency = 'monthly';
    else if (avgInterval >= 12 && avgInterval <= 16) frequency = 'biweekly';
    else if (avgInterval >= 5 && avgInterval <= 9) frequency = 'weekly';

    // Calculer statistiques des montants
    const amounts = allTransactions.map(t => t.amount);
    const avgAmount = amounts.reduce((sum, a) => sum + a, 0) / amounts.length;

    // Écart-type
    const variance = amounts.reduce((sum, a) => sum + Math.pow(a - avgAmount, 2), 0) / amounts.length;
    const stdDeviation = Math.sqrt(variance);

    const lastAmount = amounts[amounts.length - 1];
    const deviation = Math.abs(lastAmount - avgAmount);
    const isAnomaly = deviation > (stdDeviation * 2); // Plus de 2 écarts-types

    // Construire la réponse
    let response = `🔍 Patterns de dépenses: ${supplier_name}\n`;
    response += `Période: ${period_months} derniers mois\n\n`;

    const frequencyText = {
      weekly: '🔄 Hebdomadaire',
      biweekly: '🔄 Bi-mensuel',
      monthly: '🔄 Mensuel',
      irregular: '❓ Irrégulier'
    };

    response += `📅 Fréquence: ${frequencyText[frequency]}\n`;
    response += `Intervalle moyen: ${avgInterval.toFixed(0)} jours\n`;
    response += `Total transactions: ${allTransactions.length}\n\n`;

    response += `💰 Montants:\n`;
    response += `Moyenne: ${avgAmount.toFixed(2)}€\n`;
    response += `Min: ${Math.min(...amounts).toFixed(2)}€\n`;
    response += `Max: ${Math.max(...amounts).toFixed(2)}€\n`;
    response += `Écart-type: ${stdDeviation.toFixed(2)}€\n\n`;

    response += `📊 Dernière transaction:\n`;
    response += `Montant: ${lastAmount.toFixed(2)}€\n`;
    response += `Date: ${allTransactions[allTransactions.length-1].date.toLocaleDateString('fr-FR')}\n`;

    if (isAnomaly) {
      const deviationPercent = ((deviation / avgAmount) * 100).toFixed(0);
      response += `\n⚠️ ALERTE: Variation anormale!\n`;
      response += `Le dernier montant dévie de ${deviationPercent}% de la moyenne\n`;
      response += `Différence: ${(lastAmount - avgAmount > 0 ? '+' : '')}${(lastAmount - avgAmount).toFixed(2)}€`;
    } else {
      response += `✅ Montant dans la norme`;
    }

    // Résumé des 5 dernières transactions
    response += `\n\n📝 5 dernières transactions:\n`;
    const last5 = allTransactions.slice(-5);
    last5.forEach(t => {
      response += `  ${t.date.toLocaleDateString('fr-FR')}: ${t.amount.toFixed(2)}€\n`;
    });

    return JSON.stringify({ direct_response: response });

  } catch (error: any) {
    console.error('❌ Erreur detect_supplier_patterns:', error);
    return `❌ Erreur lors de la détection des patterns: ${error.message}`;
  }
}
