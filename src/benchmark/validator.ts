/**
 * Validateur de réponses pour benchmark
 */

import { TestQuestion } from './test-questions';

export interface ValidationResult {
  passed: boolean;
  score: number; // 0-100
  details: {
    mustContainPassed: boolean;
    mustNotContainPassed: boolean;
    patternMatchPassed: boolean;
    toolCheckPassed: boolean;
    dataPointsPassed: boolean;
  };
  failureReasons: string[];
}

export class ResponseValidator {
  /**
   * Valide une réponse par rapport aux critères attendus
   */
  validate(question: TestQuestion, response: string, toolsCalled: string[]): ValidationResult {
    const result: ValidationResult = {
      passed: true,
      score: 100,
      details: {
        mustContainPassed: true,
        mustNotContainPassed: true,
        patternMatchPassed: true,
        toolCheckPassed: true,
        dataPointsPassed: true,
      },
      failureReasons: [],
    };

    const { validationCriteria } = question;
    let scoreDeductions = 0;

    // 1. Vérifier mustContain (poids: 30 points)
    if (validationCriteria.mustContain) {
      const missingKeywords: string[] = [];
      for (const keyword of validationCriteria.mustContain) {
        if (!this.containsKeyword(response, keyword)) {
          missingKeywords.push(keyword);
        }
      }

      if (missingKeywords.length > 0) {
        result.details.mustContainPassed = false;
        result.failureReasons.push(
          `Mots-clés manquants: ${missingKeywords.join(', ')}`
        );
        scoreDeductions += 30;
      }
    }

    // 2. Vérifier mustNotContain (poids: 20 points)
    if (validationCriteria.mustNotContain) {
      const foundForbiddenKeywords: string[] = [];
      for (const keyword of validationCriteria.mustNotContain) {
        if (this.containsKeyword(response, keyword)) {
          foundForbiddenKeywords.push(keyword);
        }
      }

      if (foundForbiddenKeywords.length > 0) {
        result.details.mustNotContainPassed = false;
        result.failureReasons.push(
          `Mots-clés interdits trouvés: ${foundForbiddenKeywords.join(', ')}`
        );
        scoreDeductions += 20;
      }
    }

    // 3. Vérifier patterns regex (poids: 20 points)
    if (validationCriteria.mustMatchPattern) {
      const failedPatterns: number[] = [];
      validationCriteria.mustMatchPattern.forEach((pattern, index) => {
        if (!pattern.test(response)) {
          failedPatterns.push(index + 1);
        }
      });

      if (failedPatterns.length > 0) {
        result.details.patternMatchPassed = false;
        result.failureReasons.push(
          `Patterns regex non matchés: ${failedPatterns.join(', ')}`
        );
        scoreDeductions += 20;
      }
    }

    // 4. Vérifier l'outil appelé (poids: 20 points)
    if (validationCriteria.expectedTool || validationCriteria.expectedTools) {
      let toolFound = false;

      if (validationCriteria.expectedTool) {
        toolFound = toolsCalled.includes(validationCriteria.expectedTool);
      }

      if (!toolFound && validationCriteria.expectedTools) {
        toolFound = validationCriteria.expectedTools.some(tool => toolsCalled.includes(tool));
      }

      if (!toolFound) {
        result.details.toolCheckPassed = false;
        const expectedList = validationCriteria.expectedTools
          ? validationCriteria.expectedTools.join('" ou "')
          : validationCriteria.expectedTool;
        result.failureReasons.push(
          `Outil attendu "${expectedList}" non appelé. Appelés: ${toolsCalled.join(', ') || 'aucun'}`
        );
        scoreDeductions += 20;
      }
    }

    // 5. Vérifier le nombre de data points (poids: 10 points)
    if (validationCriteria.minDataPoints) {
      const dataPointCount = this.countDataPoints(response);
      if (dataPointCount < validationCriteria.minDataPoints) {
        result.details.dataPointsPassed = false;
        result.failureReasons.push(
          `Données insuffisantes: ${dataPointCount} < ${validationCriteria.minDataPoints} attendus`
        );
        scoreDeductions += 10;
      }
    }

    // Calculer le score final
    result.score = Math.max(0, 100 - scoreDeductions);
    result.passed = result.score >= 70; // Seuil de réussite: 70%

    return result;
  }

  /**
   * Vérifie si un mot-clé est présent (insensible à la casse et accents)
   */
  private containsKeyword(text: string, keyword: string): boolean {
    const normalizedText = this.normalize(text);
    const normalizedKeyword = this.normalize(keyword);
    return normalizedText.includes(normalizedKeyword);
  }

  /**
   * Normalise une chaîne (minuscules, sans accents)
   */
  private normalize(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, ''); // Supprime les accents
  }

  /**
   * Compte le nombre approximatif de données dans la réponse
   * (lignes avec des montants, noms, dates, etc.)
   */
  private countDataPoints(response: string): number {
    let count = 0;

    // Compter les montants (ex: "123.45€", "1234,56 €")
    const amountMatches = response.match(/\d+[.,]\d+\s*€/g);
    if (amountMatches) count += amountMatches.length;

    // Compter les dates ISO (ex: "2026-01-15")
    const dateMatches = response.match(/\d{4}-\d{2}-\d{2}/g);
    if (dateMatches) count += dateMatches.length;

    // Compter les lignes avec puces (🥇, 🥈, 🥉, •, -, *)
    const bulletMatches = response.match(/^[\s]*(🥇|🥈|🥉|•|-|\*|\d+\.)\s+/gm);
    if (bulletMatches) count += bulletMatches.length;

    return count;
  }
}
