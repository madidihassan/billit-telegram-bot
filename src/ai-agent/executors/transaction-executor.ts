/**
 * Executor pour les outils de transactions bancaires et balances.
 * Couvre: balance mensuelle, crédits mensuels, revenus multi-mois,
 * débits mensuels, soldes bancaires, résumés mensuels, dernière transaction.
 *
 * NOTE: get_period_transactions reste dans le fichier principal (ai-agent-service-v2.ts)
 * car il est complexe (~130 lignes) et pourrait nécessiter des appels cross-executor
 * à l'avenir.
 * TODO: Migrer get_period_transactions ici une fois le pattern de cross-executor établi.
 */

import type { ExecutorContext, ExecutorHelpers } from './types';

const HANDLED = new Set([
  'get_monthly_balance',
  'get_monthly_credits',
  'get_multi_month_revenues',
  'get_monthly_debits',
  'get_bank_balances',
  'get_monthly_summaries',
  'get_last_transaction',
]);

/**
 * Shared month-name-to-index map (French).
 * Used by multiple cases to parse month parameters.
 */
const MONTH_MAP: { [key: string]: number } = {
  'janvier': 0, 'fevrier': 1, 'février': 1, 'mars': 2, 'avril': 3,
  'mai': 4, 'juin': 5, 'juillet': 6, 'aout': 7, 'août': 7,
  'septembre': 8, 'octobre': 9, 'novembre': 10, 'decembre': 11, 'décembre': 11,
};

/**
 * Parse a month input (French name or numeric string) into a 0-based month index.
 * Returns -1 if the input is invalid.
 */
function parseMonthInput(monthInput: string): number {
  const lower = monthInput.toLowerCase();
  if (MONTH_MAP[lower] !== undefined) {
    return MONTH_MAP[lower];
  }
  if (!isNaN(parseInt(lower))) {
    return parseInt(lower) - 1;
  }
  return -1;
}

/**
 * Parse a YYYY-MM string into { year, month } with month 0-indexed.
 * Returns null if the format is invalid.
 */
function parseYYYYMM(monthStr: string): { year: number; month: number } | null {
  const match = monthStr.match(/^(\d{4})-(\d{1,2})$/);
  if (!match) return null;
  return { year: parseInt(match[1]), month: parseInt(match[2]) - 1 };
}

/**
 * Get the last day of the month.
 */
function getLastDayOfMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/**
 * Format a month name in French locale.
 */
function formatMonthName(year: number, month: number): string {
  const date = new Date(year, month, 1);
  return date.toLocaleDateString('fr-BE', { month: 'long', year: 'numeric' });
}

/**
 * Resolve target month and year from args, with intelligent year inference.
 * If the requested month is in the future relative to today, uses previous year.
 */
function resolveMonthYear(args: Record<string, any>, inferYear = true): {
  targetMonth: number;
  targetYear: number;
  error?: string;
} {
  if (args.month) {
    const targetMonth = parseMonthInput(args.month);
    if (targetMonth === -1) {
      return { targetMonth: -1, targetYear: -1, error: `Mois invalide: ${args.month}` };
    }

    let targetYear: number;
    if (args.year) {
      targetYear = parseInt(args.year);
    } else if (inferYear) {
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth();
      targetYear = targetMonth > currentMonth ? currentYear - 1 : currentYear;
    } else {
      targetYear = new Date().getFullYear();
    }

    return { targetMonth, targetYear };
  }

  // Default: current month/year
  const now = new Date();
  return { targetMonth: now.getMonth(), targetYear: now.getFullYear() };
}

