import type Groq from 'groq-sdk';

/**
 * Outils IA pour la gestion des transactions bancaires (9 outils)
 *
 * @module TransactionTools
 * @category AI Tools
 */

export const transactionTools: Groq.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'get_monthly_balance',
      description: '⚠️ APPEL OBLIGATOIRE: Obtenir la balance bancaire RÉELLE du mois (recettes - dépenses). Tu DOIS appeler cet outil pour TOUTE question sur la balance, solde ou résultat du mois. Ne JAMAIS calculer ou inventer. Exemples: "Balance du mois?", "Solde bancaire?", "Résultat mensuel?"',
      parameters: {
        type: 'object',
        properties: {
          month: {
            type: 'string',
            description: '⚠️ OBLIGATOIRE si l\'utilisateur spécifie un mois (ex: "décembre", "novembre", "12", "11"). Mois à analyser.',
          },
          year: {
            type: 'string',
            description: '⚠️ OBLIGATOIRE si l\'utilisateur spécifie une année (ex: "2025", "2024"). Extrait TOUJOURS l\'année mentionnée par l\'utilisateur.',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_monthly_credits',
      description: '⚠️ APPEL OBLIGATOIRE pour UN SEUL mois. Obtenir le total RÉEL des recettes/rentrées d\'un mois spécifique. Pour PLUSIEURS mois ou "derniers X mois", utilise get_multi_month_revenues. Ne JAMAIS inventer de montant. Exemples: "Recettes de décembre?", "Total rentrées décembre 2025?", "Combien d\'entrées en novembre?"',
      parameters: {
        type: 'object',
        properties: {
          month: {
            type: 'string',
            description: '⚠️ OBLIGATOIRE si l\'utilisateur spécifie un mois (ex: "décembre", "novembre", "12", "11"). Mois à analyser.',
          },
          year: {
            type: 'string',
            description: '⚠️ OBLIGATOIRE si l\'utilisateur spécifie une année (ex: "2025", "2024"). Extrait TOUJOURS l\'année mentionnée par l\'utilisateur.',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_multi_month_revenues',
      description: '⚠️ OUTIL POUR RECETTES DE PLUSIEURS MOIS. Utilise cet outil quand l\'utilisateur demande les recettes de PLUSIEURS mois (ex: "recettes des 3 derniers mois", "recettes d\'octobre, novembre et décembre", "recettes depuis octobre"). Retourne un résumé par mois + total cumulé. NE PAS utiliser pour un seul mois.',
      parameters: {
        type: 'object',
        properties: {
          months: {
            type: 'array',
            items: { type: 'string' },
            description: 'Liste des mois au format YYYY-MM (ex: ["2025-10", "2025-11", "2025-12"]). MINIMUM 2 mois requis.',
          },
        },
        required: ['months'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_monthly_debits',
      description: '⚠️ APPEL OBLIGATOIRE: Obtenir le total RÉEL des dépenses/sorties d\'un mois spécifique. Tu DOIS appeler cet outil pour TOUTE question sur les dépenses, sorties ou débits. Ne JAMAIS inventer de montant. Exemples: "Dépenses de décembre?", "Total sorties novembre 2025?", "Combien de débits en octobre?"',
      parameters: {
        type: 'object',
        properties: {
          month: {
            type: 'string',
            description: '⚠️ OBLIGATOIRE si l\'utilisateur spécifie un mois (ex: "décembre", "novembre", "12", "11"). Mois à analyser.',
          },
          year: {
            type: 'string',
            description: '⚠️ OBLIGATOIRE si l\'utilisateur spécifie une année (ex: "2025", "2024"). Extrait TOUJOURS l\'année mentionnée par l\'utilisateur.',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_bank_balances',
      description: '⚠️ APPEL OBLIGATOIRE: Obtenir les soldes RÉELS actuels de TOUS les comptes bancaires (Europabank, BNP Paribas Fortis, ING). Tu DOIS appeler cet outil pour TOUTE question sur: "solde des comptes", "combien sur les comptes", "total en banque", "argent disponible", "soldes bancaires", "combien d\'argent". Ne JAMAIS inventer de montants. Retourne les soldes de CHAQUE compte + le total.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_monthly_summaries',
      description: '⚠️⚠️⚠️ INTERDIT pour un seul mois ! Utilise cet outil UNIQUEMENT si l\'utilisateur demande EXPLICITEMENT 2 mois OU PLUS dans sa question (ex: "balances d\'octobre ET novembre", "octobre, novembre et décembre"). ⚠️ Si l\'utilisateur dit "balance d\'octobre" (1 seul mois), utilise get_period_transactions à la place. ⚠️ NE PAS "enrichir" en ajoutant des mois non demandés (ex: si l\'utilisateur demande octobre, NE PAS afficher novembre et décembre). Retourne un résumé par mois + total cumulé.',
      parameters: {
        type: 'object',
        properties: {
          months: {
            type: 'array',
            items: { type: 'string' },
            description: '⚠️ Liste des mois EXPLICITEMENT mentionnés par l\'utilisateur au format YYYY-MM. MINIMUM 2 mois requis. NE PAS ajouter de mois supplémentaires.',
          },
        },
        required: ['months'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_period_transactions',
      description: '⚠️ OUTIL PAR DÉFAUT pour les balances mensuelles. Utilise cet outil pour: (1) balance d\'UN SEUL mois (ex: "balance d\'octobre", "balance du mois de novembre"), (2) transactions sur une période spécifique, (3) filtrer par fournisseur. Retourne un résumé (crédits, débits, balance) + liste des transactions. Si l\'utilisateur demande SEULEMENT la balance sans mentionner "liste" ou "transactions", tu PEUX limiter l\'affichage au résumé.',
      parameters: {
        type: 'object',
        properties: {
          start_date: {
            type: 'string',
            description: 'Date de début (YYYY-MM-DD). Pour un mois complet: premier jour du mois (ex: 2025-10-01 pour octobre).',
          },
          end_date: {
            type: 'string',
            description: 'Date de fin (YYYY-MM-DD). Pour un mois complet: dernier jour du mois (ex: 2025-10-31 pour octobre).',
          },
          filter_type: {
            type: 'string',
            description: 'Type: recettes, depenses, salaires',
            enum: ['recettes', 'depenses', 'salaires', ''],
          },
          supplier_name: {
            type: 'string',
            description: 'Nom du fournisseur ou employé pour filtrer. ⚠️ UTILISE CE PARAMÈTRE quand l\'utilisateur mentionne un fournisseur spécifique (ex: Foster, Alkhoomsy, Engie) ou un terme générique comme "loyer", "électricité" (après avoir demandé le nom du fournisseur).',
          },
          offset: {
            type: 'number',
            description: '⚠️ PAGINATION: Numéro de la page à afficher (1 = première page, 2 = deuxième page, etc.). Utilise quand l\'utilisateur demande "les suivantes", "suite", "continue", "page suivante". Par défaut: 1.',
          },
          limit: {
            type: 'number',
            description: 'Nombre de transactions par page (30 par défaut). Ne changer que si l\'utilisateur le demande explicitement.',
          },
        },
        required: ['start_date', 'end_date'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_invoice_by_supplier_and_amount',
      description: 'UTILISE CETTE FONCTION quand l\'utilisateur demande "le détail de cette facture" ou "plus d\'infos sur cette facture" après avoir parlé d\'un paiement spécifique. Cherche une facture par fournisseur et montant approximatif.',
      parameters: {
        type: 'object',
        properties: {
          supplier_name: {
            type: 'string',
            description: 'Nom du fournisseur (ex: Foster, Coca-Cola, CIERS)',
          },
          amount: {
            type: 'number',
            description: 'Montant approximatif de la facture (ex: 5903.70)',
          },
          month: {
            type: 'string',
            description: 'Mois concerné (novembre, décembre...) Optionnel',
          },
          year: {
            type: 'string',
            description: 'Année (2025, 2024...) Optionnel',
          },
        },
        required: ['supplier_name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'analyze_expenses_by_category',
      description: '⚠️ APPEL OBLIGATOIRE: Analyser les dépenses par catégorie (loyers, utilities, alimentation, etc.). Tu DOIS appeler cet outil pour: "analyse mes dépenses par catégorie", "dépenses par catégorie", "montre-moi mes loyers et charges fixes", "combien je dépense en électricité", "analyse mes utilities", "dépenses alimentaires". Permet de voir la répartition des dépenses et leur évolution.\n\n⚠️ IMPORTANT: Pour "analyse du salaire" ou "salaires des employés", utiliser get_employee_salaries à la place.',
      parameters: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            description: 'Catégorie spécifique à analyser (optionnel). Peut être: "loyers", "utilities", "alimentation", "telecom", "assurance", "services", "taxes", ou "tout" pour toutes les catégories. NOTE: "salaires" analyse les paiements de salariat externes facturés, PAS les salaires des employés (utiliser get_employee_salaries pour ça).',
            enum: ['loyers', 'utilities', 'telecom', 'assurance', 'alimentation', 'salaires', 'services', 'taxes', 'tout']
          },
          months: {
            type: 'number',
            description: 'Nombre de mois à analyser (par défaut 6 mois pour voir la tendance). Ex: 3, 6, 12.',
          },
          compare_with_previous: {
            type: 'boolean',
            description: 'Comparer avec la même période de l\'année précédente (ex: janvier 2026 vs janvier 2025).'
          }
        },
        required: [],
      },
    },
  },
];
