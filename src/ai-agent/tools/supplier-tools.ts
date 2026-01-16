import type Groq from 'groq-sdk';

/**
 * Outils IA pour la gestion des fournisseurs (12 outils)
 *
 * @module SupplierTools
 * @category AI Tools
 */

export const supplierTools: Groq.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'get_supplier_payments',
      description: 'UTILISE CETTE FONCTION pour les paiements que VOUS avez faits VERS un fournisseur (dépenses/débits). Répond aux questions: "Combien payé à Foster?", "Paiements à Coca-Cola?", "Combien jai payé à Edenred?", "Combien jai versé à Foster?". ⚠️ IMPORTANT: NE PAS UTILISER pour les SALAIRES. Si la question contient le mot "salaire" ou "salaire" + nom de personne, utiliser get_employee_salaries à la place. ⚠️ Si lutilisateur demande des versements REÇUS dun fournisseur (ex: "Versements de Takeaway", "Combien Takeaway ma versé?", "Versements faits PAR Pluxee"), utilise get_supplier_received_payments à la place.',
      parameters: {
        type: 'object',
        properties: {
          supplier_name: {
            type: 'string',
            description: 'Nom du fournisseur (Foster, Coca-Cola, Edenred...)',
          },
          month: {
            type: 'string',
            description: 'Mois en français (novembre, décembre) ou numéro (11, 12).',
          },
          year: {
            type: 'string',
            description: '⚠️ OBLIGATOIRE si l\'utilisateur spécifie une année dans sa question (ex: "décembre 2025" → year: "2025", "année 2024" → year: "2024"). Extrait TOUJOURS l\'année mentionnée par l\'utilisateur. Ne pas utiliser l\'année en cours par défaut si une année est spécifiée.',
          },
        },
        required: ['supplier_name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_supplier_received_payments',
      description: 'UTILISE CETTE FONCTION pour les versements/recettes REÇUS dun fournisseur/partenaire (entrées dargent/crédits). Répond aux questions: "Versements de Takeaway?", "Combien Uber ma versé?", "Recettes de Deliveroo?", "Versements faits PAR Pluxee?", "Dernier versement de Pluxee?". IMPORTANT: "Versement fait PAR X" = argent reçu DE X. Si lutilisateur demande des paiements que VOUS avez faits VERS un fournisseur (ex: "Combien jai payé à Foster", "Paiements à Coca-Cola"), utilise get_supplier_payments à la place.',
      parameters: {
        type: 'object',
        properties: {
          supplier_name: {
            type: 'string',
            description: 'Nom du fournisseur ou partenaire (Takeaway, Uber, Deliveroo...)',
          },
          month: {
            type: 'string',
            description: 'Mois en français (novembre, décembre) ou numéro (11, 12).',
          },
          year: {
            type: 'string',
            description: '⚠️ OBLIGATOIRE si l\'utilisateur spécifie une année dans sa question (ex: "décembre 2025" → year: "2025", "année 2024" → year: "2024"). Extrait TOUJOURS l\'année mentionnée par l\'utilisateur. Ne pas utiliser l\'année en cours par défaut si une année est spécifiée.',
          },
        },
        required: ['supplier_name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_suppliers',
      description: '⚠️ APPEL OBLIGATOIRE: Lister TOUS les fournisseurs RÉELS enregistrés. Tu DOIS appeler cet outil pour TOUTE question sur la liste des fournisseurs. Ne JAMAIS inventer de noms. Exemples: "Liste des fournisseurs", "Quels fournisseurs?", "Montre tous les fournisseurs", "Fournisseurs connus?". ⚠️⚠️⚠️ CRITIQUE: La réponse contient un champ "direct_response" avec le formatage PARFAIT pour Telegram. TU DOIS renvoyer EXACTEMENT "direct_response" tel quel, sans ajouter UN SEUL MOT, sans "Voici", sans introduction. C\'est un COPY-PASTE pur et dur.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_supplier',
      description: 'Ajoute manuellement un fournisseur à la base de données. Utilise cette fonction quand l\'utilisateur demande: "Ajoute Coca-Cola", "Ajoute le fournisseur X", "Crée un nouveau fournisseur", "Enregistre ce fournisseur". Le fournisseur sera immédiatement utilisable pour les recherches.',
      parameters: {
        type: 'object',
        properties: {
          supplier_name: {
            type: 'string',
            description: 'Nom complet du fournisseur (ex: "Coca-Cola", "KBC BANK NV", "Mediwet")',
          },
          aliases: {
            type: 'array',
            items: { type: 'string' },
            description: 'Liste optionnelle d\'aliases supplémentaires (ex: ["cola", "coca"])',
          },
        },
        required: ['supplier_name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_supplier',
      description: 'Supprime un fournisseur de la base de données. Utilise cette fonction quand l\'utilisateur demande: "Supprime Coca-Cola", "Supprime le fournisseur X", "Efface ce fournisseur", "Retire Client 45". Attention: cette action est irréversible !',
      parameters: {
        type: 'object',
        properties: {
          supplier_key: {
            type: 'string',
            description: 'Clé du fournisseur à supprimer (ex: "cocacola", "kbc bank", "cliente 45"). Utilise le nom normalisé en minuscules sans les suffixes (SA, NV, etc.)',
          },
        },
        required: ['supplier_key'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'analyze_supplier_expenses',
      description: '⚠️ APPEL OBLIGATOIRE pour analyser les dépenses par fournisseur ET lister les factures.\n\n🎯 UTILISE CET OUTIL POUR:\n- "Liste des factures de X" → {supplier_name: "X", include_details: true}\n- "Toutes les factures de X sur l\'année" → {supplier_name: "X", include_details: true}\n- "Factures de X en novembre" → {supplier_name: "X", month: "novembre", include_details: true}\n- "Dépenses chez X" → {supplier_name: "X"}\n- "Factures de X et Y" → {supplier_name: "X et Y"} (PLUSIEURS FOURNISSEURS en un seul appel !)\n\n⚠️ IMPORTANT: Si la question mentionne PLUSIEURS fournisseurs (ex: "Uber et Takeaway", "Colruyt et Sligro"), utiliser UN SEUL APPEL avec supplier_name contenant tous les fournisseurs séparés par " et ". Ex: {supplier_name: "Uber et Takeaway"} ou {supplier_name: "Colruyt et Sligro"}. NE PAS utiliser compare_supplier_expenses.\n\nRÈGLES:\n1. Si FOURNISSEUR SPÉCIFIQUE mentionné (ex: "Colruyt", "Sligro", "Foster") → SPECIFIER supplier_name\n2. Si PLUSIEURS fournisseurs → utiliser supplier_name: "X et Y" (un seul appel)\n3. Si "top X fournisseurs" (ex: "top 10 fournisseurs") → NE PAS spécifier supplier_name (l\'outil affichera automatiquement le top X)\n4. Si "tous les fournisseurs" (sans précision) → NE PAS spécifier supplier_name\n5. Si PÉRIODE ANNUELLE (ex: "année 2025", "sur l\'année", "de l\'année") → NE PAS spécifier month\n6. ⚠️⚠️⚠️ Si MOIS MENTIONNÉ (ex: "novembre", "décembre", "du mois de novembre") → OBLIGATOIRE de spécifier month ⚠️⚠️⚠️\n7. ⚠️ Si utilisateur demande "LA LISTE", "FACTURES", "TOUTES" explicitement → METTRE include_details: true\n8. ⚠️ Si "entre X et Y" (période multi-mois) → UTILISER start_month et end_month ⚠️\n\n⚠️⚠️⚠️ CRITIQUE: La réponse contient un champ "direct_response" avec le formatage PARFAIT pour Telegram. TU DOIS renvoyer EXACTEMENT "direct_response" tel quel, sans ajouter UN SEUL MOT, sans "Voici", sans introduction, sans compléter avec d\'autres fournisseurs. C\'est un COPY-PASTE pur et dur. NE JAMAIS inventer de fournisseurs supplémentaires.\n\nEXEMPLES:\n- "Liste des factures de Foster" → {supplier_name: "Foster", include_details: true}\n- "Toutes les factures de l\'année de Foster" → {supplier_name: "Foster", include_details: true}\n- "Dépenses chez Colruyt en novembre" → {supplier_name: "Colruyt", month: "novembre"}\n- "Top 10 fournisseurs par dépenses" → {} (le top X est détecté automatiquement depuis la question)\n- "Factures Uber et Takeaway" → {supplier_name: "Uber et Takeaway"}\n- "Analyse dépenses chez Sligro entre octobre et décembre" → {supplier_name: "Sligro", start_month: "octobre", end_month: "décembre"}\n- "Tous les fournisseurs de l\'année" → {}\n- "Dépenses de novembre" → {month: "novembre"}',
      parameters: {
        type: 'object',
        properties: {
          supplier_name: {
            type: 'string',
            description: '⚠️ Nom du fournisseur (ex: "Colruyt", "Sligro"). Si omis, affiche le classement de tous les fournisseurs.',
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
      name: 'compare_supplier_expenses',
      description: '⚠️⚠️⚠️ APPEL PRIORITAIRE si les mots "comparaison", "comparer", "entre X et Y", "X, Y et Z", "vs", "différence" sont présents (pour fournisseurs) ⚠️⚠️⚠️\n\nUtiliser pour comparer les dépenses entre 2 OU PLUSIEURS fournisseurs.\n\nEXEMPLES OBLIGATOIRES:\n- "Compare Colruyt et Sligro" → {supplier_names: ["Colruyt", "Sligro"]}\n- "Comparaison entre Colruyt, Sligro et Metro" → {supplier_names: ["Colruyt", "Sligro", "Metro"]}\n- "Différence entre Makro et Metro" → {supplier_names: ["Makro", "Metro"]}\n\n⚠️ NE PAS utiliser analyze_supplier_expenses pour ces questions ⚠️',
      parameters: {
        type: 'object',
        properties: {
          supplier_names: {
            type: 'array',
            items: { type: 'string' },
            description: 'Liste des noms de fournisseurs à comparer (minimum 2, maximum 10). Exemples: ["Colruyt", "Sligro"], ["Makro", "Metro", "Transgourmet"]',
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
        required: ['supplier_names'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'detect_new_suppliers',
      description: '⚠️ APPEL OBLIGATOIRE: Détecter les nouveaux fournisseurs RÉELS dans les transactions bancaires qui ne sont pas encore dans la base de données. Tu DOIS appeler cet outil quand l\'utilisateur demande: "Détecte les nouveaux fournisseurs", "Nouveaux fournisseurs?", "Y a-t-il de nouveaux fournisseurs?", "Cherche nouveaux fournisseurs", "Scan fournisseurs". Cette fonction analyse TOUTES les transactions bancaires et filtre automatiquement les salaires, taxes, et paiements récurrents.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'send_invoice_pdf',
      description: 'UTILISE CETTE FONCTION pour envoyer le fichier PDF d\'une facture directement sur Telegram. À utiliser quand l\'utilisateur demande "envoie-moi le PDF", "je veux la facture", "donne-moi le fichier PDF", etc. IMPORTANT: Cette fonction ENVOIE réellement le fichier - ne pas donner de lien, dire simplement que le fichier a été envoyé.',
      parameters: {
        type: 'object',
        properties: {
          invoice_number: {
            type: 'string',
            description: 'Numéro de la facture (ex: 463799, UBERBELEATS-FHHEEJCJ-01-2025-0000051)',
          },
          invoice_id: {
            type: 'string',
            description: 'ID de la facture si connu (ex: 85653045)',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_by_communication',
      description: 'UTILISE CETTE FONCTION pour rechercher une facture par son numéro de communication (référence de paiement structurée). Répond aux questions: "Trouve la facture avec la communication 9991316838", "Donne-moi la facture qui se termine par 838", "Recherche la communication 9901309927". La communication est le numéro de référence utilisé pour les paiements (souvent format +++XXX/XXXX/XXXX+++).',
      parameters: {
        type: 'object',
        properties: {
          communication_number: {
            type: 'string',
            description: 'Numéro de communication (partiel ou complet, ex: "9991316838", "838", "9901309927")',
          },
        },
        required: ['communication_number'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_user_guide',
      description: '⚠️ APPEL OBLIGATOIRE: Envoyer le guide utilisateur complet avec tous les exemples de questions et commandes. Tu DOIS appeler cet outil quand l\'utilisateur demande "donne moi le guide", "guide", "aide complète", "comment utiliser le bot", "quelles questions poser", "que puis-je demander". Le guide sera envoyé en plusieurs parties automatiquement.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
];
