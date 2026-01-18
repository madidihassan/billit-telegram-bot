/**
 * Implémentations des outils de prévision, détection d'anomalies et exports
 * PHASE 3 + 4 : Rendre le bot prédictif et permettre l'export de données
 *
 * @module PredictiveAnalytics
 * @category AI Implementations
 */

import { BankClient } from '../../bank-client';
import { BillitClient } from '../../billit-client';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Prédire les dépenses du mois prochain
 */
export async function predictNextMonth(
  bankClient: BankClient,
  category: string = 'total',
  history_months: number = 6
): Promise<string> {
  try {
    const currentDate = new Date();
    const endMonth = currentDate.getMonth() + 1;
    const endYear = currentDate.getFullYear();

    // Récupérer les dépenses des N derniers mois
    const monthlyExpenses: number[] = [];

    for (let i = history_months - 1; i >= 0; i--) {
      let targetMonth = endMonth - i;
      let targetYear = endYear;

      if (targetMonth <= 0) {
        targetMonth += 12;
        targetYear -= 1;
      }

      const startDate = new Date(targetYear, targetMonth - 1, 1);
      const endDate = new Date(targetYear, targetMonth, 0, 23, 59, 59);
      const transactions = await bankClient.getTransactionsByPeriod(startDate, endDate);

      const expenses = transactions.filter(t => t.type === 'Debit');
      const total = expenses.reduce((sum, t) => sum + Math.abs(t.amount), 0);

      monthlyExpenses.push(total);
    }

    // Calculer la moyenne
    const avgExpenses = monthlyExpenses.reduce((sum, e) => sum + e, 0) / monthlyExpenses.length;

    // Calculer la tendance (régression linéaire simple)
    const n = monthlyExpenses.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;

    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += monthlyExpenses[i];
      sumXY += i * monthlyExpenses[i];
      sumX2 += i * i;
    }

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // Prédiction pour le mois prochain (index = n)
    const prediction = intercept + slope * n;

    // Calculer l'écart-type pour la confiance
    const variance = monthlyExpenses.reduce((sum, e) => sum + Math.pow(e - avgExpenses, 2), 0) / n;
    const stdDev = Math.sqrt(variance);
    const confidence = Math.max(0, Math.min(100, 100 - (stdDev / avgExpenses * 100)));

    // Déterminer la tendance
    const trend = slope > avgExpenses * 0.05 ? 'hausse' : slope < -avgExpenses * 0.05 ? 'baisse' : 'stable';
    const trendIcon = trend === 'hausse' ? '📈' : trend === 'baisse' ? '📉' : '➡️';

    // Construire la réponse
    let response = `🔮 Prévision: Mois prochain\n`;
    response += `Catégorie: ${category}\n`;
    response += `Historique: ${history_months} derniers mois\n\n`;

    response += `💰 Prédiction:\n`;
    response += `  Dépenses estimées: ${prediction.toFixed(2)}€\n`;
    response += `  Fourchette: ${(prediction - stdDev).toFixed(2)}€ - ${(prediction + stdDev).toFixed(2)}€\n`;
    response += `  Confiance: ${confidence.toFixed(0)}%\n\n`;

    response += `📊 Analyse:\n`;
    response += `  Moyenne historique: ${avgExpenses.toFixed(2)}€\n`;
    response += `  Tendance: ${trendIcon} ${trend}\n`;
    response += `  Variation vs moyenne: ${((prediction - avgExpenses) / avgExpenses * 100).toFixed(1)}%\n\n`;

    response += `📈 Historique (${history_months} mois):\n`;
    const maxExpense = Math.max(...monthlyExpenses);
    monthlyExpenses.forEach((expense, i) => {
      const barLength = Math.round((expense / maxExpense) * 15);
      const bar = '█'.repeat(barLength) + '░'.repeat(15 - barLength);
      response += `  M-${history_months - i}: ${bar} ${expense.toFixed(0)}€\n`;
    });

    return JSON.stringify({ direct_response: response });

  } catch (error: any) {
    console.error('❌ Erreur predict_next_month:', error);
    return `❌ Erreur lors de la prédiction: ${error.message}`;
  }
}

/**
 * Détecter les anomalies dans les transactions
 */
