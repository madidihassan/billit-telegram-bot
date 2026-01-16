/**
 * Service de suggestions proactives
 * Génère des suggestions intelligentes basées sur le contexte et les patterns
 *
 * @module ProactiveSuggestions
 * @category Services
 */

import { UserConversationContext, ConversationMessage } from './conversation-manager';
import { logInfo, logDebug } from '../utils/logger';

/**
 * Type de suggestion
 */
export type SuggestionType = 'follow_up' | 'insight' | 'pattern' | 'reminder';

/**
 * Suggestion proactive
 */
export interface Suggestion {
  type: SuggestionType;
  message: string;
  priority: number; // 1-10 (10 = très important)
  actionable: boolean; // Si l'utilisateur peut agir dessus
}

/**
 * Résultat d'une analyse (passé par l'IA)
 */
export interface AnalysisResults {
  type: string; // 'supplier_invoices', 'monthly_invoices', etc.
  data: any;
  summary?: string;
}

/**
 * Service de suggestions proactives
 */
export class ProactiveSuggestionsService {

  /**
   * Générer des suggestions basées sur le contexte et les résultats
   */
  async generateSuggestions(params: {
    userId: string;
    lastQuestion?: string;
    lastResults?: AnalysisResults;
    conversationHistory: ConversationMessage[];
  }): Promise<Suggestion[]> {
    const suggestions: Suggestion[] = [];

    // 1. Suggestions basées sur les résultats
    if (params.lastResults) {
      const resultSuggestions = this.suggestionsFromResults(params.lastResults);
      suggestions.push(...resultSuggestions);
    }

    // 2. Suggestions basées sur les patterns d'utilisation
    const patternSuggestions = this.suggestionsFromPatterns(params.conversationHistory);
    suggestions.push(...patternSuggestions);

    // 3. Suggestions basées sur le temps (heure de la journée)
    const timeSuggestions = this.suggestionsFromTime();
    suggestions.push(...timeSuggestions);

    // Trier par priorité (plus haute d'abord) et limiter à 3 suggestions max
    return suggestions
      .sort((a, b) => b.priority - a.priority)
      .slice(0, 3);
  }

  /**
   * Suggestions basées sur les résultats de la dernière requête
   */
  private suggestionsFromResults(results: AnalysisResults): Suggestion[] {
    const suggestions: Suggestion[] = [];

    switch (results.type) {
      case 'supplier_invoices':
        // Si un fournisseur représente >30% des dépenses
        if (results.data.percentageOfTotal > 30) {
          suggestions.push({
            type: 'insight',
            message: `💡 ${results.data.supplier} représente ${results.data.percentageOfTotal}% de tes dépenses. Veux-tu voir l'évolution sur 3 mois?`,
            priority: 7,
            actionable: true
          });
        }
        break;

      case 'monthly_invoices':
        // Si beaucoup de factures ce mois
        if (results.data.total_invoices > 20) {
          suggestions.push({
            type: 'insight',
            message: `💡 Tu as ${results.data.total_invoices} factures ce mois (plus que d'habitude). Veux-tu un résumé par fournisseur?`,
            priority: 6,
            actionable: true
          });
        }

        // Si des factures impayées
        if (results.data.unpaid_count > 0) {
          suggestions.push({
            type: 'reminder',
            message: `⚠️ ${results.data.unpaid_count} facture(s) impayée(s) (${results.data.unpaid_amount.toFixed(2)}€). Veux-tu les voir?`,
            priority: 9,
            actionable: true
          });
        }
        break;

      case 'employee_salaries':
        // Si demande pour un employé spécifique
        if (results.data.employee && results.data.total > 5000) {
          suggestions.push({
            type: 'insight',
            message: `💡 ${results.data.employee} a reçu ${results.data.total.toFixed(2)}€ ce mois. Veux-tu comparer avec les autres employés?`,
            priority: 5,
            actionable: true
          });
        }
        break;

      case 'bank_balances':
        // Si solde faible
        if (results.data.total_balance < 10000) {
          suggestions.push({
            type: 'reminder',
            message: `⚠️ Solde bancaire total: ${results.data.total_balance.toFixed(2)}€. Attention à la trésorerie!`,
            priority: 8,
            actionable: false
          });
        }
        break;
    }

    return suggestions;
  }

  /**
   * Suggestions basées sur les patterns de conversation
   */
  private suggestionsFromPatterns(history: ConversationMessage[]): Suggestion[] {
    const suggestions: Suggestion[] = [];

    // Analyser les 10 derniers messages
    const recentMessages = history.slice(-10);

    // Pattern 1: L'utilisateur demande souvent les mêmes choses
    const questionCounts: Record<string, number> = {};
    for (const msg of recentMessages.filter(m => m.role === 'user')) {
      const normalized = this.normalizeForPattern(msg.content);
      questionCounts[normalized] = (questionCounts[normalized] || 0) + 1;
    }

    // Si une question revient ≥3 fois
    for (const [question, count] of Object.entries(questionCounts)) {
      if (count >= 3) {
        suggestions.push({
          type: 'pattern',
          message: `💡 Tu demandes souvent "${question}". Veux-tu un rapport hebdomadaire automatique?`,
          priority: 6,
          actionable: true
        });
        break; // Une seule suggestion de ce type
      }
    }

    // Pattern 2: Série de questions sur le même sujet
    const recentIntents = recentMessages
      .filter(m => m.metadata?.intent)
      .map(m => m.metadata!.intent!);

    if (recentIntents.length >= 3) {
      const lastThree = recentIntents.slice(-3);
      // Si les 3 dernières questions sont sur les factures
      if (lastThree.every(intent => intent?.includes('invoice'))) {
        suggestions.push({
          type: 'follow_up',
          message: `💡 Tu explores les factures. Veux-tu un rapport global (top fournisseurs, total, en retard)?`,
          priority: 5,
          actionable: true
        });
      }
    }

    return suggestions;
  }

  /**
   * Suggestions basées sur l'heure
   */
  private suggestionsFromTime(): Suggestion[] {
    const suggestions: Suggestion[] = [];
    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay(); // 0 = Dimanche, 1 = Lundi, etc.

    // Lundi matin (9h-11h)
    if (day === 1 && hour >= 9 && hour <= 11) {
      suggestions.push({
        type: 'reminder',
        message: `👋 Bon lundi! Veux-tu un résumé de la semaine passée?`,
        priority: 4,
        actionable: true
      });
    }

    // Vendredi après-midi (16h-18h)
    if (day === 5 && hour >= 16 && hour <= 18) {
      suggestions.push({
        type: 'reminder',
        message: `📊 Fin de semaine! Veux-tu un résumé hebdomadaire avant le weekend?`,
        priority: 5,
        actionable: true
      });
    }

    return suggestions;
  }

  /**
   * Normaliser une question pour détecter les patterns
   */
  private normalizeForPattern(question: string): string {
    return question
      .toLowerCase()
      .replace(/\b(moi|les?|des?|du|svp|s'il vous plaît)\b/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 50); // Garder seulement les 50 premiers chars
  }

  /**
   * Formater les suggestions en texte pour affichage
   */
  formatSuggestions(suggestions: Suggestion[]): string {
    if (suggestions.length === 0) {
      return '';
    }

    const lines = suggestions.map(s => s.message);
    return '\n\n' + lines.join('\n');
  }

  /**
   * Vérifier si des suggestions doivent être affichées
   * (ne pas spammer l'utilisateur)
   */
  shouldShowSuggestions(conversationLength: number): boolean {
    // Ne montrer des suggestions que tous les 3-4 échanges
    return conversationLength % 3 === 0;
  }
}
