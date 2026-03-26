/**
 * Index des executors - dispatch vers les modules spécialisés
 */
export type { ExecutorContext, ExecutorHelpers, ExecutorFunction } from './types';
export { executeAnalyticsFunction } from './analytics-executor';
export { executeAdminFunction } from './admin-executor';
export { executeInvoiceFunction } from './invoice-executor';
export { executeTransactionFunction } from './transaction-executor';
export { executeEmployeeFunction } from './employee-executor';
export { executeSupplierFunction } from './supplier-executor';
export { executeMiscFunction } from './misc-executor';