export async function detectAnomalies(
  bankClient: BankClient,
  period_days: number = 30,
  threshold_percent: number = 50
): Promise<string> {
  try {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - period_days);

    // Récupérer les transactions de la période
    const transactions = await bankClient.getTransactionsByPeriod(startDate, endDate);

    // Grouper par fournisseur/bénéficiaire
    const supplierMap = new Map<string, number[]>();
    transactions
      .filter(t => t.type === 'Debit')
      .forEach(t => {
        const supplier = t.description.split(' ')[0].toUpperCase();
        const amounts = supplierMap.get(supplier) || [];
        amounts.push(Math.abs(t.amount));
        supplierMap.set(supplier, amounts);
      });

    // Détecter les anomalies
    const anomalies: Array<{ supplier: string; amount: number; avgAmount: number; deviation: number }> = [];

    for (const [supplier, amounts] of supplierMap.entries()) {
      if (amounts.length < 2) continue; // Besoin d'au moins 2 transactions

      const avg = amounts.reduce((sum, a) => sum + a, 0) / amounts.length;
      const lastAmount = amounts[amounts.length - 1];
      const deviation = Math.abs((lastAmount - avg) / avg * 100);

      if (deviation > threshold_percent) {
        anomalies.push({ supplier, amount: lastAmount, avgAmount: avg, deviation });
      }
    }

    // Trier par déviation décroissante
    anomalies.sort((a, b) => b.deviation - a.deviation);

    // Construire la réponse
    let response = `🔍 Détection d'anomalies\n`;
    response += `Période: ${period_days} derniers jours\n`;
    response += `Seuil: ${threshold_percent}%\n\n`;

    if (anomalies.length === 0) {
      response += `✅ Aucune anomalie détectée\n`;
      response += `Toutes les transactions sont dans les normes habituelles.`;
    } else {
      response += `⚠️ ${anomalies.length} anomalie(s) détectée(s):\n\n`;

      anomalies.forEach((a, i) => {
        response += `${i + 1}. ${a.supplier}\n`;
        response += `   Montant: ${a.amount.toFixed(2)}€\n`;
        response += `   Moyenne habituelle: ${a.avgAmount.toFixed(2)}€\n`;
        response += `   Déviation: ${a.deviation.toFixed(0)}% ${a.amount > a.avgAmount ? '📈 (hausse)' : '📉 (baisse)'}\n\n`;
      });

      response += `💡 Recommandation: Vérifiez ces transactions inhabituelles.`;
    }

    return JSON.stringify({ direct_response: response });

  } catch (error: any) {
    console.error('❌ Erreur detect_anomalies:', error);
    return `❌ Erreur lors de la détection: ${error.message}`;
  }
}

/**
 * Analyser les tendances globales
 */
export async function analyzeTrends(
  bankClient: BankClient,
  period_months: number = 6,
  include_forecast: boolean = true
): Promise<string> {
  try {
    const currentDate = new Date();
    const endMonth = currentDate.getMonth() + 1;
    const endYear = currentDate.getFullYear();

    // Récupérer les données mensuelles
    const monthlyData: Array<{ month: string; revenues: number; expenses: number }> = [];

    for (let i = period_months - 1; i >= 0; i--) {
      let targetMonth = endMonth - i;
      let targetYear = endYear;

      if (targetMonth <= 0) {
        targetMonth += 12;
        targetYear -= 1;
      }

      const monthName = new Date(targetYear, targetMonth - 1).toLocaleString('fr-FR', { month: 'short' });
      const startDate = new Date(targetYear, targetMonth - 1, 1);
      const endDate = new Date(targetYear, targetMonth, 0, 23, 59, 59);
      const transactions = await bankClient.getTransactionsByPeriod(startDate, endDate);

      const revenues = transactions.filter(t => t.type === 'Credit').reduce((sum, t) => sum + Math.abs(t.amount), 0);
      const expenses = transactions.filter(t => t.type === 'Debit').reduce((sum, t) => sum + Math.abs(t.amount), 0);

      monthlyData.push({ month: `${monthName} ${targetYear}`, revenues, expenses });
    }

    // Calculer les tendances
    const avgRevenues = monthlyData.reduce((sum, m) => sum + m.revenues, 0) / monthlyData.length;
    const avgExpenses = monthlyData.reduce((sum, m) => sum + m.expenses, 0) / monthlyData.length;

    // Trouver le premier mois avec des données (non-nul) pour le calcul de croissance
    const firstNonZeroIndex = monthlyData.findIndex(m => m.revenues > 0 || m.expenses > 0);
    const lastIndex = monthlyData.length - 1;

    // Si aucun mois avec données ou un seul mois, croissance = 0
    let revenueGrowth = 0;
    let expenseGrowth = 0;
    let monthlyRevenueGrowth = 0;
    let monthlyExpenseGrowth = 0;

    if (firstNonZeroIndex !== -1 && firstNonZeroIndex !== lastIndex) {
      const firstRevenue = monthlyData[firstNonZeroIndex].revenues || 1; // Éviter division par 0
      const firstExpense = monthlyData[firstNonZeroIndex].expenses || 1;
      const lastRevenue = monthlyData[lastIndex].revenues;
      const lastExpense = monthlyData[lastIndex].expenses;

      revenueGrowth = ((lastRevenue - firstRevenue) / firstRevenue * 100);
      expenseGrowth = ((lastExpense - firstExpense) / firstExpense * 100);

      // Taux de croissance mensuel moyen (sur la période avec données)
      const periodWithData = lastIndex - firstNonZeroIndex;
      monthlyRevenueGrowth = periodWithData > 0 ? revenueGrowth / periodWithData : 0;
      monthlyExpenseGrowth = periodWithData > 0 ? expenseGrowth / periodWithData : 0;
    }

    // Construire la réponse
    let response = `📊 Analyse de tendances\n`;
    response += `Période: ${period_months} derniers mois\n\n`;

    response += `💰 Recettes:\n`;
    response += `  Moyenne: ${avgRevenues.toFixed(2)}€/mois\n`;
    response += `  Tendance: ${revenueGrowth >= 0 ? '+' : ''}${revenueGrowth.toFixed(1)}% sur période\n`;
    response += `  Croissance mensuelle: ${monthlyRevenueGrowth >= 0 ? '+' : ''}${monthlyRevenueGrowth.toFixed(2)}%\n\n`;

    response += `💸 Dépenses:\n`;
    response += `  Moyenne: ${avgExpenses.toFixed(2)}€/mois\n`;
    response += `  Tendance: ${expenseGrowth >= 0 ? '+' : ''}${expenseGrowth.toFixed(1)}% sur période\n`;
    response += `  Croissance mensuelle: ${monthlyExpenseGrowth >= 0 ? '+' : ''}${monthlyExpenseGrowth.toFixed(2)}%\n\n`;

    response += `📈 Évolution mensuelle:\n`;
    monthlyData.forEach(m => {
      response += `  ${m.month}: R=${m.revenues.toFixed(0)}€, D=${m.expenses.toFixed(0)}€\n`;
    });

    if (include_forecast) {
      const currentRevenues = monthlyData[monthlyData.length - 1].revenues;
      const currentExpenses = monthlyData[monthlyData.length - 1].expenses;

      // Vérifier qu'il y a assez de données pour une projection
      if (firstNonZeroIndex !== -1 && (currentRevenues > 0 || currentExpenses > 0)) {
        const forecastRevenues = currentRevenues * (1 + monthlyRevenueGrowth / 100) ** 3;
        const forecastExpenses = currentExpenses * (1 + monthlyExpenseGrowth / 100) ** 3;

        response += `\n🔮 Projection +3 mois:\n`;
        response += `  Recettes: ${forecastRevenues.toFixed(2)}€\n`;
        response += `  Dépenses: ${forecastExpenses.toFixed(2)}€\n`;
        response += `  Solde net: ${(forecastRevenues - forecastExpenses).toFixed(2)}€`;
      } else {
        response += `\n🔮 Projection +3 mois:\n`;
        response += `  ⚠️ Pas assez de données pour une projection fiable`;
      }
    }

    return JSON.stringify({ direct_response: response });

  } catch (error: any) {
    console.error('❌ Erreur analyze_trends:', error);
    return `❌ Erreur lors de l'analyse: ${error.message}`;
  }
}