export async function executeTransactionFunction(
  functionName: string,
  args: Record<string, any>,
  ctx: ExecutorContext,
  helpers: ExecutorHelpers
): Promise<string | null> {
  if (!HANDLED.has(functionName)) return null;

  let result: Record<string, unknown>;

  switch (functionName) {
    // ─────────────────────────────────────────────────────────────────────────
    // get_monthly_balance
    // ─────────────────────────────────────────────────────────────────────────
    case 'get_monthly_balance': {
      const { targetMonth, targetYear, error } = resolveMonthYear(args, true);
      if (error) return JSON.stringify({ error });

      const startDate = new Date(targetYear, targetMonth, 1);
      const endDate = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59);

      const transactions = await ctx.bankClient.getTransactionsByPeriod(startDate, endDate);
      const credits = transactions.filter(tx => tx.type === 'Credit');
      const debits = transactions.filter(tx => tx.type === 'Debit');
      const totalCredits = credits.reduce((sum, tx) => sum + tx.amount, 0);
      const totalDebits = debits.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
      const balance = totalCredits - totalDebits;

      result = {
        month: startDate.toLocaleDateString('fr-BE', { month: 'long', year: 'numeric' }),
        credits: totalCredits,
        debits: totalDebits,
        balance: balance,
        credit_count: credits.length,
        debit_count: debits.length,
        currency: 'EUR',
      };
      break;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // get_monthly_credits
    // ─────────────────────────────────────────────────────────────────────────
    case 'get_monthly_credits': {
      const { targetMonth, targetYear, error } = resolveMonthYear(args, false);
      if (error) return JSON.stringify({ error });

      const startDate = new Date(targetYear, targetMonth, 1);
      const endDate = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59);

      const monthCredits = await ctx.bankClient.getCredits(startDate, endDate);
      const total = monthCredits.reduce((sum, tx) => sum + tx.amount, 0);

      result = {
        month: startDate.toLocaleDateString('fr-BE', { month: 'long', year: 'numeric' }),
        total_amount: total,
        transaction_count: monthCredits.length,
        currency: 'EUR',
        top_sources: helpers.getTopSources(monthCredits),
      };
      break;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // get_multi_month_revenues
    // ─────────────────────────────────────────────────────────────────────────
    case 'get_multi_month_revenues': {
      const months = args.months as string[];

      if (!months || !Array.isArray(months) || months.length === 0) {
        return JSON.stringify({ error: 'Le paramètre months doit être un tableau non vide de mois au format YYYY-MM' });
      }

      if (months.length < 2) {
        return JSON.stringify({
          error: 'get_multi_month_revenues nécessite MINIMUM 2 mois. Pour un seul mois, utilise get_monthly_credits.',
        });
      }

      const monthlySummaries = [];
      let cumulativeRevenues = 0;
      let cumulativeCount = 0;

      for (const monthStr of months) {
        const parsed = parseYYYYMM(monthStr);
        if (!parsed) {
          return JSON.stringify({ error: `Format de mois invalide: ${monthStr}. Utiliser YYYY-MM` });
        }

        const { year, month } = parsed;
        const startDate = new Date(year, month, 1);
        const lastDay = getLastDayOfMonth(year, month);
        const endDate = new Date(year, month, lastDay, 23, 59, 59, 999);

        const credits = await ctx.bankClient.getCredits(startDate, endDate);
        const totalRevenues = credits.reduce((sum, tx) => sum + tx.amount, 0);

        monthlySummaries.push({
          month: formatMonthName(year, month),
          month_key: monthStr,
          revenues: totalRevenues,
          count: credits.length,
        });

        cumulativeRevenues += totalRevenues;
        cumulativeCount += credits.length;
      }

      let directResponse = '💰 Recettes mensuelles\n\n';

      for (const summary of monthlySummaries) {
        directResponse += `📅 ${summary.month}\n`;
        directResponse += `   💰 Recettes: ${summary.revenues.toFixed(2)}€ (${summary.count} tx)\n\n`;
      }

      directResponse += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
      directResponse += '📊 TOTAL CUMULÉ\n';
      directResponse += `   💰 Recettes totales: ${cumulativeRevenues.toFixed(2)}€\n`;
      directResponse += `   📊 Total transactions: ${cumulativeCount}`;

      result = {
        monthly_summaries: monthlySummaries,
        cumulative: {
          total_revenues: cumulativeRevenues,
          total_count: cumulativeCount,
        },
        currency: 'EUR',
        direct_response: directResponse,
      };
      break;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // get_monthly_debits
    // ─────────────────────────────────────────────────────────────────────────
    case 'get_monthly_debits': {
      const { targetMonth, targetYear, error } = resolveMonthYear(args, false);
      if (error) return JSON.stringify({ error });

      const startDate = new Date(targetYear, targetMonth, 1);
      const endDate = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59);

      const monthDebits = await ctx.bankClient.getDebits(startDate, endDate);
      const total = monthDebits.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

      result = {
        month: startDate.toLocaleDateString('fr-BE', { month: 'long', year: 'numeric' }),
        total_amount: total,
        transaction_count: monthDebits.length,
        currency: 'EUR',
        top_expenses: helpers.getTopExpenses(monthDebits),
      };
      break;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // get_bank_balances
    // ─────────────────────────────────────────────────────────────────────────
    case 'get_bank_balances': {
      const balanceService = ctx.commandHandler.getBankBalanceService();
      const balances = balanceService.getBalances();

      if (!balances) {
        return JSON.stringify({
          error: 'Les soldes ne sont pas encore initialisés',
          message: 'Demande à l\'utilisateur d\'utiliser /init_balances pour initialiser les soldes'
        });
      }

      const accounts = [];
      let total = 0;

      // Récupérer le solde réel pour chaque compte depuis l'API Billit
      for (const account of Object.values(balances.accounts)) {
        // Essayer de récupérer le solde réel depuis l'API Billit
        const realTimeBalance = await ctx.bankClient.getRealTimeBalance(account.iban);
        const finalBalance = realTimeBalance !== null ? realTimeBalance : account.balance;

        accounts.push({
          name: account.name,
          iban: account.iban,
          balance: finalBalance,
          last_update: account.lastUpdate,
          source: realTimeBalance !== null ? 'API Billit (temps réel)' : 'Cache local'
        });

        total += finalBalance;
      }

      result = {
        accounts,
        total_balance: total,
        last_global_update: balances.lastUpdate,
        currency: 'EUR'
      };
      break;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // get_monthly_summaries
    // ─────────────────────────────────────────────────────────────────────────
    case 'get_monthly_summaries': {
      const months = args.months as string[];

      if (!months || !Array.isArray(months) || months.length === 0) {
        return JSON.stringify({ error: 'Le paramètre months doit être un tableau non vide de mois au format YYYY-MM' });
      }

      // Validation : minimum 2 mois requis
      if (months.length < 2) {
        return JSON.stringify({
          error: 'get_monthly_summaries nécessite MINIMUM 2 mois. Pour un seul mois, utilise get_period_transactions.',
          hint: 'Reformule ta requête avec get_period_transactions pour obtenir les transactions d\'un seul mois.',
        });
      }

      const monthlySummaries = [];
      let cumulativeCredits = 0;
      let cumulativeDebits = 0;
      let cumulativeTransactions = 0;

      // Traiter chaque mois
      for (const monthStr of months) {
        const parsed = parseYYYYMM(monthStr);
        if (!parsed) {
          return JSON.stringify({ error: `Format de mois invalide: ${monthStr}. Utiliser YYYY-MM (ex: 2025-10)` });
        }

        const { year, month } = parsed;
        const startDate = new Date(year, month, 1);
        const lastDay = getLastDayOfMonth(year, month);
        const endDate = new Date(year, month, lastDay, 23, 59, 59, 999);

        // Récupérer les transactions pour ce mois
        const transactions = await ctx.bankClient.getTransactionsByPeriod(startDate, endDate);

        const credits = transactions.filter(tx => tx.type === 'Credit');
        const debits = transactions.filter(tx => tx.type === 'Debit');

        const totalCredits = credits.reduce((sum, tx) => sum + tx.amount, 0);
        const totalDebits = debits.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
        const balance = totalCredits - totalDebits;

        monthlySummaries.push({
          month: formatMonthName(year, month),
          month_key: monthStr,
          total_transactions: transactions.length,
          credits: {
            count: credits.length,
            total: totalCredits,
          },
          debits: {
            count: debits.length,
            total: totalDebits,
          },
          balance: balance,
        });

        cumulativeCredits += totalCredits;
        cumulativeDebits += totalDebits;
        cumulativeTransactions += transactions.length;
      }

      const cumulativeBalance = cumulativeCredits - cumulativeDebits;

      // Construire le message formaté
      let directResponse = '📊 Résumé des balances mensuelles\n\n';

      for (const summary of monthlySummaries) {
        directResponse += `📅 ${summary.month}\n`;
        directResponse += `   Total: ${summary.total_transactions} transactions\n`;
        directResponse += `   💰 Crédits: ${summary.credits.total.toFixed(2)}€ (${summary.credits.count} tx)\n`;
        directResponse += `   💸 Débits: ${summary.debits.total.toFixed(2)}€ (${summary.debits.count} tx)\n`;
        directResponse += `   📈 Balance: ${summary.balance.toFixed(2)}€\n\n`;
      }

      directResponse += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
      directResponse += '📊 TOTAL CUMULÉ\n';
      directResponse += `   Total: ${cumulativeTransactions} transactions\n`;
      directResponse += `   💰 Crédits: ${cumulativeCredits.toFixed(2)}€\n`;
      directResponse += `   💸 Débits: ${cumulativeDebits.toFixed(2)}€\n`;
      directResponse += `   📈 Balance: ${cumulativeBalance.toFixed(2)}€`;

      result = {
        monthly_summaries: monthlySummaries,
        cumulative: {
          total_transactions: cumulativeTransactions,
          total_credits: cumulativeCredits,
          total_debits: cumulativeDebits,
          balance: cumulativeBalance,
        },
        currency: 'EUR',
        direct_response: directResponse,
      };
      break;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // get_last_transaction
    // ─────────────────────────────────────────────────────────────────────────
    case 'get_last_transaction': {
      // This case was listed in the extraction spec but does not currently exist
      // in ai-agent-service-v2.ts. Placeholder for forward-compatibility.
      // TODO: Implement once the tool is added to the main service.
      return JSON.stringify({ error: 'get_last_transaction is not yet implemented' });
    }

    default:
      return null;
  }

  return JSON.stringify(result, null, 2);
}
