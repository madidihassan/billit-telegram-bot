/**
 * Validateur de données pour garantir la précision des réponses IA
 *
 * ⚠️ CRITIQUE: Assure que l'IA utilise TOUJOURS les vraies données
 * et ne génère JAMAIS de réponses inventées ou estimées
 *
 * @module DataValidator
 * @category Utils
 */

import { logError, logWarn, logAudit } from './logger';

/**
 * Résultat de validation
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  dataSource: 'api' | 'cache' | 'unknown';
  timestamp: number;
}

/**
 * Classe pour valider que les données sont réelles et non inventées
 */
export class DataValidator {
  /**
   * Valide qu'une réponse d'outil contient des données réelles
   */
  static validateToolResponse(
    toolName: string,
    response: any,
    expectedFields: string[]
  ): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    let dataSource: 'api' | 'cache' | 'unknown' = 'unknown';

    // 1. Vérifier que la réponse existe
    if (!response) {
      errors.push(`[${toolName}] Réponse vide ou nulle`);
      return {
        isValid: false,
        errors,
        warnings,
        dataSource,
        timestamp: Date.now(),
      };
    }

    // 2. Vérifier que la réponse n'est pas une erreur
    if (response.error || response.success === false) {
      errors.push(`[${toolName}] Erreur dans la réponse: ${response.error || response.message}`);
      return {
        isValid: false,
        errors,
        warnings,
        dataSource,
        timestamp: Date.now(),
      };
    }

    // 3. Vérifier les champs obligatoires
    for (const field of expectedFields) {
      if (!(field in response)) {
        errors.push(`[${toolName}] Champ obligatoire manquant: ${field}`);
      }
    }

    // 4. Déterminer la source des données
    if (response._fromCache) {
      dataSource = 'cache';
      warnings.push(`[${toolName}] Données provenant du cache`);
    } else if (response._fromAPI || response.count !== undefined || response.total_amount !== undefined) {
      dataSource = 'api';
    }

    // 5. Vérifier les valeurs numériques (pas de NaN, Infinity)
    this.validateNumericFields(response, errors, toolName);

    // 6. Logger les erreurs critiques
    if (errors.length > 0) {
      logError(`Validation échouée pour ${toolName}`, { errors }, 'data-validator');
    }

    // 7. Logger les warnings
    if (warnings.length > 0) {
      logWarn(`Warnings pour ${toolName}`, 'data-validator', { warnings });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      dataSource,
      timestamp: Date.now(),
    };
  }

  /**
   * Valide que les champs numériques sont valides
   */
  private static validateNumericFields(obj: any, errors: string[], toolName: string): void {
    const checkValue = (value: any, path: string) => {
      if (typeof value === 'number') {
        if (isNaN(value)) {
          errors.push(`[${toolName}] Valeur NaN détectée dans ${path}`);
        }
        if (!isFinite(value)) {
          errors.push(`[${toolName}] Valeur infinie détectée dans ${path}`);
        }
      } else if (typeof value === 'object' && value !== null) {
        for (const [key, val] of Object.entries(value)) {
          checkValue(val, `${path}.${key}`);
        }
      } else if (Array.isArray(value)) {
        value.forEach((item, index) => checkValue(item, `${path}[${index}]`));
      }
    };

    checkValue(obj, 'root');
  }

  /**
   * Valide qu'une réponse IA ne contient pas de phrases d'estimation
   *
   * ⚠️ CRITIQUE: Détecte si l'IA invente ou estime des données
   */
  static validateAIResponse(response: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Phrases interdites qui indiquent une estimation/invention
    const forbiddenPhrases = [
      /environ/i,
      /approximativement/i,
      /à peu près/i,
      /estimé/i,
      /probablement/i,
      /je pense que/i,
      /il semblerait/i,
      /selon mes estimations/i,
      /d'après mes calculs approximatifs/i,
      /je suppose/i,
    ];

    for (const phrase of forbiddenPhrases) {
      if (phrase.test(response)) {
        errors.push(`Phrase d'estimation détectée: "${response.match(phrase)?.[0]}"`);
      }
    }

    // Phrases de warning (acceptables mais suspectes)
    const warningPhrases = [
      /peut-être/i,
      /possiblement/i,
      /il se peut/i,
    ];

    for (const phrase of warningPhrases) {
      if (phrase.test(response)) {
        warnings.push(`Phrase suspecte détectée: "${response.match(phrase)?.[0]}"`);
      }
    }

    // Log si des estimations sont détectées
    if (errors.length > 0) {
      logError('IA a généré une estimation/invention', { errors, response: response.substring(0, 200) }, 'data-validator');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      dataSource: 'unknown',
      timestamp: Date.now(),
    };
  }

  /**
   * Valide que les dates sont réelles et cohérentes
   */
  static validateDates(startDate: string, endDate: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime())) {
      errors.push(`Date de début invalide: ${startDate}`);
    }

    if (isNaN(end.getTime())) {
      errors.push(`Date de fin invalide: ${endDate}`);
    }

    if (start > end) {
      errors.push(`Date de début (${startDate}) postérieure à la date de fin (${endDate})`);
    }

    // Warning si les dates sont dans le futur
    const now = new Date();
    if (end > now) {
      warnings.push(`Date de fin dans le futur: ${endDate}`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      dataSource: 'unknown',
      timestamp: Date.now(),
    };
  }

  /**
   * Valide qu'un tableau de résultats n'est pas vide
   */
  static validateNotEmpty(data: any[], context: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!Array.isArray(data)) {
      errors.push(`${context}: Attendu un tableau, reçu ${typeof data}`);
    } else if (data.length === 0) {
      warnings.push(`${context}: Aucune donnée trouvée (tableau vide)`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      dataSource: 'unknown',
      timestamp: Date.now(),
    };
  }

  /**
   * Créer un audit log pour tracer l'utilisation des données
   */
  static auditDataUsage(
    toolName: string,
    dataSource: 'api' | 'cache' | 'unknown',
    recordCount: number,
    userId?: string
  ): void {
    // Ne logger que si la source est connue
    if (dataSource !== 'unknown') {
      logAudit('Utilisation de données', {
        tool: toolName,
        source: dataSource,
        count: recordCount,
        userId,
        timestamp: new Date().toISOString(),
      });
    }
  }
}

