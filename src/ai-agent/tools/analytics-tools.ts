import type Groq from 'groq-sdk';

/**
 * Outils IA pour prévisions, anomalies et exports (4 outils)
 *
 * @module AnalyticsTools
 * @category AI Tools
 */

export const analyticsTools: Groq.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'predict_next_month',
      description: '⚠️ APPEL OBLIGATOIRE pour prédire les dépenses du mois prochain. Répond aux questions: "Prévision mois prochain?", "Combien vais-je dépenser?", "Estimation février?", "Prédis mes dépenses". Utilise l\'historique des 6-12 derniers mois pour calculer une prédiction avec tendance et confiance.',
      parameters: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            description: 'Catégorie à prédire (optionnel): "total", "alimentation", "salaires", "utilities". Par défaut: "total"',
          },
          history_months: {
            type: 'number',
            description: 'Nombre de mois d\'historique à utiliser (6 ou 12). Par défaut: 6',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'detect_anomalies',
      description: '⚠️ APPEL OBLIGATOIRE pour détecter les dépenses anormales. Répond aux questions: "Détecte anomalies?", "Dépenses inhabituelles?", "Y a-t-il des transactions suspectes?", "Alertes?". Analyse les transactions récentes et identifie celles qui dévient de >50% de la moyenne habituelle.',
      parameters: {
        type: 'object',
        properties: {
          period_days: {
            type: 'number',
            description: 'Nombre de jours à analyser (7, 30 ou 90). Par défaut: 30',
          },
          threshold_percent: {
            type: 'number',
            description: 'Seuil de détection en % (30, 50, 100). Par défaut: 50',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'analyze_trends',
      description: '⚠️ APPEL OBLIGATOIRE pour analyser les tendances globales. Répond aux questions: "Tendances générales?", "Évolution de mes finances?", "Croissance?", "Mes dépenses augmentent?". Calcule les tendances de recettes et dépenses sur 3-12 mois avec taux de croissance mensuel et annualisé.',
      parameters: {
        type: 'object',
        properties: {
          period_months: {
            type: 'number',
            description: 'Nombre de mois à analyser (3, 6 ou 12). Par défaut: 6',
          },
          include_forecast: {
            type: 'boolean',
            description: 'Inclure une projection à 3 mois. Par défaut: true',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'export_to_csv',
      description: '⚠️ APPEL OBLIGATOIRE pour exporter des données en CSV. Répond aux questions: "Exporte en CSV", "Donne-moi un fichier Excel", "Export transactions", "Télécharge les données". Génère un fichier CSV des transactions, factures ou salaires sur une période donnée et l\'envoie sur Telegram.',
      parameters: {
        type: 'object',
        properties: {
          data_type: {
            type: 'string',
            description: 'Type de données: "transactions", "invoices", "salaries". Par défaut: "transactions"',
          },
          start_date: {
            type: 'string',
            description: 'Date de début (format: "YYYY-MM-DD" ou "janvier 2025")',
          },
          end_date: {
            type: 'string',
            description: 'Date de fin (format: "YYYY-MM-DD" ou "décembre 2025")',
          },
        },
        required: ['data_type'],
      },
    },
  },
];
