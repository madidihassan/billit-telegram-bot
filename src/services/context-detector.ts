/**
 * Détecteur de références contextuelles dans les questions
 * Permet de comprendre "celles de décembre" après "montre les factures"
 *
 * @module ContextDetector
 * @category Services
 */

import { UserConversationContext } from './conversation-manager';
import { logDebug } from '../utils/logger';

/**
 * Type de référence contextuelle détectée
 */
export type ReferenceType = 'temporal' | 'pronoun' | 'implicit' | 'continuation';

/**
 * Résultat de la détection contextuelle
 */
export interface ContextDetectionResult {
  hasReference: boolean;
  referenceType?: ReferenceType;
  enrichedQuestion: string;
  replacements: Record<string, string>;
  confidence: number; // 0-1
}

/**
 * Détecteur de références contextuelles
 */
export class ContextDetector {

  /**
   * Détecter et résoudre les références contextuelles dans une question
   */
  detect(question: string, context: UserConversationContext): ContextDetectionResult {
    const questionLower = question.toLowerCase().trim();

    // Résultat par défaut (pas de référence)
    let result: ContextDetectionResult = {
      hasReference: false,
      enrichedQuestion: question,
      replacements: {},
      confidence: 0
    };

    // 1. Détecter les références temporelles
    const temporalResult = this.detectTemporalReferences(questionLower, context);
    if (temporalResult.hasReference && temporalResult.confidence > result.confidence) {
      result = temporalResult;
    }

    // 2. Détecter les références pronominales
    const pronominalResult = this.detectPronominalReferences(questionLower, context);
    if (pronominalResult.hasReference && pronominalResult.confidence > result.confidence) {
      result = pronominalResult;
    }

    // 3. Détecter les références implicites
    const implicitResult = this.detectImplicitReferences(questionLower, context);
    if (implicitResult.hasReference && implicitResult.confidence > result.confidence) {
      result = implicitResult;
    }

    // 4. Détecter les continuations
    const continuationResult = this.detectContinuations(questionLower, context);
    if (continuationResult.hasReference && continuationResult.confidence > result.confidence) {
      result = continuationResult;
    }

    if (result.hasReference) {
      logDebug(
        `Référence détectée: ${result.referenceType} (confiance: ${result.confidence})`,
        'context-detector'
      );
      logDebug(`Question enrichie: "${result.enrichedQuestion}"`, 'context-detector');
    }

    return result;
  }

