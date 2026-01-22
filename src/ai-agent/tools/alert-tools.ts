import type Groq from 'groq-sdk';

/**
 * Outils IA pour la gestion des alertes personnalisées (3 outils)
 * 🚀 OUTIL 10: Système d'alertes pour surveiller les KPIs financiers
 *
 * @module AlertTools
 * @category AI Tools
 */

export const alertTools: Groq.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'create_alert',
      description: '⚠️ CRÉER UNE ALERTE PERSONNALISÉE. Utilise cet outil quand l\'utilisateur demande à être prévenu/alerté sur un seuil. Exemples: "Préviens-moi si les impayés dépassent 5000€", "Alerte-moi si j\'ai plus de 10 factures en retard", "Notifie-moi si la balance passe sous 10000€", "Alertes pour dépenses > 3000€".',
      parameters: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            description: 'Type d\'alerte. Choix: "unpaid_threshold" (factures impayées > seuil), "overdue_count" (factures en retard > nombre), "balance_below" (balance < seuil), "large_expense" (dépense > seuil)',
            enum: ['unpaid_threshold', 'overdue_count', 'balance_below', 'large_expense'],
          },
          threshold: {
            type: 'number',
            description: 'Seuil de déclenchement. Ex: 5000 pour "impayés > 5000€", 10 pour "retard > 10 factures", 10000 pour "balance < 10000€"',
          },
          description: {
            type: 'string',
            description: 'Description personnalisée optionnelle de l\'alerte (ex: "Alerte urgence trésorerie")',
          },
        },
        required: ['type', 'threshold'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_alerts',
      description: '⚠️ LISTER LES ALERTES. Utilise cet outil quand l\'utilisateur demande ses alertes actives. Exemples: "Quelles sont mes alertes ?", "Liste mes alertes", "Montre-moi mes alertes configurées", "Alertes actives".',
      parameters: {
        type: 'object',
        properties: {
          active_only: {
            type: 'boolean',
            description: 'Si true, affiche uniquement les alertes actives. Si false, affiche toutes les alertes (actives et désactivées). Par défaut: true.',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_alert',
      description: '⚠️ SUPPRIMER UNE ALERTE. Utilise cet outil quand l\'utilisateur demande de supprimer une alerte. Exemples: "Supprime l\'alerte X", "Efface l\'alerte sur les impayés", "Retire l\'alerte ID abc123".',
      parameters: {
        type: 'object',
        properties: {
          alert_id: {
            type: 'string',
            description: 'ID de l\'alerte à supprimer (ex: "1737558290000-abc123def")',
          },
        },
        required: ['alert_id'],
      },
    },
  },
];
