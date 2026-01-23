import type Groq from 'groq-sdk';

/**
 * Outils IA pour l'agrégation et analyse de périodes (3 outils)
 *
 * @module AggregationTools
 * @category AI Tools
 */

export const aggregationTools: Groq.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'get_year_summary',
      description: '⚠️ APPEL OBLIGATOIRE pour obtenir le résumé annuel complet et répondre aux questions sur les BÉNÉFICES/RÉSULTATS.\n\n🎯 UTILISER pour:\n- "Quel est le bénéfice de [année]?" → calcule recettes - dépenses avec explications claires\n- "Résumé de l\'année?", "Bilan annuel?"\n- "Statistiques de l\'année?", "Résumé complet 2025?"\n- "Quel est le résultat de l\'année?"\n\n📊 Affiche un rapport PÉDAGOGIQUE avec:\n- Recettes (argent reçu) et Dépenses (argent dépensé) clairement expliquées\n- Solde net / Bénéfice = Recettes - Dépenses\n- Top 10 fournisseurs avec pourcentages\n- Répartition par catégorie (salaires, alimentation, etc.)\n- Comparaison avec année précédente si disponible\n\n⚠️ Format novice-friendly : explique chaque terme pour être compris par tous',
      parameters: {
        type: 'object',
        properties: {
          year: {
            type: 'string',
            description: 'Année à analyser (ex: "2025", "2024"). Par défaut: année en cours',
          },
          include_comparison: {
            type: 'boolean',
            description: 'Comparer avec l\'année précédente. Par défaut: true',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'compare_periods',
      description: '⚠️ APPEL OBLIGATOIRE pour comparer 2 périodes personnalisées. Répond aux questions: "Compare Q1 2025 vs Q1 2024", "Différence entre janvier-mars 2025 et 2024?", "Évolution T1 vs T2?". Permet de comparer n\'importe quelles 2 périodes avec détail des recettes, dépenses, évolution en % et €, et principaux changements.',
      parameters: {
        type: 'object',
        properties: {
          period1_start: {
            type: 'string',
            description: 'Date de début période 1 (format: "YYYY-MM-DD" ou "janvier 2025")',
          },
          period1_end: {
            type: 'string',
            description: 'Date de fin période 1 (format: "YYYY-MM-DD" ou "mars 2025")',
          },
          period2_start: {
            type: 'string',
            description: 'Date de début période 2 (format: "YYYY-MM-DD" ou "janvier 2024")',
          },
          period2_end: {
            type: 'string',
            description: 'Date de fin période 2 (format: "YYYY-MM-DD" ou "mars 2024")',
          },
        },
        required: ['period1_start', 'period1_end', 'period2_start', 'period2_end'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_quarterly_report',
      description: '⚠️ APPEL OBLIGATOIRE pour obtenir le rapport trimestriel. Répond aux questions: "Rapport Q4?", "Statistiques du trimestre?", "Bilan T3?", "Résultats trimestriels?". Affiche un rapport détaillé du trimestre (Q1: jan-mar, Q2: avr-jun, Q3: jul-sep, Q4: oct-dec) avec recettes, dépenses, top fournisseurs/employés, et évolution vs trimestre précédent.',
      parameters: {
        type: 'object',
        properties: {
          quarter: {
            type: 'number',
            description: 'Numéro du trimestre (1, 2, 3 ou 4). Q1=jan-mar, Q2=avr-jun, Q3=jul-sep, Q4=oct-dec',
          },
          year: {
            type: 'string',
            description: 'Année à analyser (ex: "2025"). Par défaut: année en cours',
          },
          compare_previous: {
            type: 'boolean',
            description: 'Comparer avec le trimestre précédent. Par défaut: true',
          },
        },
        required: ['quarter'],
      },
    },
  },
];
