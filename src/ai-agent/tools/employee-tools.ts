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
      description: '⚠️ APPEL OBLIGATOIRE pour salaires d\'employés. ⚠️ FAIRE UN SEUL APPEL, PAS PLUSIEURS ⚠️\n\n🎯 UTILISER CET OUTIL pour TOUTE question sur les salaires, incluant: "Analyse du salaire", "Analyse des salaires", "Combien j\'ai payé en salaire", "Salaire de X", "Salaires des Madidi", "Analyser les salaires", "Total des salaires", etc.\n\n⚠️ MOTS-CLÉS QUI DÉCLENCHENT CET OUTIL: salaire, salaires, employés, paiements employés.\n\nRÈGLES:\n1. Si NOM SPÉCIFIQUE mentionné (ex: "Soufiane", "Hassan") → SPECIFIER employee_name\n2. ⚠️ Si "TOUS les [NOM_FAMILLE]" (ex: "tous les Madidi") → FAIRE UN SEUL APPEL avec le nom de famille seul {employee_name: "Madidi"}. NE PAS faire d\'appels supplémentaires pour chaque employé individuel ⚠️\n3. Si "TOUS les salaires" (sans précision) → NE PAS spécifier employee_name\n4. Si PÉRIODE ANNUELLE (ex: "année 2025", "sur l\'année") → NE PAS spécifier month\n5. ⚠️⚠️⚠️ Si MOIS MENTIONNÉ (ex: "novembre", "décembre", "du mois de novembre") → OBLIGATOIRE de spécifier month ⚠️⚠️⚠️\n6. ⚠️ Si utilisateur demande "LA LISTE" explicitement → METTRE include_details: true\n\nEXEMPLES:\n- "Salaires de Soufiane sur l\'année 2025" → UN SEUL APPEL: {employee_name: "Soufiane Madidi", year: "2025"}\n- "Salaires de tous les Madidi" → UN SEUL APPEL: {employee_name: "Madidi"} (trouvera automatiquement Hassan, Soufiane, Jawad)\n- "Tous les salaires des Madidi de novembre" → UN SEUL APPEL: {employee_name: "Madidi", month: "novembre"}\n- "Salaires de Hassan en décembre" → UN SEUL APPEL: {employee_name: "Hassan Madidi", month: "décembre"}\n- "Combien j\'ai payé en salaire à X" → UN SEUL APPEL: {employee_name: "X"}\n- "Donne-moi LA LISTE de tous les salaires" → UN SEUL APPEL: {include_details: true}\n- "Tous les salaires" → UN SEUL APPEL: {}',
      parameters: {
        type: 'object',
        properties: {
          employee_name: {
            type: 'string',
            description: '⚠️ Nom complet OU nom de famille seul. EXEMPLES: "Soufiane Madidi" (exact), "Madidi" (tous les Madidi), "Hassan Madidi" (exact). Recherche partielle automatique si pas d\'espace.',
          },
          month: {
            type: 'string',
            description: '⚠️ À OMETTRE si période annuelle OU période multi-mois: Mois unique (novembre, décembre, 11, 12). NE PAS spécifier si "année", "entre X et Y".',
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
            description: '⚠️ OBLIGATOIRE si l\'utilisateur spécifie une année dans sa question (ex: "décembre 2025" → year: "2025", "année 2024" → year: "2024"). Extrait TOUJOURS l\'année mentionnée par l\'utilisateur. Ne pas utiliser l\'année en cours par défaut si une année est spécifiée.',
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
      description: '⚠️⚠️⚠️ APPEL PRIORITAIRE si les mots "comparaison", "comparer", "entre X et Y", "X, Y et Z", "vs", "différence" sont présents ⚠️⚠️⚠️\n\nUtiliser pour comparer les salaires entre 2 OU PLUSIEURS employés.\n\nEXEMPLES OBLIGATOIRES:\n- "Compare Khalid et Mokhlis" → {employee_names: ["Khalid", "Mokhlis"]}\n- "Comparaison entre Soufiane, Khalid et Mokhlis" → {employee_names: ["Soufiane", "Khalid", "Mokhlis"]}\n- "Différence entre Hassan et Jawad" → {employee_names: ["Hassan", "Jawad"]}\n\n⚠️ NE PAS utiliser get_employee_salaries pour ces questions ⚠️',
      parameters: {
        type: 'object',
        properties: {
          employee_names: {
            type: 'array',
            items: { type: 'string' },
            description: 'Liste des noms d\'employés à comparer (minimum 2, maximum 10). Exemples: ["Khalid", "Mokhlis"], ["Hassan", "Soufiane", "Jawad"]',
          },
          month: {
            type: 'string',
            description: 'Mois à analyser (optionnel). Si omis, analyse l\'année entière.',
          },
          year: {
            type: 'string',
            description: '⚠️ OBLIGATOIRE si l\'utilisateur spécifie une année dans sa question (ex: "décembre 2025" → year: "2025", "année 2024" → year: "2024"). Extrait TOUJOURS l\'année mentionnée par l\'utilisateur. Ne pas utiliser l\'année en cours par défaut si une année est spécifiée.',
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
