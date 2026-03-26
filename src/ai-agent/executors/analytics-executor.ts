/**
 * Executor pour les outils d'analytics avancées
 * Couvre: tendances fournisseurs, ranking, patterns, résumé annuel,
 * comparaisons de périodes, rapports trimestriels, prédictions, anomalies, export CSV
 */

import type { ExecutorContext, ExecutorHelpers } from './types';
import {
  analyzeSupplierTrends,
  getSupplierRanking,
  detectSupplierPatterns
} from '../implementations/supplier-analytics';
import {
  getYearSummary,
  comparePeriods,
  getQuarterlyReport
} from '../implementations/aggregation-analytics';
import {
  predictNextMonth,
  detectAnomalies,
  analyzeTrends,
  exportToCSV
} from '../implementations/predictive-analytics';

const HANDLED = new Set([
  'analyze_supplier_trends',
  'get_supplier_ranking',
  'detect_supplier_patterns',
  'get_year_summary',
  'compare_periods',
  'get_quarterly_report',
  'predict_next_month',
  'detect_anomalies',
  'analyze_trends',
  'export_to_csv',
]);

function parseResult(raw: unknown): Record<string, unknown> {
  return typeof raw === 'string' ? JSON.parse(raw) : raw as Record<string, unknown>;
}

export async function executeAnalyticsFunction(
  functionName: string,
  args: Record<string, any>,
  ctx: ExecutorContext,
  helpers: ExecutorHelpers
): Promise<string | null> {
  if (!HANDLED.has(functionName)) return null;

  let result: Record<string, unknown>;

  switch (functionName) {
    case 'analyze_supplier_trends': {
      const matched = await helpers.matchSupplierWithAI(args.supplier_name);
      result = parseResult(await analyzeSupplierTrends(ctx.bankClient, matched, args.period_months || 6, args.year));
      break;
    }

    case 'get_supplier_ranking': {
      result = parseResult(await getSupplierRanking(ctx.bankClient, args.limit || 10, args.month, args.year, args.show_evolution !== false));
      break;
    }

    case 'detect_supplier_patterns': {
      const matched = await helpers.matchSupplierWithAI(args.supplier_name);
      result = parseResult(await detectSupplierPatterns(ctx.bankClient, matched, args.period_months || 6));
      break;
    }

    case 'get_year_summary': {
      result = parseResult(await getYearSummary(ctx.bankClient, ctx.billitClient, args.year, args.include_comparison !== false));
      break;
    }

    case 'compare_periods': {
      result = parseResult(await comparePeriods(ctx.bankClient, args.period1_start, args.period1_end, args.period2_start, args.period2_end));
      break;
    }

    case 'get_quarterly_report': {
      result = parseResult(await getQuarterlyReport(ctx.bankClient, ctx.billitClient, args.quarter, args.year, args.compare_previous !== false));
      break;
    }

    case 'predict_next_month': {
      result = parseResult(await predictNextMonth(ctx.bankClient, args.category, args.history_months));
      break;
    }

    case 'detect_anomalies': {
      result = parseResult(await detectAnomalies(ctx.bankClient, args.period_days, args.threshold_percent));
      break;
    }

    case 'analyze_trends': {
      result = parseResult(await analyzeTrends(ctx.bankClient, args.period_months, args.include_forecast));
      break;
    }

    case 'export_to_csv': {
      result = parseResult(await exportToCSV(ctx.bankClient, ctx.billitClient, args.data_type, args.start_date, args.end_date));
      break;
    }

    default:
      return null;
  }

  return JSON.stringify(result, null, 2);
}