/**
 * Exporter des données en CSV
 */
export async function exportToCSV(
  bankClient: BankClient,
  billitClient: BillitClient,
  data_type: string,
  start_date?: string,
  end_date?: string
): Promise<string> {
  try {
    // Parser les dates (par défaut: ce mois)
    const parseDate = (dateStr?: string): Date => {
      if (!dateStr) return new Date();

      if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        return new Date(dateStr);
      }

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

      return new Date();
    };

    const startPeriod = parseDate(start_date);
    const endPeriod = parseDate(end_date);
    endPeriod.setHours(23, 59, 59, 999);

    let csvContent = '';
    let fileName = '';

    if (data_type === 'transactions') {
      const transactions = await bankClient.getTransactionsByPeriod(startPeriod, endPeriod);

      csvContent = 'Date,Description,Montant,Type\n';
      transactions.forEach(t => {
        const date = new Date(t.date).toLocaleDateString('fr-FR');
        const desc = t.description.replace(/,/g, ';'); // Échapper les virgules
        const amount = t.amount.toFixed(2);
        const type = t.amount > 0 ? 'Recette' : 'Dépense';
        csvContent += `${date},"${desc}",${amount},${type}\n`;
      });

      fileName = `transactions_${startPeriod.toISOString().split('T')[0]}_${endPeriod.toISOString().split('T')[0]}.csv`;
    }

    // Sauvegarder le fichier
    const dataDir = path.join(process.cwd(), 'data', 'exports');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const filePath = path.join(dataDir, fileName);
    fs.writeFileSync(filePath, csvContent, 'utf-8');

    return JSON.stringify({
      direct_response: `✅ Export CSV généré: ${fileName}\n\nNombre de lignes: ${csvContent.split('\n').length - 1}\nFichier sauvegardé: ${filePath}\n\n💡 Le fichier est disponible localement.`,
      file_path: filePath,
      file_name: fileName
    });

  } catch (error: any) {
    console.error('❌ Erreur export_to_csv:', error);
    return `❌ Erreur lors de l'export: ${error.message}`;
  }
}
