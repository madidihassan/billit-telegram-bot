/**
 * Winston Logger Configuration
 * Logs professionnels avec rotation automatique des fichiers
 *
 * @module Logger
 * @category Utils
 */

import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';
import { config } from '../config';

// Format personnalisé pour les logs
const customFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Format pour la console (plus lisible)
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, component, ...meta }) => {
    const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
    const componentStr = component ? `[${component}]` : '';
    return `${timestamp} ${level} ${componentStr}: ${message} ${metaStr}`;
  })
);

// Transport pour logs généraux (rotation quotidienne)
const generalLogTransport = new DailyRotateFile({
  dirname: 'logs',
  filename: 'bot-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m',
  maxFiles: '14d',
  format: customFormat,
  level: 'info',
});

// Transport pour logs d'erreurs uniquement
const errorLogTransport = new DailyRotateFile({
  dirname: 'logs',
  filename: 'error-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m',
  maxFiles: '30d',
  format: customFormat,
  level: 'error',
});

// Transport pour logs d'audit (actions sensibles)
const auditLogTransport = new DailyRotateFile({
  dirname: 'logs',
  filename: 'audit-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m',
  maxFiles: '90d', // Garder 3 mois d'audit
  format: customFormat,
  level: 'info',
});

// Logger principal
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  transports: [
    generalLogTransport,
    errorLogTransport,
    new winston.transports.Console({
      format: consoleFormat,
      level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    }),
  ],
  exitOnError: false,
});

// Logger spécifique pour les audits
export const auditLogger = winston.createLogger({
  level: 'info',
  transports: [
    auditLogTransport,
    new winston.transports.Console({
      format: consoleFormat,
    }),
  ],
  exitOnError: false,
});

/**
 * Helper pour logger avec composant
 *
 * @example
 * ```typescript
 * logInfo('Bot démarré', 'telegram-bot');
 * logError('Erreur API', error, 'billit-client');
 * ```
 */
export const logInfo = (message: string, component?: string, meta?: any) => {
  logger.info(message, { component, ...meta });
};

export const logDebug = (message: string, component?: string, meta?: any) => {
  logger.debug(message, { component, ...meta });
};

export const logWarn = (message: string, component?: string, meta?: any) => {
  logger.warn(message, { component, ...meta });
};

export const logError = (message: string, error?: any, component?: string, meta?: any) => {
  logger.error(message, {
    component,
    error: error?.message || error,
    stack: error?.stack,
    ...meta,
  });
};

/**
 * Log d'audit pour actions sensibles
 * (ajout/suppression users, factures marquées payées, etc.)
 *
 * @example
 * ```typescript
 * logAudit('Facture marquée payée', {
 *   userId: '7887749968',
 *   invoiceNumber: 'SI-12345',
 *   amount: 5903.70
 * });
 * ```
 */
export const logAudit = (action: string, meta: any) => {
  auditLogger.info(action, {
    timestamp: new Date().toISOString(),
    ...meta,
  });
};

// Créer le dossier logs s'il n'existe pas
import fs from 'fs';
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

export default logger;