/**
 * Middleware pour wrapper les appels d'outils avec validation
 */
export class ValidatedToolExecutor {
  /**
   * Exécute un outil et valide automatiquement sa réponse
   */
  static async executeWithValidation<T>(
    toolName: string,
    executor: () => Promise<T>,
    expectedFields: string[] = []
  ): Promise<{ data: T; validation: ValidationResult }> {
    try {
      // 1. Exécuter l'outil
      const data = await executor();

      // 2. Valider la réponse
      const validation = DataValidator.validateToolResponse(toolName, data, expectedFields);

      // 3. Si invalide, logger et throw
      if (!validation.isValid) {
        logError(`Données invalides de ${toolName}`, { validation }, 'validated-tool-executor');
        throw new Error(`Données invalides: ${validation.errors.join(', ')}`);
      }

      // 4. Auditer l'utilisation
      const recordCount = Array.isArray(data) ? data.length : (data as any)?.count || 1;
      DataValidator.auditDataUsage(toolName, validation.dataSource, recordCount);

      return { data, validation };

    } catch (error: any) {
      logError(`Erreur lors de l'exécution de ${toolName}`, error, 'validated-tool-executor');
      throw error;
    }
  }
}

/**
 * Wrapper pour garantir que l'IA utilise les outils
 */
export class AIResponseGuard {
  /**
   * Vérifie qu'une réponse IA est basée sur des données réelles
   */
  static validateResponse(
    question: string,
    aiResponse: string,
    toolsUsed: string[]
  ): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 1. Vérifier qu'au moins un outil a été utilisé
    if (toolsUsed.length === 0) {
      // Vérifier si la question nécessitait des données
      const needsData = /facture|transaction|balance|salaire|fournisseur|montant|€|euro/i.test(question);

      if (needsData) {
        errors.push('Aucun outil utilisé alors que la question nécessite des données');
      }
    }

    // 2. Vérifier que la réponse ne contient pas d'estimations
    const estimationCheck = DataValidator.validateAIResponse(aiResponse);
    errors.push(...estimationCheck.errors);
    warnings.push(...estimationCheck.warnings);

    // 3. Vérifier que la réponse contient des chiffres si attendus
    const questionExpectsNumbers = /combien|montant|total|nombre/i.test(question);
    const responseHasNumbers = /\d+[.,]?\d*\s*€|\d+\s*(factures?|transactions?)/i.test(aiResponse);

    if (questionExpectsNumbers && !responseHasNumbers) {
      warnings.push('Question attend des chiffres mais la réponse n\'en contient pas');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      dataSource: 'unknown',
      timestamp: Date.now(),
    };
  }
}
