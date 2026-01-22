/**
 * Index des outils IA - Exporte tous les outils disponibles
 *
 * @module AITools
 * @category AI Tools
 */

import { invoiceTools } from './invoice-tools';
import { transactionTools } from './transaction-tools';
import { employeeTools } from './employee-tools';
import { supplierTools } from './supplier-tools';
import { userTools } from './user-tools';
import { systemTools } from './system-tools';
import { aggregationTools } from './aggregation-tools';
import { analyticsTools } from './analytics-tools';
import { alertTools } from './alert-tools';

/**
 * Tous les outils IA disponibles (53 outils au total)
 *
 * Catégories:
 * - Factures: 12 outils
 * - Transactions: 9 outils
 * - Employés: 5 outils
 * - Fournisseurs: 15 outils (12+3 nouveaux)
 * - Agrégation: 3 outils
 * - Analytique: 4 outils (prédictions, anomalies, tendances, export)
 * - Utilisateurs: 3 outils
 * - Système: 1 outil
 * - Alertes: 3 outils (🚀 NOUVEAU - OUTIL 10)
 */
export const allTools = [
  ...invoiceTools,
  ...transactionTools,
  ...employeeTools,
  ...supplierTools,
  ...aggregationTools,
  ...analyticsTools,
  ...userTools,
  ...systemTools,
  ...alertTools,
];

// Exports individuels pour utilisation sélective
export { invoiceTools } from './invoice-tools';
export { transactionTools } from './transaction-tools';
export { employeeTools } from './employee-tools';
export { supplierTools } from './supplier-tools';
export { aggregationTools } from './aggregation-tools';
export { analyticsTools } from './analytics-tools';
export { userTools } from './user-tools';
export { systemTools } from './system-tools';
export { alertTools } from './alert-tools';
