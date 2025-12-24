import { config } from '../config';
import { containsSuspiciousContent } from './security';

/**
 * Module de validation des entrées utilisateur
 */

export interface ValidationResult {
  valid: boolean;
  error?: string;
  sanitized?: string;
}

/**
 * Valide et sanitise une entrée utilisateur générique
 */
export function validateUserInput(
  input: string,
  options?: {
    maxLength?: number;
    allowEmpty?: boolean;
    fieldName?: string;
  }
): ValidationResult {
  const maxLength = options?.maxLength || config.security.maxInputLength;
  const allowEmpty = options?.allowEmpty ?? false;
  const fieldName = options?.fieldName || 'Input';

  // Vérifier si vide
  if (!input || input.trim().length === 0) {
    if (!allowEmpty) {
      return {
        valid: false,
        error: `${fieldName} ne peut pas être vide`,
      };
    }
    return { valid: true, sanitized: '' };
  }

  // Vérifier la longueur
  if (input.length > maxLength) {
    return {
      valid: false,
      error: `${fieldName} est trop long (maximum ${maxLength} caractères)`,
    };
  }

  // Vérifier le contenu suspect
  if (containsSuspiciousContent(input)) {
    return {
      valid: false,
      error: `${fieldName} contient des caractères non autorisés`,
    };
  }

  // Sanitiser l'input (trim + remove null bytes)
  const sanitized = input.trim().replace(/\0/g, '');

  return { valid: true, sanitized };
}

/**
 * Valide un nom de fournisseur
 */
export function validateSupplierName(name: string): ValidationResult {
  const result = validateUserInput(name, {
    maxLength: 100,
    allowEmpty: false,
    fieldName: 'Nom du fournisseur',
  });

  if (!result.valid) {
    return result;
  }

  // Vérifier que le nom contient au moins un caractère alphanumérique
  if (!/[a-zA-Z0-9]/.test(result.sanitized!)) {
    return {
      valid: false,
      error: 'Le nom du fournisseur doit contenir au moins une lettre ou un chiffre',
    };
  }

  return result;
}

/**
 * Valide un numéro de facture
 */
export function validateInvoiceNumber(invoiceNumber: string): ValidationResult {
  const result = validateUserInput(invoiceNumber, {
    maxLength: 50,
    allowEmpty: false,
    fieldName: 'Numéro de facture',
  });

  if (!result.valid) {
    return result;
  }

  // Vérifier le format (lettres, chiffres, tirets, underscores seulement)
  if (!/^[a-zA-Z0-9\-_\s]+$/.test(result.sanitized!)) {
    return {
      valid: false,
      error: 'Le numéro de facture ne peut contenir que des lettres, chiffres, tirets et espaces',
    };
  }

  return result;
}

/**
 * Valide un terme de recherche
 */
export function validateSearchTerm(searchTerm: string): ValidationResult {
  return validateUserInput(searchTerm, {
    maxLength: 200,
    allowEmpty: false,
    fieldName: 'Terme de recherche',
  });
}

/**
 * Valide une date au format YYYY-MM-DD, DD/MM/YYYY ou DD-MM-YYYY
 */
export function validateDate(dateStr: string): ValidationResult {
  const result = validateUserInput(dateStr, {
    maxLength: 10,
    allowEmpty: false,
    fieldName: 'Date',
  });

  if (!result.valid) {
    return result;
  }

  // Vérifier le format
  const formats = [
    /^\d{4}-\d{1,2}-\d{1,2}$/,  // YYYY-MM-DD
    /^\d{1,2}\/\d{1,2}\/\d{4}$/, // DD/MM/YYYY
    /^\d{1,2}-\d{1,2}-\d{4}$/,   // DD-MM-YYYY
  ];

  const matchesFormat = formats.some(format => format.test(result.sanitized!));

  if (!matchesFormat) {
    return {
      valid: false,
      error: 'Format de date invalide. Utilisez YYYY-MM-DD, DD/MM/YYYY ou DD-MM-YYYY',
    };
  }

  // Tenter de parser la date pour vérifier qu'elle est valide
  const parsed = parseDate(result.sanitized!);
  if (!parsed) {
    return {
      valid: false,
      error: 'Date invalide',
    };
  }

  return result;
}

/**
 * Parse une date depuis différents formats
 */
function parseDate(dateStr: string): Date | null {
  // Format: YYYY-MM-DD
  let match = dateStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) {
    const date = new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
    return isValidDate(date) ? date : null;
  }

  // Format: DD/MM/YYYY
  match = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) {
    const date = new Date(parseInt(match[3]), parseInt(match[2]) - 1, parseInt(match[1]));
    return isValidDate(date) ? date : null;
  }

  // Format: DD-MM-YYYY
  match = dateStr.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (match) {
    const date = new Date(parseInt(match[3]), parseInt(match[2]) - 1, parseInt(match[1]));
    return isValidDate(date) ? date : null;
  }

  return null;
}

/**
 * Vérifie si une date est valide
 */
function isValidDate(date: Date): boolean {
  return date instanceof Date && !isNaN(date.getTime());
}

/**
 * Valide un tableau d'arguments de commande
 */
export function validateCommandArgs(
  args: string[],
  options?: {
    minArgs?: number;
    maxArgs?: number;
    commandName?: string;
  }
): ValidationResult {
  const minArgs = options?.minArgs ?? 0;
  const maxArgs = options?.maxArgs ?? 10;
  const commandName = options?.commandName || 'Commande';

  // Vérifier le nombre d'arguments
  if (args.length < minArgs) {
    return {
      valid: false,
      error: `${commandName} nécessite au moins ${minArgs} argument(s)`,
    };
  }

  if (args.length > maxArgs) {
    return {
      valid: false,
      error: `${commandName} accepte au maximum ${maxArgs} argument(s)`,
    };
  }

  // Valider chaque argument
  for (let i = 0; i < args.length; i++) {
    const argValidation = validateUserInput(args[i], {
      maxLength: config.security.maxInputLength,
      allowEmpty: false,
      fieldName: `Argument ${i + 1}`,
    });

    if (!argValidation.valid) {
      return argValidation;
    }
  }

  return { valid: true };
}

/**
 * Sanitise un tableau d'arguments
 */
export function sanitizeArgs(args: string[]): string[] {
  return args.map(arg => {
    const validation = validateUserInput(arg, { allowEmpty: true });
    return validation.sanitized || arg.trim();
  });
}
