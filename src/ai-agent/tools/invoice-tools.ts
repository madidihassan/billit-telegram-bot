import type Groq from 'groq-sdk';

/**
 * Outils IA pour la gestion des factures (12 outils)
 *
 * @module InvoiceTools
 * @category AI Tools
 */

export const invoiceTools: Groq.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'get_unpaid_invoices',
      description: '⚠️ APPEL OBLIGATOIRE: Obtenir les factures impayées RÉELLES avec détails complets.\n\n🎯 FORMAT OBLIGATOIRE (label et valeur sur la MÊME ligne) :\n"📋 Vous avez X factures impayées totalisant Y €.\n\n━━━━━━━━━━━━━━━━━━\n📄 Facture 1/X (numéro absolu sur total)\n🏪 Fournisseur : [supplier]\n💰 Prix : [amount] €\n📋 N° de facture : [invoice_number]\n📅 Date : [invoice_date]\n⏰ Date d\'échéance : [due_date]\n💬 Communication : [communication]\n📊 Statut : [status]\n━━━━━━━━━━━━━━━━━━"\n\n⚠️ NUMÉROTATION : Si 9 factures, numéroter de 1/9 à 9/9 (pas 1/1, 2/1, etc.)\n\n⚠️ CRITIQUE : Chaque ligne = emoji + label + ":" + espace + valeur. PAS de saut de ligne entre label et valeur.\n\nExemples: "Factures impayées?", "Combien de factures à payer?", "Montant total impayé?"',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_paid_invoices',
      description: '⚠️ APPEL OBLIGATOIRE: Obtenir les factures payées RÉELLES avec pagination (5 par page).\n\n🎯 FORMAT OBLIGATOIRE (label et valeur sur la MÊME ligne) :\n"📋 Vous avez X factures payées totalisant Y €.\n\nAffichage : Factures Z1 à Z2 (Page P/Total_Pages)\n\n━━━━━━━━━━━━━━━━━━\n📄 Facture [NUMERO_ABSOLU]/[TOTAL]\n🏪 Fournisseur : [supplier]\n💰 Prix : [amount] €\n📋 N° de facture : [invoice_number]\n📅 Date : [invoice_date]\n⏰ Date d\'échéance : [due_date]\n💬 Communication : [communication]\n📊 Statut : Payée\n━━━━━━━━━━━━━━━━━━\n\n💡 Pour voir les 5 suivantes, demandez : \'Factures payées page 2\' ou \'5 factures payées suivantes\'"\n\n⚠️⚠️ NUMÉROTATION ABSOLUE : Pour la facture N de la page, utiliser : NUMERO_ABSOLU = (page-1)*5 + N\nExemple : Page 2, facture 1 → (2-1)*5 + 1 = 6 → "📄 Facture 6/64"\n\n⚠️ PAGINATION : Par défaut page=1 (5 premières). Si utilisateur dit "page 2", "suivantes", "page 3" → utiliser le paramètre page.\n\nExemples: "Factures payées", "Factures payées page 2", "5 factures suivantes"',
      parameters: {
        type: 'object',
        properties: {
          page: {
            type: 'number',
            description: 'Numéro de page (1 = 5 premières, 2 = factures 6-10, etc.). Par défaut: 1',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_latest_invoice',
      description: '⚠️ APPEL OBLIGATOIRE: Obtenir LA dernière facture RÉELLE (la plus récente par date). Tu DOIS appeler cet outil quand l\'utilisateur demande "la dernière facture", "la facture la plus récente", "dernière facture reçue". Ne JAMAIS utiliser get_paid_invoices pour cette question.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_recent_invoices',
      description: '⚠️ APPEL OBLIGATOIRE: Obtenir les N dernières factures RÉELLES triées par date (les plus récentes en premier). Tu DOIS appeler cet outil pour: "les 5 dernières factures", "dernières factures", "factures récentes", "les 10 dernières", "les 3 dernières factures de Coca-Cola". Cette fonction retourne les factures (payées ET impayées) triées par date de facture. Si un fournisseur est mentionné, utilise supplier_name.',
      parameters: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            description: 'Nombre de factures à retourner (par défaut 5)',
          },
          supplier_name: {
            type: 'string',
            description: 'Nom du fournisseur pour filtrer les factures (ex: "Coca-Cola", "Foster"). Utilise ce paramètre si l\'utilisateur mentionne un fournisseur spécifique.',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_overdue_invoices',
      description: '⚠️ APPEL OBLIGATOIRE: Obtenir les factures en retard RÉELLES avec détails complets.\n\n🎯 FORMAT OBLIGATOIRE (label et valeur sur la MÊME ligne) :\n"⚠️ Vous avez X factures en retard totalisant Y €.\n\n━━━━━━━━━━━━━━━━━━\n📄 Facture 1/X (numéro absolu sur total)\n🏪 Fournisseur : [supplier]\n💰 Prix : [amount] €\n📋 N° de facture : [invoice_number]\n📅 Date : [invoice_date]\n⏰ Date d\'échéance : [due_date]\n💬 Communication : [communication]\n📊 Statut : [status]\n⚠️ Retard : [days_overdue] jours\n━━━━━━━━━━━━━━━━━━"\n\n⚠️ NUMÉROTATION : Si 3 factures, numéroter de 1/3 à 3/3 (pas 1/1, 2/1, etc.)\n\n⚠️ CRITIQUE : Chaque ligne = emoji + label + ":" + espace + valeur. PAS de saut de ligne entre label et valeur.\n\nExemples: "Factures en retard?", "Combien de factures overdue?", "Retards de paiement?"',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_upcoming_due_invoices',
      description: '⚠️ APPEL OBLIGATOIRE: Obtenir les factures impayées dont l\'échéance arrive bientôt (dans les X prochains jours). Tu DOIS appeler cet outil pour TOUTE question sur les factures à échéance prochaine. Exemples: "Factures dont l\'échéance arrive bientôt?", "Factures à payer cette semaine?", "Échéances à venir?"',
      parameters: {
        type: 'object',
        properties: {
          days: {
            type: 'number',
            description: 'Nombre de jours dans le futur pour vérifier les échéances (par défaut: 7 jours)',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'mark_invoice_as_paid',
      description: 'Marquer une facture comme payée. Utilisez le numéro de facture exact.',
      parameters: {
        type: 'object',
        properties: {
          invoice_number: {
            type: 'string',
            description: 'Numéro de facture exact (ex: 463799, 9901329189)',
          },
        },
        required: ['invoice_number'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_invoice_stats',
      description: '⚠️ APPEL OBLIGATOIRE: Obtenir les statistiques RÉELLES des factures du mois. Tu DOIS appeler cet outil pour TOUTE question sur les stats/statistiques de factures. Ne JAMAIS inventer de chiffres. Exemples: "Stats du mois?", "Statistiques factures?", "Combien de factures?"',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_all_invoices',
      description: '⚠️ APPEL OBLIGATOIRE: Obtenir TOUTES les factures RÉELLES (toutes périodes confondues). Tu DOIS appeler cet outil quand l\'utilisateur demande "toutes les factures", "liste complète des factures", "liste toutes les factures" SANS mentionner de mois ou période spécifique. Retourne factures payées ET impayées de tous les mois. Exemples: "Liste-moi toutes les factures", "Toutes les factures", "Liste complète"',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_supplier_invoices',
      description: '⚠️ APPEL OBLIGATOIRE: Obtenir TOUTES les factures RÉELLES d\'un fournisseur spécifique, avec filtrage optionnel par mois/année. Tu DOIS TOUJOURS appeler cet outil quand l\'utilisateur demande les factures d\'un fournisseur. Retourne factures payées ET impayées. Exemples: "factures de Foster", "factures Foster en janvier", "toutes les factures Coca-Cola", "factures Sligro de décembre 2025"',
      parameters: {
        type: 'object',
        properties: {
          supplier_name: {
            type: 'string',
            description: 'Nom du fournisseur (requis). Ex: "Foster", "Coca-Cola", "Sligro"',
          },
          month: {
            type: 'string',
            description: 'Mois optionnel pour filtrer (ex: "janvier", "décembre"). Si omis, retourne toutes les factures du fournisseur.',
          },
          year: {
            type: 'string',
            description: 'Année optionnelle (ex: "2025", "2026"). Par défaut: année en cours.',
          },
        },
        required: ['supplier_name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_monthly_invoices',
      description: '⚠️ APPEL OBLIGATOIRE: Obtenir les factures RÉELLES du mois en cours UNIQUEMENT. Tu DOIS appeler cet outil SEULEMENT si l\'utilisateur mentionne explicitement "ce mois", "mois actuel", "janvier" (mois courant). Ne JAMAIS utiliser pour "toutes les factures". Exemples: "Combien de factures ce mois?", "Factures du mois", "Factures de janvier"',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_invoices_by_month',
      description: '⚠️ APPEL OBLIGATOIRE: Obtenir les factures RÉELLES d\'un mois spécifique. Tu DOIS TOUJOURS appeler cet outil quand un mois est mentionné dans la question. Ne JAMAIS inventer de données. Exemples: "factures de décembre", "combien en novembre", "factures octobre 2024"',
      parameters: {
        type: 'object',
        properties: {
          month: {
            type: 'string',
            description: 'Nom du mois en français (décembre, novembre, octobre...) ou numéro (12, 11, 10...)',
          },
          year: {
            type: 'string',
            description: '⚠️ OBLIGATOIRE si l\'utilisateur spécifie une année dans sa question (ex: "décembre 2025" → year: "2025", "année 2024" → year: "2024"). Extrait TOUJOURS l\'année mentionnée par l\'utilisateur. Ne pas utiliser l\'année en cours par défaut si une année est spécifiée.',
          },
        },
        required: ['month'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_invoices',
      description: '⚠️ Rechercher des factures RÉELLES par fournisseur, numéro ou montant.\n\n⚠️⚠️ NE PAS UTILISER si:\n- La question mentionne une PÉRIODE/DATE (année, mois, 2025, 2024, novembre, etc.) → utiliser analyze_supplier_expenses à la place\n- La question demande "toutes les factures de [fournisseur] pour [période]" → utiliser analyze_supplier_expenses\n\n🎯 UTILISER UNIQUEMENT pour:\n- Recherche simple par fournisseur SANS période: "Cherche factures Foster", "Recherche Coca-Cola"\n- Recherche par numéro: "Trouve facture 123"\n- Filtres par MONTANT: "Factures de plus de 3000€" → {min_amount: 3000}, "Factures moins de 500€" → {max_amount: 500}\n\n⚠️ Cet outil NE FILTRE PAS par date! Pour les requêtes avec période, utiliser analyze_supplier_expenses.',
      parameters: {
        type: 'object',
        properties: {
          search_term: {
            type: 'string',
            description: 'Terme à rechercher (fournisseur, numéro). Optionnel si filtre par montant.'
          },
          min_amount: {
            type: 'number',
            description: 'Montant minimum (ex: 3000 pour "plus de 3000€"). Optionnel.'
          },
          max_amount: {
            type: 'number',
            description: 'Montant maximum (ex: 500 pour "moins de 500€"). Optionnel.'
          },
        },
        required: [],
      },
    },
  },
];
