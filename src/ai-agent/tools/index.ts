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

/**
 * Tous les outils IA disponibles (39 outils au total)
 *
 * Catégories:
 * - Factures: 11 outils
 * - Transactions: 9 outils
 * - Employés: 5 outils
 * - Fournisseurs: 12 outils
 * - Utilisateurs: 3 outils
 * - Système: 1 outil
 */
export const allTools = [
  ...invoiceTools,
  ...transactionTools,
  ...employeeTools,
  ...supplierTools,
  ...userTools,
  ...systemTools,
];

// Exports individuels pour utilisation sélective
export { invoiceTools } from './invoice-tools';
export { transactionTools } from './transaction-tools';
export { employeeTools } from './employee-tools';
export { supplierTools } from './supplier-tools';
export { userTools } from './user-tools';
export { systemTools } from './system-tools';
