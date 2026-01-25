import type Groq from 'groq-sdk';

/**
 * Outils IA pour la gestion des employés et salaires (5 outils)
 *
 * @module EmployeeTools
 * @category AI Tools
 */

export const employeeTools: Groq.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'get_employee_salaries',
      description: '⚠️ APPEL OBLIGATOIRE pour salaires d\'employés. ⚠️ FAIRE UN SEUL APPEL, PAS PLUSIEURS ⚠️\n\n🎯 UTILISER CET OUTIL pour TOUTE question sur les salaires, incluant: "Analyse du salaire", "Analyse des salaires", "Combien j\'ai payé en salaire", "Salaire de X", "Salaires des Madidi", "Analyser les salaires", "Total des salaires", etc.\n\n⚠️ MOTS-CLÉS QUI DÉCLENCHENT CET OUTIL: salaire, salaires, employés, paiements employés.\n\n⚠️⚠️⚠️ IMPORTANT: NE PAS UTILISER pour les comparaisons ! Si la question contient "comparer", "compare", "différence", "vs", "entre X et Y" → utiliser compare_employee_salaries à la place ⚠️⚠️⚠️\n\nRÈGLES:\n1. Si NOM SPÉCIFIQUE mentionné (ex: "Soufiane", "Hassan") → SPECIFIER employee_name\n2. ⚠️ Si "TOUS les [NOM_FAMILLE]" (ex: "tous les Madidi") → FAIRE UN SEUL APPEL avec le nom de famille seul {employee_name: "Madidi"}. NE PAS faire d\'appels supplémentaires pour chaque employé individuel ⚠️\n3. Si "TOUS les salaires" (sans précision) → NE PAS spécifier employee_name\n4. ⚠️⚠️⚠️ POUR LES PÉRIODES: TOUJOURS utiliser period_text pour "année 2025", "année 2024", etc. NE PAS utiliser year ⚠️⚠️⚠️\n5. ⚠️⚠️⚠️ Si MOIS MENTIONNÉ (ex: "novembre", "décembre", "du mois de novembre") → OBLIGATOIRE de spécifier month ⚠️⚠️⚠️\n6. ⚠️ Si utilisateur demande "LA LISTE" explicitement → METTRE include_details: true\n\nEXEMPLES:\n- "Salaires de l\'année 2025" → {period_text: "année 2025"} (PAS year!)\n- "Salaires de Soufiane sur l\'année 2025" → {employee_name: "Soufiane Madidi", period_text: "année 2025"}\n- "Salaires de tous les Madidi" → {employee_name: "Madidi"} (trouvera automatiquement Hassan, Soufiane, Jawad)\n- "Tous les salaires des Madidi de novembre" → {employee_name: "Madidi", month: "novembre"}\n- "Salaires de Hassan en décembre" → {employee_name: "Hassan Madidi", month: "décembre"}\n- "Combien j\'ai payé en salaire à X" → {employee_name: "X"}\n- "Donne-moi LA LISTE de tous les salaires" → {include_details: true}\n- "Tous les salaires" → {}\n\n⚠️ NE PAS UTILISER pour: "Compare X et Y", "Différence entre X et Y", "X vs Y" → utiliser compare_employee_salaries',
      parameters: {
        type: 'object',
        properties: {
          employee_name: {
            type: 'string',
            description: '⚠️ Nom complet OU nom de famille seul. EXEMPLES: "Soufiane Madidi" (exact), "Madidi" (tous les Madidi), "Hassan Madidi" (exact). Recherche partielle automatique si pas d\'espace.',
          },
          period_text: {
            type: 'string',
            description: '⚠️⚠️⚠️ PRIORITAIRE pour toutes les périodes: "année 2025", "année 2024", "octobre à décembre 2025", etc. TOUJOURS utiliser period_text pour les années complètes. NE PAS utiliser year ⚠️⚠️⚠️',
          },
          month: {
            type: 'string',
            description: '⚠️⚠️⚠️ CRITIQUE: Si l\'utilisateur dit "du mois", "ce mois", "le mois" SANS spécifier le nom → TOUJOURS utiliser le mois actuel (janvier 2026). Sinon: Mois unique (novembre, décembre, 11, 12). À OMETTRE si période annuelle OU période multi-mois ("année", "entre X et Y").',
          },
          start_month: {
            type: 'string',
            description: '⚠️ Pour période multi-mois (ex: "entre octobre et décembre"): Mois de début (octobre, novembre, 10, 11). Utiliser avec end_month.',
          },
          end_month: {
            type: 'string',
            description: '⚠️ Pour période multi-mois (ex: "entre octobre et décembre"): Mois de fin (décembre, novembre, 12, 11). Utiliser avec start_month.',
          },
          year: {
            type: 'string',
            description: '⚠️ DÉPRÉCIÉ - Utiliser period_text à la place. Ex: "année 2025" → period_text: "année 2025". Ne plus utiliser year seul.',
          },
          include_details: {
            type: 'boolean',
            description: 'Mettre à true si l\'utilisateur demande EXPLICITEMENT "la liste", "liste détaillée", "détails". Par défaut: false (affiche seulement l\'analyse).',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'compare_employee_salaries',
      description: '⚠️⚠️⚠️ APPEL PRIORITAIRE si les mots "comparaison", "comparer", "entre X et Y", "X, Y et Z", "vs", "différence" sont présents ⚠️⚠️⚠️\n\n🎯 Utiliser pour comparer les salaires entre 2 OU PLUSIEURS employés.\n\n⚠️⚠️⚠️ RÈGLE CRITIQUE: TOUJOURS utiliser les PRÉNOMS ou NOMS COMPLETS individuels, JAMAIS les noms de famille ⚠️⚠️⚠️\n\nEXEMPLES OBLIGATOIRES:\n- "Compare Soufiane et Jawad" → {employee_names: ["Soufiane", "Jawad"]} (PAS "Madidi" !)\n- "Compare Khalid et Mokhlis" → {employee_names: ["Khalid", "Mokhlis"]}\n- "Comparaison entre Soufiane, Khalid et Mokhlis" → {employee_names: ["Soufiane", "Khalid", "Mokhlis"]}\n- "Différence entre Hassan et Jawad" → {employee_names: ["Hassan", "Jawad"]}\n\n⚠️ NE PAS utiliser get_employee_salaries pour ces questions ⚠️\n⚠️ NE PAS utiliser de noms de famille comme "Madidi" → utiliser les prénoms individuels ⚠️',
      parameters: {
        type: 'object',
        properties: {
          employee_names: {
            type: 'array',
            items: { type: 'string' },
            description: 'Liste des noms d\'employés à comparer (minimum 2, maximum 10). Exemples: ["Khalid", "Mokhlis"], ["Hassan", "Soufiane", "Jawad"]',
          },
          period_text: {
            type: 'string',
            description: '⚠️⚠️⚠️ PRIORITAIRE pour toutes les périodes: "année 2025", "année 2024", etc. TOUJOURS utiliser period_text pour les années complètes. NE PAS utiliser year ⚠️⚠️⚠️',
          },
          month: {
            type: 'string',
            description: 'Mois à analyser (optionnel). Si omis, analyse l\'année entière.',
          },
          year: {
            type: 'string',
            description: '⚠️ DÉPRÉCIÉ - Utiliser period_text à la place. Ex: "année 2025" → period_text: "année 2025". Ne plus utiliser year seul.',
          },
        },
        required: ['employee_names'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_employees',
      description: '⚠️ APPEL OBLIGATOIRE: Lister TOUS les employés enregistrés dans la base de données. Tu DOIS appeler cet outil pour TOUTE question sur la liste des employés. Ne JAMAIS inventer de noms. Exemples: "Liste des employés", "Quels employés?", "Montre tous les employés"',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_employee',
      description: 'Ajoute un nouvel employé à la base de données. Utilise cette fonction quand l\'utilisateur demande: "Ajoute l\'employé X", "Crée un nouvel employé", "Enregistre cet employé".',
      parameters: {
        type: 'object',
        properties: {
          employee_name: {
            type: 'string',
            description: 'Nom complet de l\'employé (ex: "Hassan Madidi", "Soufiane Madidi")',
          },
          position: {
            type: 'string',
            description: 'Poste/fonction de l\'employé (optionnel). Ex: "Manager", "Serveur", "Cuisinier"',
          },
        },
        required: ['employee_name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'remove_employee',
      description: 'Supprime un employé de la base de données. Utilise cette fonction quand l\'utilisateur demande: "Supprime l\'employé X", "Efface cet employé", "Retire X". Attention: cette action est irréversible !',
      parameters: {
        type: 'object',
        properties: {
          employee_name: {
            type: 'string',
            description: 'Nom de l\'employé à supprimer (ex: "Hassan Madidi")',
          },
        },
        required: ['employee_name'],
      },
    },
  },
];