  /**
   * Détecter les références temporelles
   * Ex: "celles de décembre" → "les factures de décembre"
   */
  private detectTemporalReferences(
    question: string,
    context: UserConversationContext
  ): ContextDetectionResult {
    const patterns = [
      /(?:celles?|ceux)\s+(?:de|du|d')\s*(\w+)/i,  // "celles de décembre"
      /(?:pour|de)\s+(?:ce|cette)\s+(mois|année|semaine)/i,  // "pour ce mois"
      /(?:du|de)\s+mois\s+(?:de|d')\s*(\w+)/i,  // "du mois de janvier"
    ];

    for (const pattern of patterns) {
      const match = question.match(pattern);
      if (match) {
        // Essayer de récupérer le sujet du contexte
        const subject = this.getSubjectFromIntent(context.lastIntent);

        if (subject) {
          const temporal = match[1] || match[0];
          const enriched = `${subject} ${temporal}`;

          return {
            hasReference: true,
            referenceType: 'temporal',
            enrichedQuestion: question.replace(pattern, enriched),
            replacements: { [match[0]]: enriched },
            confidence: 0.9
          };
        }
      }
    }

    return {
      hasReference: false,
      enrichedQuestion: question,
      replacements: {},
      confidence: 0
    };
  }

  /**
   * Détecter les références pronominales
   * Ex: "les mêmes" → "les mêmes factures qu'avant"
   */
  private detectPronominalReferences(
    question: string,
    context: UserConversationContext
  ): ContextDetectionResult {
    const patterns = [
      /^(?:les?\s+)?mêmes?$/i,  // "les mêmes"
      /^encore$/i,              // "encore"
      /^aussi$/i,               // "aussi"
      /^pareil$/i,              // "pareil"
    ];

    for (const pattern of patterns) {
      if (pattern.test(question)) {
        const subject = this.getSubjectFromIntent(context.lastIntent);
        const entities = context.lastEntities?.join(' ') || '';

        if (subject) {
          const enriched = entities
            ? `${subject} ${entities}`
            : subject;

          return {
            hasReference: true,
            referenceType: 'pronoun',
            enrichedQuestion: enriched,
            replacements: { [question]: enriched },
            confidence: 0.85
          };
        }
      }
    }

    return {
      hasReference: false,
      enrichedQuestion: question,
      replacements: {},
      confidence: 0
    };
  }

  /**
   * Détecter les références implicites
   * Ex: "et de novembre?" → "et les factures de novembre?"
   */
  private detectImplicitReferences(
    question: string,
    context: UserConversationContext
  ): ContextDetectionResult {
    const patterns = [
      /^et\s+(?:de|du|d')\s*(\w+)\s*\??$/i,  // "et de décembre?"
      /^puis\s+(?:de|du|d')\s*(\w+)\s*\??$/i,  // "puis de novembre?"
      /^(?:de|du|d')\s*(\w+)\s*aussi\s*\??$/i,  // "de octobre aussi?"
    ];

    for (const pattern of patterns) {
      const match = question.match(pattern);
      if (match) {
        const subject = this.getSubjectFromIntent(context.lastIntent);

        if (subject) {
          const temporal = match[1];
          const enriched = `${subject} de ${temporal}`;

          return {
            hasReference: true,
            referenceType: 'implicit',
            enrichedQuestion: enriched,
            replacements: { [question]: enriched },
            confidence: 0.8
          };
        }
      }
    }

    return {
      hasReference: false,
      enrichedQuestion: question,
      replacements: {},
      confidence: 0
    };
  }

  /**
   * Détecter les continuations
   * Ex: "combien?" après "montre les factures"
   */
  private detectContinuations(
    question: string,
    context: UserConversationContext
  ): ContextDetectionResult {
    const singleWordPatterns = [
      /^combien\s*\??$/i,      // "combien?"
      /^quand\s*\??$/i,        // "quand?"
      /^qui\s*\??$/i,          // "qui?"
      /^pourquoi\s*\??$/i,     // "pourquoi?"
      /^où\s*\??$/i,           // "où?"
    ];

    for (const pattern of singleWordPatterns) {
      if (pattern.test(question)) {
        const subject = this.getSubjectFromIntent(context.lastIntent);
        const entities = context.lastEntities?.join(' ') || '';

        if (subject && entities) {
          const enriched = `${question} ${subject} ${entities}`;

          return {
            hasReference: true,
            referenceType: 'continuation',
            enrichedQuestion: enriched,
            replacements: { [question]: enriched },
            confidence: 0.7
          };
        }
      }
    }

    return {
      hasReference: false,
      enrichedQuestion: question,
      replacements: {},
      confidence: 0
    };
  }

  /**
   * Extraire le sujet d'une intention
   * Ex: "get_invoices" → "les factures"
   */
  private getSubjectFromIntent(intent?: string): string | null {
    if (!intent) return null;

    const intentMap: Record<string, string> = {
      'get_invoices': 'les factures',
      'get_monthly_invoices': 'les factures',
      'get_recent_invoices': 'les factures',
      'get_supplier_invoices': 'les factures',
      'get_unpaid_invoices': 'les factures impayées',
      'get_overdue_invoices': 'les factures en retard',
      'get_employee_salaries': 'les salaires',
      'analyze_supplier_expenses': 'les dépenses',
      'get_monthly_balances': 'les balances',
      'get_bank_balances': 'les soldes bancaires',
    };

    return intentMap[intent] || null;
  }

  /**
   * Vérifier si une question est probablement contextuelle
   * (pour logging/debug)
   */
  isLikelyContextual(question: string): boolean {
    const questionLower = question.toLowerCase().trim();

    const contextualKeywords = [
      'celle', 'celles', 'celui', 'ceux',  // Pronoms démonstratifs
      'même', 'mêmes',                      // Répétition
      'aussi', 'encore', 'pareil',          // Continuation
      /^et\s/,                               // Conjonction en début
      /^puis\s/,                             // Séquence
      /^\w+\s*\?$/,                         // Question d'un mot
    ];

    return contextualKeywords.some(keyword => {
      if (typeof keyword === 'string') {
        return questionLower.includes(keyword);
      } else {
        return keyword.test(questionLower);
      }
    });
  }
}
