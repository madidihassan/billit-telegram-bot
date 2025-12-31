import Groq from 'groq-sdk';
import { config } from './config';
import { CommandHandler } from './command-handler';
import { BillitClient } from './billit-client';
import { BankClient } from './bank-client';
import { OpenRouterClient } from './openrouter-client';
import * as fs from 'fs';
import * as path from 'path';
import {
  getAllAuthorizedUsers,
  getUserByChatId,
  addAuthorizedUser,
  removeAuthorizedUser,
  getAllEmployees,
  addEmployee,
  getEmployeeByName,
  employeeExistsByName,
  removeEmployee,
  getAllSuppliers,
} from './database';

/**
 * Service d'agent IA autonome AMÉLIORÉ avec données structurées
 * Supporte OpenRouter (GPT-4o-mini) ET Groq
 */
export class AIAgentServiceV2 {
  private groq: Groq | null = null;
  private openRouter: OpenRouterClient | null = null;
  private aiProvider: 'groq' | 'openrouter';
  private commandHandler: CommandHandler;
  private billitClient: BillitClient;
  private bankClient: BankClient;
  private telegramBot: any | null = null; // Bot Telegram pour envoyer des fichiers
  private chatId: string | null = null; // Chat ID actuel pour envoyer les PDFs
  private currentQuestion: string = ''; // Question actuelle de l'utilisateur
  private tools: any[];
  private conversationHistory: Array<{ role: string; content: string }> = [];
  private readonly MAX_HISTORY = 20; // Garder les 10 derniers échanges (20 messages)
  private readonly CONVERSATION_STATE_FILE = 'data/conversation-state.json';

  constructor(commandHandler: CommandHandler, telegramBot?: any) {
    this.commandHandler = commandHandler;
    this.billitClient = commandHandler.getBillitClient();
    this.bankClient = new BankClient();
    this.telegramBot = telegramBot || null;

    // Priorité : OpenRouter (si configuré) > Groq
    const openRouterClient = new OpenRouterClient();
    if (openRouterClient.isConfigured()) {
      this.openRouter = openRouterClient;
      this.aiProvider = 'openrouter';
    } else if (config.groq.apiKey) {
      this.groq = new Groq({ apiKey: config.groq.apiKey });
      this.aiProvider = 'groq';
    } else {
      throw new Error('❌ Ni OpenRouter ni Groq ne sont configurés!');
    }

    this.tools = this.defineTools();

    // Afficher le provider utilisé
    if (this.aiProvider === 'openrouter') {
      console.log(`✓ Agent IA autonome V2.5 (OpenRouter ${openRouterClient.getModel()}) - ${this.tools.length} outils`);
    } else {
      console.log(`✓ Agent IA autonome V2.5 (Groq fallback) - ${this.tools.length} outils`);
    }

    // Charger l'état de conversation sauvegardé
    this.loadConversationState();
  }

  /**
   * Définit tous les outils disponibles
   */
  private defineTools(): Groq.Chat.Completions.ChatCompletionTool[] {
    return [
      {
        type: 'function',
        function: {
          name: 'get_unpaid_invoices',
          description: '⚠️ APPEL OBLIGATOIRE: Obtenir les factures impayées RÉELLES. Tu DOIS appeler cet outil pour TOUTE question sur les factures impayées. Ne JAMAIS inventer de montants ou de nombres de factures. Exemples: "Factures impayées?", "Combien de factures à payer?", "Montant total impayé?"',
          parameters: { type: 'object', properties: {}, required: [] },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_paid_invoices',
          description: '⚠️ APPEL OBLIGATOIRE: Obtenir les factures payées RÉELLES récentes. Tu DOIS appeler cet outil pour TOUTE question sur les factures payées. Ne JAMAIS inventer de liste ou de montants. Exemples: "Factures payées?", "Combien de factures payées ce mois?", "Dernières factures payées?"',
          parameters: { type: 'object', properties: {}, required: [] },
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
          description: '⚠️ APPEL OBLIGATOIRE: Obtenir les N dernières factures RÉELLES triées par date (les plus récentes en premier). Tu DOIS appeler cet outil pour: "les 5 dernières factures", "dernières factures", "factures récentes", "les 10 dernières". Cette fonction retourne TOUTES les factures (payées ET impayées) triées par date de facture.',
          parameters: {
            type: 'object',
            properties: {
              limit: {
                type: 'number',
                description: 'Nombre de factures à retourner (par défaut 5)',
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
          description: '⚠️ APPEL OBLIGATOIRE: Obtenir les factures en retard RÉELLES. Tu DOIS appeler cet outil pour TOUTE question sur les factures en retard/overdue. Ne JAMAIS inventer de nombres ou montants. Exemples: "Factures en retard?", "Combien de factures overdue?", "Retards de paiement?"',
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
          name: 'get_monthly_balance',
          description: '⚠️ APPEL OBLIGATOIRE: Obtenir la balance bancaire RÉELLE du mois (recettes - dépenses). Tu DOIS appeler cet outil pour TOUTE question sur la balance, solde ou résultat du mois. Ne JAMAIS calculer ou inventer. Exemples: "Balance du mois?", "Solde bancaire?", "Résultat mensuel?"',
          parameters: { type: 'object', properties: {}, required: [] },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_monthly_credits',
          description: '⚠️ APPEL OBLIGATOIRE pour UN SEUL mois (mois en cours). Obtenir le total RÉEL des recettes/rentrées du mois en cours. Pour PLUSIEURS mois ou "derniers X mois", utilise get_multi_month_revenues. Ne JAMAIS inventer de montant. Exemples: "Recettes du mois?", "Total rentrées?", "Combien d\'entrées?"',
          parameters: { type: 'object', properties: {}, required: [] },
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
          description: '⚠️ APPEL OBLIGATOIRE: Obtenir le total RÉEL des dépenses/sorties du mois. Tu DOIS appeler cet outil pour TOUTE question sur les dépenses, sorties ou débits. Ne JAMAIS inventer de montant. Exemples: "Dépenses du mois?", "Total sorties?", "Combien de débits?"',
          parameters: { type: 'object', properties: {}, required: [] },
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
            },
            required: ['start_date', 'end_date'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_employee_salaries',
          description: '⚠️ APPEL OBLIGATOIRE pour salaires d\'employés. ⚠️ FAIRE UN SEUL APPEL, PAS PLUSIEURS ⚠️\n\nRÈGLES:\n1. Si NOM SPÉCIFIQUE mentionné (ex: "Soufiane", "Hassan") → SPECIFIER employee_name\n2. ⚠️ Si "TOUS les [NOM_FAMILLE]" (ex: "tous les Madidi") → FAIRE UN SEUL APPEL avec le nom de famille seul {employee_name: "Madidi"}. NE PAS faire d\'appels supplémentaires pour chaque employé individuel ⚠️\n3. Si "TOUS les salaires" (sans précision) → NE PAS spécifier employee_name\n4. Si PÉRIODE ANNUELLE (ex: "année 2025", "sur l\'année") → NE PAS spécifier month\n5. ⚠️⚠️⚠️ Si MOIS MENTIONNÉ (ex: "novembre", "décembre", "du mois de novembre") → OBLIGATOIRE de spécifier month ⚠️⚠️⚠️\n6. ⚠️ Si utilisateur demande "LA LISTE" explicitement → METTRE include_details: true\n\nEXEMPLES:\n- "Salaires de Soufiane sur l\'année 2025" → UN SEUL APPEL: {employee_name: "Soufiane Madidi", year: "2025"}\n- "Salaires de tous les Madidi" → UN SEUL APPEL: {employee_name: "Madidi"} (trouvera automatiquement Hassan, Soufiane, Jawad)\n- "Tous les salaires des Madidi de novembre" → UN SEUL APPEL: {employee_name: "Madidi", month: "novembre"}\n- "Salaires de Hassan en décembre" → UN SEUL APPEL: {employee_name: "Hassan Madidi", month: "décembre"}\n- "Donne-moi LA LISTE de tous les salaires" → UN SEUL APPEL: {include_details: true}\n- "Tous les salaires" → UN SEUL APPEL: {}',
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
                description: 'Année (2025, 2024). Défaut: année en cours.',
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
                description: 'Année (2025, 2024). Défaut: année en cours.',
              },
            },
            required: ['employee_names'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_supplier_payments',
          description: 'UTILISE CETTE FONCTION pour les paiements que VOUS avez faits VERS un fournisseur (dépenses/débits). Répond aux questions: "Combien payé à Foster?", "Paiements à Coca-Cola?", "Combien jai payé à Edenred?", "Combien jai versé à Foster?". IMPORTANT: Si lutilisateur demande des versements REÇUS dun fournisseur (ex: "Versements de Takeaway", "Combien Takeaway ma versé?", "Versements faits PAR Pluxee"), utilise get_supplier_received_payments à la place.',
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
                description: 'Année (2025, 2024). Par défaut 2025.',
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
                description: 'Année (2025, 2024). Par défaut 2025.',
              },
            },
            required: ['supplier_name'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'search_invoices',
          description: '⚠️ APPEL OBLIGATOIRE: Rechercher des factures RÉELLES par fournisseur ou numéro. Tu DOIS appeler cet outil pour TOUTE recherche de facture. Ne JAMAIS inventer de résultats. Exemples: "Cherche factures Foster", "Trouve facture 123", "Recherche Coca-Cola"',
          parameters: {
            type: 'object',
            properties: {
              search_term: { type: 'string', description: 'Terme à rechercher' },
            },
            required: ['search_term'],
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
          name: 'list_suppliers',
          description: '⚠️ APPEL OBLIGATOIRE: Lister TOUS les fournisseurs RÉELS enregistrés. Tu DOIS appeler cet outil pour TOUTE question sur la liste des fournisseurs. Ne JAMAIS inventer de noms. Exemples: "Liste des fournisseurs", "Quels fournisseurs?", "Montre tous les fournisseurs", "Fournisseurs connus?". ⚠️⚠️⚠️ CRITIQUE: La réponse contient un champ "direct_response" avec le formatage PARFAIT pour Telegram. TU DOIS renvoyer EXACTEMENT "direct_response" tel quel, sans ajouter UN SEUL MOT, sans "Voici", sans introduction. C\'est un COPY-PASTE pur et dur.',
          parameters: { type: 'object', properties: {}, required: [] },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_monthly_invoices',
          description: '⚠️ APPEL OBLIGATOIRE: Obtenir TOUTES les factures RÉELLES du mois en cours. Tu DOIS appeler cet outil pour TOUTE question sur les factures du mois actuel. Ne JAMAIS inventer de liste ou de nombres. Exemples: "Combien de factures ce mois?", "Factures du mois", "Liste les factures"',
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
                description: 'Année (2025, 2024...). Optionnel, par défaut année en cours.',
              },
            },
            required: ['month'],
          },
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
          description: '⚠️ APPEL OBLIGATOIRE pour analyser les dépenses par fournisseur. ⚠️ FAIRE UN SEUL APPEL, PAS PLUSIEURS ⚠️\n\nRÈGLES:\n1. Si FOURNISSEUR SPÉCIFIQUE mentionné (ex: "Colruyt", "Sligro") → SPECIFIER supplier_name\n2. Si "top X fournisseurs" (ex: "top 10 fournisseurs") → NE PAS spécifier supplier_name (l\'outil affichera automatiquement le top X)\n3. Si "tous les fournisseurs" (sans précision) → NE PAS spécifier supplier_name\n4. Si PÉRIODE ANNUELLE (ex: "année 2025", "sur l\'année") → NE PAS spécifier month\n5. ⚠️⚠️⚠️ Si MOIS MENTIONNÉ (ex: "novembre", "décembre", "du mois de novembre") → OBLIGATOIRE de spécifier month ⚠️⚠️⚠️\n6. ⚠️ Si utilisateur demande "LA LISTE" explicitement → METTRE include_details: true\n7. ⚠️ Si "entre X et Y" (période multi-mois) → UTILISER start_month et end_month ⚠️\n\n⚠️⚠️⚠️ CRITIQUE: La réponse contient un champ "direct_response" avec le formatage PARFAIT pour Telegram. TU DOIS renvoyer EXACTEMENT "direct_response" tel quel, sans ajouter UN SEUL MOT, sans "Voici", sans introduction, sans compléter avec d\'autres fournisseurs. C\'est un COPY-PASTE pur et dur. NE JAMAIS inventer de fournisseurs supplémentaires.\n\nEXEMPLES:\n- "Dépenses chez Colruyt en novembre" → {supplier_name: "Colruyt", month: "novembre"}\n- "Top 10 fournisseurs par dépenses" → {} (le top X est détecté automatiquement depuis la question)\n- "Analyse dépenses chez Sligro entre octobre et décembre" → {supplier_name: "Sligro", start_month: "octobre", end_month: "décembre"}\n- "Tous les fournisseurs de l\'année" → {}\n- "Dépenses de novembre" → {month: "novembre"}',
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
                description: 'Année (2025, 2024). Défaut: année en cours.',
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
                description: 'Année (2025, 2024). Défaut: année en cours.',
              },
            },
            required: ['supplier_names'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'add_user',
          description: '⚠️ Ajoute un utilisateur à la liste blanche. Tu DOIS appeler list_users() après l\'ajout pour confirmer. Ne JAMAIS inventer de Chat IDs. Utilise cette fonction pour: "Ajoute 123456789", "Autorise ce Chat ID", "Donne accès à", "Ajoute cette personne".',
          parameters: {
            type: 'object',
            properties: {
              chat_id: {
                type: 'string',
                description: 'Chat ID Telegram EXACT de l\'utilisateur à ajouter (ex: "7887749968"). DOIT contenir uniquement des chiffres.',
              },
            },
            required: ['chat_id'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'remove_user',
          description: '⚠️ Supprime un utilisateur. WORKFLOW OBLIGATOIRE si position ("le 3", "le 2ème", "l\'utilisateur 3"):\n1. APPELLE list_users() pour obtenir la liste ACTUELLE\n2. EXTRAIS le Chat ID à la position demandée depuis le RÉSULTAT de list_users()\n3. APPELLE remove_user() avec ce Chat ID\n4. APPELLE list_users() à nouveau pour confirmer\n⚠️ NE JAMAIS utiliser CLAUDE.md ou ta mémoire pour les Chat IDs - UNIQUEMENT le résultat de list_users().\nExemples: "Supprime le 3ème" → list_users() → extrait le 3ème Chat ID → remove_user(ce_chat_id)',
          parameters: {
            type: 'object',
            properties: {
              chat_id: {
                type: 'string',
                description: 'Chat ID Telegram EXACT (ex: "7887749968"). DOIT provenir du résultat de list_users(), PAS de CLAUDE.md, PAS de ta mémoire, PAS d\'invention.',
              },
            },
            required: ['chat_id'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'list_users',
          description: '⚠️ OBLIGATOIRE: Liste tous les utilisateurs autorisés. TU DOIS APPELER cette fonction AVANT de répondre à toute question sur les utilisateurs. Ne JAMAIS inventer de liste. Utilise cette fonction pour: "Qui a accès ?", "Liste des utilisateurs", "Montre les utilisateurs", "Quels utilisateurs ?", ou toute question concernant les utilisateurs autorisés.',
          parameters: {
            type: 'object',
            properties: {},
            required: [],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'list_employees',
          description: '⚠️ OBLIGATOIRE: Liste tous les employés. TU DOIS APPELER cette fonction AVANT de répondre à toute question sur les employés ou salariés. Ne JAMAIS inventer de liste. Utilise cette fonction pour: "Liste des employés", "Qui sont les employés ?", "Montre les salariés", "Quels employés ?", ou toute question concernant les employés. ⚠️⚠️⚠️ CRITIQUE: La réponse contient un champ "direct_response" avec le formatage PARFAIT pour Telegram. TU DOIS renvoyer EXACTEMENT "direct_response" tel quel, sans ajouter UN SEUL MOT, sans "Voici", sans introduction. C\'est un COPY-PASTE pur et dur.',
          parameters: {
            type: 'object',
            properties: {},
            required: [],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'add_employee',
          description: 'Ajoute un nouvel employé dans la base de données. Utilise cette fonction pour: "Ajoute un employé", "Nouvel employé", "Enregistre cet employé". Tu DOIS appeler list_employees() après l\'ajout pour confirmer.',
          parameters: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Nom complet de l\'employé (ex: "Mohamed Ali", "Sarah Dupont")',
              },
              chat_id: {
                type: 'string',
                description: 'Chat ID Telegram de l\'employé (optionnel, ex: "123456789")',
              },
              position: {
                type: 'string',
                description: 'Poste/Position de l\'employé (optionnel, ex: "Employé", "Manager", "Caissier")',
              },
            },
            required: ['name'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'remove_employee',
          description: 'Supprime un employé de la base de données (désactivation). Utilise cette fonction pour: "Supprime l\'employé", "Retire cet employé", "Enlève X de la liste". Le nom DOIT provenir du résultat de list_employees(), PAS d\'invention. Tu DOIS appeler list_employees() après la suppression pour confirmer.',
          parameters: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Nom EXACT de l\'employé à supprimer (doit correspondre exactement à celui de list_employees())',
              },
            },
            required: ['name'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'detect_new_suppliers',
          description: '⚠️ APPEL OBLIGATOIRE: Détecter les nouveaux fournisseurs RÉELS dans les transactions bancaires qui ne sont pas encore dans la base de données. Tu DOIS appeler cet outil quand l\'utilisateur demande: "Détecte les nouveaux fournisseurs", "Nouveaux fournisseurs?", "Y a-t-il de nouveaux fournisseurs?", "Cherche nouveaux fournisseurs", "Scan fournisseurs". Cette fonction analyse TOUTES les transactions bancaires et filtre automatiquement les salaires, taxes, et paiements récurrents.',
          parameters: {
            type: 'object',
            properties: {},
            required: [],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'restart_bot',
          description: 'Redémarre le bot Telegram. Utilise cette fonction quand l\'utilisateur demande: "Redémarre le bot", "Relance le bot", "Reboot le bot", "Redémarrage". Attention: le bot sera temporairement indisponible pendant quelques secondes.',
          parameters: {
            type: 'object',
            properties: {},
            required: [],
          },
        },
      },
    ];
  }

  /**
   * Exécute une fonction et retourne des données structurées (JSON)
   */
  private async executeFunction(functionName: string, args: any): Promise<string> {
    console.log(`🔧 Exécution: ${functionName}`, args);

    try {
      let result: any;

      switch (functionName) {
        case 'get_unpaid_invoices': {
          const invoices = await this.billitClient.getUnpaidInvoices();
          const total = invoices.reduce((sum, inv) => sum + inv.total_amount, 0);
          result = {
            count: invoices.length,
            total_amount: total,
            currency: 'EUR',
            invoices: invoices.slice(0, 5).map(inv => ({
              supplier: inv.supplier_name,
              amount: inv.total_amount,
              invoice_number: inv.invoice_number,
            })),
          };
          break;
        }

        case 'get_paid_invoices': {
          const allInvoices = await this.billitClient.getInvoices({ limit: 120 });
          const invoices = allInvoices.filter(inv =>
            inv.status.toLowerCase().includes('paid') || inv.status.toLowerCase().includes('payé')
          );
          const total = invoices.reduce((sum, inv) => sum + inv.total_amount, 0);
          result = {
            count: invoices.length,
            total_amount: total,
            currency: 'EUR',
            latest: invoices.slice(0, 5).map(inv => ({
              supplier: inv.supplier_name,
              amount: inv.total_amount,
              date: inv.invoice_date,
            })),
          };
          break;
        }

        case 'get_latest_invoice': {
          try {
            // Récupérer toutes les factures et trier par date pour obtenir la plus récente
            const allInvoices = await this.billitClient.getInvoices({ limit: 120 });

            if (!allInvoices || allInvoices.length === 0) {
              result = {
                success: false,
                message: 'Aucune facture trouvée',
              };
              break;
            }

            console.log(`📊 get_latest_invoice: ${allInvoices.length} factures récupérées`);

            // Filtrer les factures avec une date valide et trier par date (la plus récente en premier)
            const sortedInvoices = allInvoices
              .filter(inv => inv.invoice_date && !isNaN(new Date(inv.invoice_date).getTime()))
              .sort((a, b) => {
                const dateA = new Date(a.invoice_date).getTime();
                const dateB = new Date(b.invoice_date).getTime();
                return dateB - dateA; // Ordre décroissant (plus récent en premier)
              });

            if (sortedInvoices.length === 0) {
              result = {
                success: false,
                message: 'Aucune facture avec une date valide trouvée',
              };
              break;
            }

            const latestInvoice = sortedInvoices[0];
            console.log(`📄 Dernière facture: ${latestInvoice.supplier_name} - ${latestInvoice.invoice_date} - ${latestInvoice.total_amount}€`);

            result = {
              success: true,
              invoice: {
                id: latestInvoice.id,
                supplier: latestInvoice.supplier_name,
                invoice_number: latestInvoice.invoice_number,
                invoice_date: latestInvoice.invoice_date,
                due_date: latestInvoice.due_date,
                amount: latestInvoice.total_amount,
                currency: latestInvoice.currency || 'EUR',
                status: latestInvoice.status,
                communication: latestInvoice.communication || '',
              },
            };
          } catch (error: any) {
            console.error('❌ Erreur get_latest_invoice:', error);
            result = {
              success: false,
              error: 'api_error',
              message: `Erreur lors de la récupération de la dernière facture: ${error.message}`,
            };
          }
          break;
        }

        case 'get_recent_invoices': {
          try {
            const limit = (args.limit as number) || 5;

            // Récupérer toutes les factures (Max 120 pour l'API Billit)
            const allInvoices = await this.billitClient.getInvoices({ limit: 120 });

            if (!allInvoices || allInvoices.length === 0) {
              result = {
                success: false,
                message: 'Aucune facture trouvée',
              };
              break;
            }

            console.log(`📊 get_recent_invoices: ${allInvoices.length} factures récupérées, demande de ${limit}`);

            // Filtrer les factures avec une date valide et trier par date (la plus récente en premier)
            const sortedInvoices = allInvoices
              .filter(inv => inv.invoice_date && !isNaN(new Date(inv.invoice_date).getTime()))
              .sort((a, b) => {
                const dateA = new Date(a.invoice_date).getTime();
                const dateB = new Date(b.invoice_date).getTime();
                return dateB - dateA; // Ordre décroissant (plus récent en premier)
              })
              .slice(0, limit);

            console.log(`📄 ${sortedInvoices.length} factures récentes retournées`);

            result = {
              success: true,
              count: sortedInvoices.length,
              invoices: sortedInvoices.map(inv => ({
                id: inv.id,
                supplier: inv.supplier_name,
                invoice_number: inv.invoice_number,
                invoice_date: inv.invoice_date,
                due_date: inv.due_date,
                amount: inv.total_amount,
                currency: inv.currency || 'EUR',
                status: inv.status,
                communication: inv.communication || '',
              })),
            };
          } catch (error: any) {
            console.error('❌ Erreur get_recent_invoices:', error);
            result = {
              success: false,
              error: 'api_error',
              message: `Erreur lors de la récupération des factures récentes: ${error.message}`,
            };
          }
          break;
        }

        case 'get_overdue_invoices': {
          const invoices = await this.billitClient.getOverdueInvoices();
          const total = invoices.reduce((sum, inv) => sum + inv.total_amount, 0);
          result = {
            count: invoices.length,
            total_amount: total,
            currency: 'EUR',
            invoices: invoices.map(inv => ({
              supplier: inv.supplier_name,
              amount: inv.total_amount,
              days_overdue: Math.floor(
                (new Date().getTime() - new Date(inv.due_date).getTime()) / (1000 * 60 * 60 * 24)
              ),
            })),
          };
          break;
        }

        case 'get_upcoming_due_invoices': {
          const daysAhead = (args.days as number) || 7; // Par défaut 7 jours
          const now = new Date();
          const futureDate = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

          // Récupérer toutes les factures impayées
          const unpaidInvoices = await this.billitClient.getUnpaidInvoices();

          // Filtrer celles dont la date d'échéance est dans les X prochains jours
          const upcomingInvoices = unpaidInvoices.filter(inv => {
            const dueDate = new Date(inv.due_date);
            return dueDate >= now && dueDate <= futureDate;
          });

          // Trier par date d'échéance (la plus proche en premier)
          upcomingInvoices.sort((a, b) =>
            new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
          );

          const total = upcomingInvoices.reduce((sum, inv) => sum + inv.total_amount, 0);

          result = {
            count: upcomingInvoices.length,
            total_amount: total,
            currency: 'EUR',
            days_ahead: daysAhead,
            invoices: upcomingInvoices.map(inv => ({
              supplier: inv.supplier_name,
              invoice_number: inv.invoice_number,
              amount: inv.total_amount,
              due_date: inv.due_date,
              days_until_due: Math.ceil(
                (new Date(inv.due_date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
              ),
            })),
          };
          break;
        }

        case 'mark_invoice_as_paid': {
          const invoiceNumber = args.invoice_number as string;

          // D'abord trouver la facture
          const invoice = await this.billitClient.findInvoiceByNumber(invoiceNumber);
          if (!invoice) {
            result = {
              success: false,
              invoice_number: invoiceNumber,
              message: `Facture ${invoiceNumber} non trouvée`,
              verified_status: 'not_found',
            };
            break;
          }

          // Marquer comme payée
          await this.billitClient.markInvoiceAsPaidByNumber(invoiceNumber);

          // 🔍 VÉRIFICATION OBLIGATOIRE : Récupérer les détails réels depuis Billit
          const updatedDetails = await this.billitClient.getInvoiceDetails(invoice.id);

          // Vérifier le statut RÉEL dans Billit
          const isReallyPaid = updatedDetails.Paid === true;
          const statusIsPaid = updatedDetails.OrderStatus === 'Paid';

          if (isReallyPaid && statusIsPaid) {
            result = {
              success: true,
              verified: true,
              invoice_number: invoiceNumber,
              supplier: updatedDetails.CounterParty?.DisplayName || invoice.supplier_name,
              amount: updatedDetails.TotalIncl || invoice.total_amount,
              currency: updatedDetails.Currency || invoice.currency,
              paid_date: updatedDetails.PaidDate,
              message: `✅ Facture ${invoiceNumber} MARQUÉE COMME PAYÉE (vérifié dans Billit)`,
              verified_status: 'paid',
            };
          } else {
            // L'API n'a pas marché - dire la vérité !
            result = {
              success: false,
              verified: true,
              invoice_number: invoiceNumber,
              supplier: updatedDetails.CounterParty?.DisplayName || invoice.supplier_name,
              message: `⚠️ Tentative de marquage effectuée mais la facture est encore : ${updatedDetails.OrderStatus} (Paid: ${updatedDetails.Paid})`,
              verified_status: updatedDetails.OrderStatus,
              actual_paid: updatedDetails.Paid,
            };
          }
          break;
        }

        case 'get_invoice_stats': {
          const stats = await this.billitClient.getMonthlyStats();
          result = {
            month: new Date().toLocaleDateString('fr-BE', { month: 'long', year: 'numeric' }),
            total_invoices: stats.count,
            paid_count: stats.paidCount,
            paid_amount: stats.paid,
            unpaid_count: stats.unpaidCount,
            unpaid_amount: stats.unpaid,
            total_amount: stats.total,
            currency: 'EUR',
          };
          break;
        }

        case 'get_monthly_balance': {
          const bankStats = await this.bankClient.getMonthlyStats();
          result = {
            month: new Date().toLocaleDateString('fr-BE', { month: 'long', year: 'numeric' }),
            credits: bankStats.credits,
            debits: bankStats.debits,
            balance: bankStats.balance,
            credit_count: bankStats.creditCount,
            debit_count: bankStats.debitCount,
            currency: 'EUR',
          };
          break;
        }

        case 'get_monthly_credits': {
          // ✅ CORRECTION: Utiliser des dates précises pour éviter la limite de 120 transactions
          const now = new Date();
          const startDate = new Date(now.getFullYear(), now.getMonth(), 1); // 1er du mois
          const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59); // Dernier jour du mois

          const monthCredits = await this.bankClient.getCredits(startDate, endDate);
          const total = monthCredits.reduce((sum, tx) => sum + tx.amount, 0);

          result = {
            month: now.toLocaleDateString('fr-BE', { month: 'long', year: 'numeric' }),
            total_amount: total,
            transaction_count: monthCredits.length,
            currency: 'EUR',
            top_sources: this.getTopSources(monthCredits),
          };
          break;
        }

        case 'get_multi_month_revenues': {
          const months = args.months as string[];

          if (!months || !Array.isArray(months) || months.length === 0) {
            return JSON.stringify({ error: 'Le paramètre months doit être un tableau non vide de mois au format YYYY-MM' });
          }

          if (months.length < 2) {
            return JSON.stringify({
              error: 'get_multi_month_revenues nécessite MINIMUM 2 mois. Pour un seul mois, utilise get_monthly_credits.',
            });
          }

          const parseMonth = (monthStr: string): { year: number, month: number } | null => {
            const match = monthStr.match(/^(\d{4})-(\d{1,2})$/);
            if (!match) return null;
            return { year: parseInt(match[1]), month: parseInt(match[2]) - 1 };
          };

          const getLastDayOfMonth = (year: number, month: number): number => {
            return new Date(year, month + 1, 0).getDate();
          };

          const formatMonthName = (year: number, month: number): string => {
            const date = new Date(year, month, 1);
            return date.toLocaleDateString('fr-BE', { month: 'long', year: 'numeric' });
          };

          const monthlySummaries = [];
          let cumulativeRevenues = 0;
          let cumulativeCount = 0;

          for (const monthStr of months) {
            const parsed = parseMonth(monthStr);
            if (!parsed) {
              return JSON.stringify({ error: `Format de mois invalide: ${monthStr}. Utiliser YYYY-MM` });
            }

            const { year, month } = parsed;
            const startDate = new Date(year, month, 1);
            const lastDay = getLastDayOfMonth(year, month);
            const endDate = new Date(year, month, lastDay, 23, 59, 59, 999);

            const credits = await this.bankClient.getCredits(startDate, endDate);
            const totalRevenues = credits.reduce((sum, tx) => sum + tx.amount, 0);

            monthlySummaries.push({
              month: formatMonthName(year, month),
              month_key: monthStr,
              revenues: totalRevenues,
              count: credits.length,
            });

            cumulativeRevenues += totalRevenues;
            cumulativeCount += credits.length;
          }

          let directResponse = '💰 Recettes mensuelles\n\n';

          for (const summary of monthlySummaries) {
            directResponse += `📅 ${summary.month}\n`;
            directResponse += `   💰 Recettes: ${summary.revenues.toFixed(2)}€ (${summary.count} tx)\n\n`;
          }

          directResponse += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
          directResponse += '📊 TOTAL CUMULÉ\n';
          directResponse += `   💰 Recettes totales: ${cumulativeRevenues.toFixed(2)}€\n`;
          directResponse += `   📊 Total transactions: ${cumulativeCount}`;

          result = {
            monthly_summaries: monthlySummaries,
            cumulative: {
              total_revenues: cumulativeRevenues,
              total_count: cumulativeCount,
            },
            currency: 'EUR',
            direct_response: directResponse,
          };
          break;
        }

        case 'get_monthly_debits': {
          // ✅ CORRECTION: Utiliser des dates précises pour éviter la limite de 120 transactions
          const now = new Date();
          const startDate = new Date(now.getFullYear(), now.getMonth(), 1); // 1er du mois
          const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59); // Dernier jour du mois

          const monthDebits = await this.bankClient.getDebits(startDate, endDate);
          const total = monthDebits.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

          result = {
            month: now.toLocaleDateString('fr-BE', { month: 'long', year: 'numeric' }),
            total_amount: total,
            transaction_count: monthDebits.length,
            currency: 'EUR',
            top_expenses: this.getTopExpenses(monthDebits),
          };
          break;
        }

        case 'get_bank_balances': {
          const balanceService = this.commandHandler.getBankBalanceService();
          const balances = balanceService.getBalances();

          if (!balances) {
            return JSON.stringify({
              error: 'Les soldes ne sont pas encore initialisés',
              message: 'Demande à l\'utilisateur d\'utiliser /init_balances pour initialiser les soldes'
            });
          }

          const accounts = Object.values(balances.accounts).map(account => ({
            name: account.name,
            iban: account.iban,
            balance: account.balance,
            last_update: account.lastUpdate
          }));

          const total = balanceService.getTotalBalance();

          result = {
            accounts,
            total_balance: total,
            last_global_update: balances.lastUpdate,
            currency: 'EUR'
          };
          break;
        }

        case 'get_monthly_summaries': {
          const months = args.months as string[];

          if (!months || !Array.isArray(months) || months.length === 0) {
            return JSON.stringify({ error: 'Le paramètre months doit être un tableau non vide de mois au format YYYY-MM' });
          }

          // Validation : minimum 2 mois requis
          if (months.length < 2) {
            return JSON.stringify({
              error: 'get_monthly_summaries nécessite MINIMUM 2 mois. Pour un seul mois, utilise get_period_transactions.',
              hint: 'Reformule ta requête avec get_period_transactions pour obtenir les transactions d\'un seul mois.',
            });
          }

          // Fonction helper pour parser un mois YYYY-MM
          const parseMonth = (monthStr: string): { year: number, month: number } | null => {
            const match = monthStr.match(/^(\d{4})-(\d{1,2})$/);
            if (!match) return null;
            return { year: parseInt(match[1]), month: parseInt(match[2]) - 1 }; // month est 0-indexed
          };

          // Fonction helper pour obtenir le dernier jour du mois
          const getLastDayOfMonth = (year: number, month: number): number => {
            return new Date(year, month + 1, 0).getDate();
          };

          // Fonction helper pour formater un nom de mois
          const formatMonthName = (year: number, month: number): string => {
            const date = new Date(year, month, 1);
            return date.toLocaleDateString('fr-BE', { month: 'long', year: 'numeric' });
          };

          const monthlySummaries = [];
          let cumulativeCredits = 0;
          let cumulativeDebits = 0;
          let cumulativeTransactions = 0;

          // Traiter chaque mois
          for (const monthStr of months) {
            const parsed = parseMonth(monthStr);
            if (!parsed) {
              return JSON.stringify({ error: `Format de mois invalide: ${monthStr}. Utiliser YYYY-MM (ex: 2025-10)` });
            }

            const { year, month } = parsed;
            const startDate = new Date(year, month, 1);
            const lastDay = getLastDayOfMonth(year, month);
            const endDate = new Date(year, month, lastDay, 23, 59, 59, 999);

            // Récupérer les transactions pour ce mois
            const transactions = await this.bankClient.getTransactionsByPeriod(startDate, endDate);

            const credits = transactions.filter(tx => tx.type === 'Credit');
            const debits = transactions.filter(tx => tx.type === 'Debit');

            const totalCredits = credits.reduce((sum, tx) => sum + tx.amount, 0);
            const totalDebits = debits.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
            const balance = totalCredits - totalDebits;

            monthlySummaries.push({
              month: formatMonthName(year, month),
              month_key: monthStr,
              total_transactions: transactions.length,
              credits: {
                count: credits.length,
                total: totalCredits,
              },
              debits: {
                count: debits.length,
                total: totalDebits,
              },
              balance: balance,
            });

            cumulativeCredits += totalCredits;
            cumulativeDebits += totalDebits;
            cumulativeTransactions += transactions.length;
          }

          const cumulativeBalance = cumulativeCredits - cumulativeDebits;

          // Construire le message formaté
          let directResponse = '📊 Résumé des balances mensuelles\n\n';

          for (const summary of monthlySummaries) {
            directResponse += `📅 ${summary.month}\n`;
            directResponse += `   Total: ${summary.total_transactions} transactions\n`;
            directResponse += `   💰 Crédits: ${summary.credits.total.toFixed(2)}€ (${summary.credits.count} tx)\n`;
            directResponse += `   💸 Débits: ${summary.debits.total.toFixed(2)}€ (${summary.debits.count} tx)\n`;
            directResponse += `   📈 Balance: ${summary.balance.toFixed(2)}€\n\n`;
          }

          directResponse += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
          directResponse += '📊 TOTAL CUMULÉ\n';
          directResponse += `   Total: ${cumulativeTransactions} transactions\n`;
          directResponse += `   💰 Crédits: ${cumulativeCredits.toFixed(2)}€\n`;
          directResponse += `   💸 Débits: ${cumulativeDebits.toFixed(2)}€\n`;
          directResponse += `   📈 Balance: ${cumulativeBalance.toFixed(2)}€`;

          result = {
            monthly_summaries: monthlySummaries,
            cumulative: {
              total_transactions: cumulativeTransactions,
              total_credits: cumulativeCredits,
              total_debits: cumulativeDebits,
              balance: cumulativeBalance,
            },
            currency: 'EUR',
            direct_response: directResponse,
          };
          break;
        }

        case 'get_period_transactions': {
          let startDate = BankClient.parseDate(args.start_date);
          let endDate = BankClient.parseDate(args.end_date);

          if (!startDate || !endDate) {
            return JSON.stringify({ error: 'Format de date invalide' });
          }

          // IMPORTANT: Régler l'endDate à la fin de la journée (23:59:59) pour inclure toute la journée
          // Sinon, l'endDate est à 00:00:00 ce qui exclut les transactions de ce jour
          endDate.setHours(23, 59, 59, 999);

          let transactions = await this.bankClient.getTransactionsByPeriod(startDate, endDate);

          // Filtrer par type
          if (args.filter_type === 'recettes') {
            transactions = transactions.filter(tx => tx.type === 'Credit');
          } else if (args.filter_type === 'depenses') {
            transactions = transactions.filter(tx => tx.type === 'Debit');
          }

          // Filtrer par fournisseur/employé si spécifié
          if (args.supplier_name) {
            const { matchesSupplier } = await import('./supplier-aliases');
            transactions = transactions.filter(tx =>
              matchesSupplier(tx.description || '', args.supplier_name)
            );
          }

          const credits = transactions.filter(tx => tx.type === 'Credit');
          const debits = transactions.filter(tx => tx.type === 'Debit');

          const totalCredits = credits.reduce((sum, tx) => sum + tx.amount, 0);
          const totalDebits = debits.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
          const balance = totalCredits - totalDebits;

          // Détecter si l'utilisateur demande la liste détaillée ou juste le résumé
          const questionLower = this.currentQuestion.toLowerCase();
          const wantsDetailedList = questionLower.includes('liste') ||
                                    questionLower.includes('transactions') ||
                                    questionLower.includes('détail') ||
                                    questionLower.includes('détaillé');

          let directResponse: string;

          if (wantsDetailedList || transactions.length <= 10) {
            // Afficher la liste détaillée si demandée OU si peu de transactions (<=10)
            const sortedTransactions = transactions
              .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

            const maxTransactions = 30;
            const transactionsToShow = sortedTransactions.slice(0, maxTransactions);
            const hasMore = transactions.length > maxTransactions;

            const transactionsList = transactionsToShow
              .map((tx, index) => {
                const num = String(index + 1).padStart(3, ' ');
                const date = new Date(tx.date).toLocaleDateString('fr-BE');
                const type = tx.type === 'Credit' ? '💰' : '💸';
                const amount = tx.type === 'Credit'
                  ? `+${tx.amount.toFixed(2)}€`
                  : `-${Math.abs(tx.amount).toFixed(2)}€`;
                const desc = (tx.description || 'Sans description').substring(0, 100);
                return `${num}. ${date} ${type} ${amount}\n     ${desc}`;
              })
              .join('\n\n');

            const moreMessage = hasMore
              ? `\n\n... et ${transactions.length - maxTransactions} autres transactions\n(Affichage limité aux ${maxTransactions} plus récentes)`
              : '';

            directResponse = `📊 Transactions du ${startDate.toLocaleDateString('fr-BE')} au ${endDate.toLocaleDateString('fr-BE')}\n\n` +
              `Total: ${transactions.length} transactions\n` +
              `💰 Crédits: ${totalCredits.toFixed(2)}€ (${credits.length} tx)\n` +
              `💸 Débits: ${totalDebits.toFixed(2)}€ (${debits.length} tx)\n` +
              `📈 Balance: ${balance.toFixed(2)}€\n\n` +
              `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
              transactionsList +
              moreMessage;
          } else {
            // Afficher uniquement le résumé (pas de liste détaillée)
            const monthName = startDate.toLocaleDateString('fr-BE', { month: 'long', year: 'numeric' });
            directResponse = `📊 Balance de ${monthName}\n\n` +
              `Total: ${transactions.length} transactions\n` +
              `💰 Crédits: ${totalCredits.toFixed(2)}€ (${credits.length} tx)\n` +
              `💸 Débits: ${totalDebits.toFixed(2)}€ (${debits.length} tx)\n` +
              `📈 Balance: ${balance.toFixed(2)}€`;
          }

          result = {
            period: `${startDate.toLocaleDateString('fr-BE')} - ${endDate.toLocaleDateString('fr-BE')}`,
            total_transactions: transactions.length,
            credits: {
              count: credits.length,
              total: totalCredits,
            },
            debits: {
              count: debits.length,
              total: totalDebits,
            },
            balance: balance,
            currency: 'EUR',
            // 👇 AJOUT: Inclure les détails des transactions pour que l'IA puisse voir les descriptions
            transactions: transactions.map(tx => ({
              date: tx.date,
              type: tx.type,
              amount: tx.amount,
              description: tx.description, // ✅ Description incluse pour l'IA
              iban: tx.iban,
            })),
            direct_response: directResponse,
          };
          break;
        }

        case 'get_employee_salaries': {
          // Gérer month/year ou start_month/end_month ou start_date/end_date
          let startDate: Date;
          let endDate: Date;

          const monthMap: { [key: string]: number } = {
            'janvier': 0, 'fevrier': 1, 'février': 1, 'mars': 2, 'avril': 3,
            'mai': 4, 'juin': 5, 'juillet': 6, 'aout': 7, 'août': 7,
            'septembre': 8, 'octobre': 9, 'novembre': 10, 'decembre': 11, 'décembre': 11,
          };

          const parseMonth = (monthInput: string): number => {
            const lower = monthInput.toLowerCase();
            if (monthMap[lower] !== undefined) {
              return monthMap[lower];
            } else if (!isNaN(parseInt(lower))) {
              return parseInt(lower) - 1;
            }
            return -1;
          };

          if (args.month) {
            // Mois unique
            const targetMonth = parseMonth(args.month);
            if (targetMonth === -1) {
              return JSON.stringify({ error: `Mois invalide: ${args.month}` });
            }

            const targetYear = args.year ? parseInt(args.year) : new Date().getFullYear();
            startDate = new Date(targetYear, targetMonth, 1);
            endDate = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59);
          } else if (args.start_month && args.end_month) {
            // Période multi-mois (ex: octobre à décembre)
            const startMonth = parseMonth(args.start_month);
            const endMonth = parseMonth(args.end_month);

            if (startMonth === -1 || endMonth === -1) {
              return JSON.stringify({ error: `Mois invalide: ${args.start_month} ou ${args.end_month}` });
            }

            const targetYear = args.year ? parseInt(args.year) : new Date().getFullYear();
            startDate = new Date(targetYear, startMonth, 1);
            endDate = new Date(targetYear, endMonth + 1, 0, 23, 59, 59);
          } else if (args.start_date && args.end_date) {
            startDate = BankClient.parseDate(args.start_date) || new Date();
            endDate = BankClient.parseDate(args.end_date) || new Date();
          } else {
            // Par défaut: année courante complète
            const currentYear = new Date().getFullYear();
            startDate = new Date(currentYear, 0, 1);
            endDate = new Date();
          }

          if (!startDate || !endDate) {
            return JSON.stringify({ error: 'Format de date invalide' });
          }

          let transactions = await this.bankClient.getTransactionsByPeriod(startDate, endDate);

          // Filtrer par employé (si spécifié)
          const { getAllEmployees } = await import('./database');
          const employees = getAllEmployees();
          let salaryTransactions: any[];

          // Fonction stricte pour matcher un nom d'employé dans une description
          const matchesEmployeeName = (description: string, employeeName: string): boolean => {
            const desc = description.toLowerCase();
            const name = employeeName.toLowerCase();

            // Découper le nom en parties (prénom/nom)
            const nameParts = name.split(' ').filter(p => p.length > 2);

            // Vérifier si TOUS les mots significatifs du nom sont présents
            return nameParts.every(part => desc.includes(part));
          };

          // Fonction pour vérifier si c'est un virement de salaire
          const isSalaryTransaction = (description: string): boolean => {
            if (!description) return false;
            const desc = description.toLowerCase();
            // Accepter "salaire" OU "salair" (pour descriptions tronquées comme "Avance salair...")
            return desc.includes('salaire') || desc.includes('salair');
          };

          if (args.employee_name) {
            // Filtrer pour un employé spécifique ou recherche partielle (ex: "Madidi" pour tous les Madidi)
            const searchTerm = args.employee_name.toLowerCase();

            // 🔍 PRIORITÉ: Chercher d'abord dans les noms d'employés en base de données
            let matchingEmployees: any[] = [];

            if (!searchTerm.includes(' ')) {
              // Recherche partielle dans les noms d'employés
              matchingEmployees = employees.filter(emp =>
                emp.name.toLowerCase().includes(searchTerm)
              );

              console.log(`🔍 Recherche partielle "${searchTerm}": ${matchingEmployees.length} employé(s) trouvé(s) en BDD`);
            }

            // Si on a trouvé des employés en BDD, filtrer UNIQUEMENT sur ces noms
            if (matchingEmployees.length > 0) {
              salaryTransactions = transactions.filter(tx => {
                if (tx.type !== 'Debit' || !tx.description) return false;
                if (!isSalaryTransaction(tx.description)) return false;

                // Vérifier si la transaction correspond à un des employés trouvés
                return matchingEmployees.some(emp => matchesEmployeeName(tx.description, emp.name));
              });
            } else {
              // Sinon, recherche classique dans les descriptions
              salaryTransactions = transactions.filter(tx => {
                if (tx.type !== 'Debit' || !tx.description) return false;

                // Si le terme de recherche est un nom de famille seul (pas d'espace), chercher partiellement
                if (!searchTerm.includes(' ')) {
                  // Recherche partielle: vérifier si la description contient le terme ET "salaire"
                  const desc = tx.description.toLowerCase();
                  return desc.includes('salaire') && desc.includes(searchTerm);
                } else {
                  // Recherche exacte: contient "salaire" ET le nom complet correspond
                  return isSalaryTransaction(tx.description) && matchesEmployeeName(tx.description, args.employee_name);
                }
              });
            }
          } else {
            // Obtenir TOUS les salaires
            salaryTransactions = transactions.filter(tx => {
              if (tx.type !== 'Debit' || !tx.description) return false;
              // Accepter si: contient "salaire" OU si correspond à un nom d'employé
              return isSalaryTransaction(tx.description) ||
                     employees.some(emp => matchesEmployeeName(tx.description, emp.name));
            });
          }

          const totalPaid = salaryTransactions.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

          // 🔍 RECHERCHE FLOUE: Si aucun résultat et un nom d'employé était spécifié, chercher des noms similaires
          let suggestionMessage = '';
          if (args.employee_name && totalPaid === 0) {
            console.log(`🔍 Recherche floue pour "${args.employee_name}" (0 résultats trouvés)...`);

            // Si le nom contient un espace, chercher une correspondance exacte avec autocorrection
            if (args.employee_name.includes(' ')) {
              const closestMatch = await this.findClosestEmployee(args.employee_name);

              if (closestMatch) {
                console.log(`✨ Employé similaire trouvé: "${closestMatch.employee.name}" (distance: ${closestMatch.distance})`);

                // Réessayer la recherche avec le nom corrigé
                const correctedTransactions = transactions.filter(tx => {
                  if (tx.type !== 'Debit' || !tx.description) return false;
                  return isSalaryTransaction(tx.description) && matchesEmployeeName(tx.description, closestMatch.employee.name);
                });

                if (correctedTransactions.length > 0) {
                  salaryTransactions = correctedTransactions;
                  suggestionMessage = `\n\n💡 Aucun employé trouvé pour "${args.employee_name}". Résultats affichés pour "${closestMatch.employee.name}" à la place.`;
                }
              }
            } else {
              // Si c'est un nom partiel (sans espace), proposer des suggestions
              const suggestions = await this.findSimilarEmployees(args.employee_name, 5);

              if (suggestions.length > 0) {
                console.log(`💡 ${suggestions.length} suggestion(s) trouvée(s) pour "${args.employee_name}"`);

                suggestionMessage = `\n\n❓ Aucun employé trouvé pour "${args.employee_name}".\n\n`;
                suggestionMessage += `Vouliez-vous dire :\n`;
                suggestions.forEach((s, i) => {
                  suggestionMessage += `${i + 1}. ${s.employee.name}\n`;
                });
                suggestionMessage += `\nVeuillez préciser le nom complet de l'employé.`;
              } else {
                console.log(`❌ Aucun employé similaire trouvé pour "${args.employee_name}"`);
              }
            }
          }

          // Recalculer le total après recherche floue
          const finalTotalPaid = salaryTransactions.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

          // Trier par date décroissante (plus récent en premier)
          salaryTransactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

          // 🤖 AUTO-APPRENTISSAGE: Détecter et ajouter automatiquement les employés inconnus
          const { addEmployee } = await import('./database');
          const newEmployeesAdded: string[] = [];

          salaryTransactions.forEach(tx => {
            const desc = tx.description || '';
            const descLower = desc.toLowerCase();

            // Vérifier si l'employé est déjà connu
            const isKnown = employees.some(emp => {
              const nameParts = emp.name.toLowerCase().split(' ');
              return nameParts.every(part => descLower.includes(part));
            });

            if (!isKnown && isSalaryTransaction(desc)) {
              // Extraire le nom de la description
              // Format: "VIREMENT EN FAVEUR DE [NOM] BE..."
              const match = desc.match(/VIREMENT EN FAVEUR DE\s+([^B]+?)\s+BE/i);
              if (match) {
                const extractedName = match[1].trim();

                // Vérifier qu'on n'a pas déjà ajouté ce nom
                const alreadyAdded = newEmployeesAdded.some(name =>
                  name.toLowerCase() === extractedName.toLowerCase()
                );

                if (!alreadyAdded) {
                  // Vérifier que le nom n'existe pas déjà (double check)
                  const existsInDb = employees.some(emp =>
                    emp.name.toLowerCase() === extractedName.toLowerCase()
                  );

                  if (!existsInDb) {
                    // Ajouter automatiquement à la base de données
                    addEmployee(extractedName);
                    employees.push({
                      id: 0,
                      name: extractedName,
                      chat_id: null,
                      position: null,
                      hire_date: null,
                      is_active: true,
                      created_at: new Date().toISOString()
                    });
                    newEmployeesAdded.push(extractedName);
                    console.log(`🤖 AUTO-APPRENTISSAGE: Nouvel employé ajouté automatiquement: "${extractedName}"`);
                  }
                }
              }
            }
          });

          // 📊 ANALYSE MENSUELLE ET PAR EMPLOYÉ: si période > 1 mois OU si "analyse" demandée
          let monthlyAnalysis = '';
          const questionLower = this.currentQuestion.toLowerCase();
          const userAsksForAnalysis = questionLower.includes('analyse') || questionLower.includes('top');
          const isMultiMonthPeriod = (!args.month && !args.employee_name && salaryTransactions.length > 0) || userAsksForAnalysis;

          // Ne montrer l'analyse par employé que si aucun employé spécifique n'est demandé
          // ET (pas un mois spécifique OU l'utilisateur demande explicitement "analyse")
          const showEmployeeAnalysis = !args.employee_name && (!args.month || userAsksForAnalysis) && isMultiMonthPeriod;

          if (isMultiMonthPeriod) {
            // ========== ANALYSE PAR EMPLOYÉ (seulement si pas d'employé spécifique) ==========
            const employeeTotals: { [key: string]: { total: number; count: number } } = {};

            salaryTransactions.forEach(tx => {
              const descLower = (tx.description || '').toLowerCase();

              // Extraire le nom de l'employé
              employees.forEach(emp => {
                const nameParts = emp.name.toLowerCase().split(' ');
                if (nameParts.every(part => descLower.includes(part))) {
                  if (!employeeTotals[emp.name]) {
                    employeeTotals[emp.name] = { total: 0, count: 0 };
                  }
                  employeeTotals[emp.name].total += Math.abs(tx.amount);
                  employeeTotals[emp.name].count++;
                }
              });
            });

            // Trier les employés par total décroissant
            const sortedEmployees = Object.entries(employeeTotals)
              .map(([name, data]) => ({ name, ...data }))
              .sort((a, b) => b.total - a.total);

            // ========== ANALYSE PAR MOIS ==========
            const monthlyTotals: { [key: string]: { total: number; count: number; employees: Set<string> } } = {};

            salaryTransactions.forEach(tx => {
              const txDate = new Date(tx.date);
              const monthKey = `${txDate.getFullYear()}-${String(txDate.getMonth() + 1).padStart(2, '0')}`;

              if (!monthlyTotals[monthKey]) {
                monthlyTotals[monthKey] = { total: 0, count: 0, employees: new Set() };
              }

              monthlyTotals[monthKey].total += Math.abs(tx.amount);
              monthlyTotals[monthKey].count++;

              // Extraire le nom de l'employé
              const descLower = (tx.description || '').toLowerCase();
              employees.forEach(emp => {
                const nameParts = emp.name.toLowerCase().split(' ');
                if (nameParts.every(part => descLower.includes(part))) {
                  monthlyTotals[monthKey].employees.add(emp.name);
                }
              });
            });

            // Convertir en tableau et trier par total décroissant
            const sortedMonths = Object.entries(monthlyTotals)
              .map(([key, data]) => {
                const [year, month] = key.split('-');
                const date = new Date(parseInt(year), parseInt(month) - 1, 1);
                const monthName = date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
                return {
                  monthName,
                  ...data,
                  employeesList: Array.from(data.employees)
                };
              })
              .sort((a, b) => b.total - a.total);

            // ========== GÉNÉRATION DU TEXTE D'ANALYSE ==========
            if (sortedEmployees.length > 0 && showEmployeeAnalysis) {
              const topEmployee = sortedEmployees[0];
              monthlyAnalysis = `\n\n📊 ANALYSE DES SALAIRES\n\n`;
              monthlyAnalysis += `👤 Employé avec le plus de salaires perçus:\n`;
              monthlyAnalysis += `   🥇 ${topEmployee.name}: ${topEmployee.total.toFixed(2)}€ (${topEmployee.count} paiements)\n\n`;

              // Top des employés (détection automatique de "top X" ou "les X employés" dans la question)
              const currentQuestionLower = this.currentQuestion.toLowerCase();
              const topMatch = currentQuestionLower.match(/(?:top\s*(\d+)|les?\s+(\d+)\s+employ)/);
              const topN = topMatch ? Math.min(parseInt(topMatch[1] || topMatch[2]), sortedEmployees.length) : Math.min(5, sortedEmployees.length);

              if (sortedEmployees.length > 1) {
                monthlyAnalysis += `\n📊 Top ${topN} des employés:\n`;
                sortedEmployees.slice(0, topN).forEach((emp, i) => {
                  const icon = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
                  monthlyAnalysis += `${icon} ${emp.name}: ${emp.total.toFixed(2)}€\n`;
                });
              }
            }

            if (sortedMonths.length > 1) {
              const topMonth = sortedMonths[0];
              monthlyAnalysis += `\n\n📅 Mois avec le plus de salaires payés:\n`;
              monthlyAnalysis += `   🥇 ${topMonth.monthName}: ${topMonth.total.toFixed(2)}€ (${topMonth.count} paiements)\n`;
              monthlyAnalysis += `   Employés: ${topMonth.employeesList.length} personnes\n\n`;

              monthlyAnalysis += `📈 Répartition par mois:\n`;
              sortedMonths.forEach((m, i) => {
                const icon = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '  ';
                monthlyAnalysis += `${icon} ${m.monthName}: ${m.total.toFixed(2)}€ (${m.count} paiements)\n`;
              });
            }
          }

          // Formatter la liste complète des salaires pour Telegram
          const salaryList = salaryTransactions.map((tx, index) => {
            const num = String(index + 1).padStart(2, ' ');
            const date = new Date(tx.date).toLocaleDateString('fr-BE');
            const amount = Math.abs(tx.amount).toFixed(2);
            const desc = tx.description || 'Sans description';

            // Extraire le nom de l'employé de la description
            let employeeName = 'Inconnu';
            const descLower = desc.toLowerCase();
            employees.forEach(emp => {
              const nameParts = emp.name.toLowerCase().split(' ');
              if (nameParts.every(part => descLower.includes(part))) {
                employeeName = emp.name;
              }
            });

            return `${num}. ${date} - ${amount}€ - ${employeeName}`;
          }).join('\n');

          // Ajouter une note si de nouveaux employés ont été ajoutés
          const autoLearnNote = newEmployeesAdded.length > 0
            ? `\n\n🤖 ${newEmployeesAdded.length} nouvel(s) employé(s) ajouté(s) automatiquement:\n` +
              newEmployeesAdded.map(name => `   • ${name}`).join('\n')
            : '';

          // Générer le titre de période approprié
          let periodTitle: string;
          if (args.month) {
            // Si un mois spécifique est demandé
            periodTitle = startDate.toLocaleDateString('fr-BE', { month: 'long', year: 'numeric' });
          } else if (args.start_month && args.end_month) {
            // Si période multi-mois (ex: "octobre à décembre 2025")
            const startMonthName = startDate.toLocaleDateString('fr-BE', { month: 'long' });
            const endMonthName = endDate.toLocaleDateString('fr-BE', { month: 'long' });
            const year = startDate.getFullYear();
            periodTitle = `${startMonthName} à ${endMonthName} ${year}`;
          } else if (args.year) {
            // Si une année spécifique est demandée
            periodTitle = `année ${args.year}`;
          } else {
            // Période personnalisée ou année en cours
            const isCurrentYear = startDate.getFullYear() === new Date().getFullYear() &&
                                 endDate.getFullYear() === new Date().getFullYear();
            if (isCurrentYear) {
              periodTitle = `année ${startDate.getFullYear()}`;
            } else {
              periodTitle = `${startDate.toLocaleDateString('fr-BE')} - ${endDate.toLocaleDateString('fr-BE')}`;
            }
          }

          // Décider si on inclut la liste détaillée
          // 1. Si l'utilisateur demande explicitement la liste (include_details: true OU mots-clés dans la question)
          // 2. Si recherche spécifique d'UN employé avec peu de transactions (≤ 10)
          // 3. SAUF si la question demande un "top X" sans le mot "liste" (dans ce cas, juste l'analyse suffit)
          // 4. SAUF si mois unique avec beaucoup de transactions (> 10) sans demande explicite
          const userAsksForList = questionLower.includes('liste') ||
                                 questionLower.includes('détail') ||
                                 questionLower.includes('à qui') ||
                                 questionLower.includes('qui a') ||
                                 questionLower.includes('employés') ||
                                 questionLower.includes('noms') ||
                                 questionLower.includes('qui j\'ai');
          const userWantsDetails = args.include_details === true || userAsksForList;
          const userAsksForTopOnly = /top\s*\d+/.test(questionLower) && !userAsksForList;
          const isSpecificEmployeeSearch = args.employee_name && salaryTransactions.length <= 10;
          const isSingleMonthManyTransactions = args.month && salaryTransactions.length > 10;
          // Si l'utilisateur demande explicitement les détails, on les affiche même pour mois unique >10
          const includeDetailedList = !userAsksForTopOnly && (
            userWantsDetails ||  // Demande explicite prioritaire
            isSpecificEmployeeSearch ||  // Recherche spécifique
            !isSingleMonthManyTransactions  // Ou pas mois unique avec beaucoup
          );

          // 📊 DÉTECTION DES QUESTIONS SUR MIN/MAX
          let minMaxAnalysis = '';
          const userAsksForMin = questionLower.includes('plus bas') || questionLower.includes('minimum') || questionLower.includes('moins payé') || questionLower.includes('le moins');
          const userAsksForMax = questionLower.includes('plus haut') || questionLower.includes('plus élevé') || questionLower.includes('maximum') || questionLower.includes('le plus') || questionLower.includes('mieux payé');

          // 📊 DÉTECTION DES QUESTIONS DE COMPARAISON/CLASSEMENT
          const userAsksForRanking = questionLower.includes('se situe') || questionLower.includes('position') ||
                                      questionLower.includes('rang') || questionLower.includes('classement') ||
                                      questionLower.includes('par rapport') || questionLower.includes('comparé');

          if (salaryTransactions.length > 0 && (userAsksForMin || userAsksForMax)) {
            // Trouver min et max
            let minTx = salaryTransactions[0];
            let maxTx = salaryTransactions[0];

            salaryTransactions.forEach(tx => {
              const amount = Math.abs(tx.amount);
              if (amount < Math.abs(minTx.amount)) minTx = tx;
              if (amount > Math.abs(maxTx.amount)) maxTx = tx;
            });

            // Extraire les noms d'employés
            const { getAllEmployees } = await import('./database');
            const employees = getAllEmployees();

            const extractEmployeeName = (description: string): string => {
              const descLower = description.toLowerCase();
              for (const emp of employees) {
                const nameParts = emp.name.toLowerCase().split(' ');
                if (nameParts.every(part => descLower.includes(part))) {
                  return emp.name;
                }
              }
              return 'Inconnu';
            };

            minMaxAnalysis = '\n\n📊 ANALYSE MIN/MAX\n\n';

            if (userAsksForMin) {
              const minEmployee = extractEmployeeName(minTx.description || '');
              const minDate = new Date(minTx.date).toLocaleDateString('fr-BE');
              minMaxAnalysis += `💵 SALAIRE LE PLUS BAS:\n`;
              minMaxAnalysis += `   ${Math.abs(minTx.amount).toFixed(2)}€ - ${minEmployee} (${minDate})\n`;
            }

            if (userAsksForMax) {
              const maxEmployee = extractEmployeeName(maxTx.description || '');
              const maxDate = new Date(maxTx.date).toLocaleDateString('fr-BE');
              if (userAsksForMin) minMaxAnalysis += '\n';
              minMaxAnalysis += `💰 SALAIRE LE PLUS HAUT:\n`;
              minMaxAnalysis += `   ${Math.abs(maxTx.amount).toFixed(2)}€ - ${maxEmployee} (${maxDate})\n`;
            }
          }

          // 📊 ANALYSE DE CLASSEMENT (si employé spécifique demandé)
          let rankingAnalysis = '';
          if (args.employee_name && userAsksForRanking && salaryTransactions.length > 0) {
            // Récupérer TOUS les salaires de TOUS les employés pour comparaison
            const allTransactions = await this.bankClient.getTransactionsByPeriod(startDate, endDate);
            const { getAllEmployees } = await import('./database');
            const allEmployees = getAllEmployees();

            // Grouper par employé
            const employeeTotals: { [name: string]: number } = {};

            allTransactions.forEach(tx => {
              if (tx.type !== 'Debit' || !tx.description) return;
              const desc = tx.description.toLowerCase();
              if (!desc.includes('salaire')) return;

              // Trouver l'employé correspondant
              for (const emp of allEmployees) {
                const nameParts = emp.name.toLowerCase().split(' ');
                if (nameParts.every(part => desc.includes(part))) {
                  if (!employeeTotals[emp.name]) {
                    employeeTotals[emp.name] = 0;
                  }
                  employeeTotals[emp.name] += Math.abs(tx.amount);
                  break;
                }
              }
            });

            // Trier par total décroissant
            const ranking = Object.entries(employeeTotals)
              .map(([name, total]) => ({ name, total }))
              .sort((a, b) => b.total - a.total);

            // Trouver la position de l'employé demandé
            const targetEmployeeName = args.employee_name.toLowerCase();
            let employeeRank = -1;
            let employeeName = '';
            let employeeTotal = 0;

            for (let i = 0; i < ranking.length; i++) {
              const rankName = ranking[i].name.toLowerCase();
              if (rankName.includes(targetEmployeeName) || targetEmployeeName.includes(rankName.split(' ')[0])) {
                employeeRank = i + 1;
                employeeName = ranking[i].name;
                employeeTotal = ranking[i].total;
                break;
              }
            }

            if (employeeRank > 0 && ranking.length > 0) {
              // Calculer la médiane
              const sortedTotals = ranking.map(r => r.total).sort((a, b) => a - b);
              const medianIndex = Math.floor(sortedTotals.length / 2);
              const median = sortedTotals.length % 2 === 0
                ? (sortedTotals[medianIndex - 1] + sortedTotals[medianIndex]) / 2
                : sortedTotals[medianIndex];

              rankingAnalysis = '\n\n📊 CLASSEMENT PARMI LES EMPLOYÉS\n\n';
              rankingAnalysis += `${employeeName} se situe:\n`;
              rankingAnalysis += `   📍 Position: ${employeeRank}${employeeRank === 1 ? 'er' : 'ème'} sur ${ranking.length} employés\n`;
              rankingAnalysis += `   💰 Total perçu: ${employeeTotal.toFixed(2)}€\n\n`;

              rankingAnalysis += `Comparaison:\n`;
              rankingAnalysis += `   🥇 1er: ${ranking[0].name} (${ranking[0].total.toFixed(2)}€)\n`;
              rankingAnalysis += `   📊 Médiane: ${median.toFixed(2)}€\n`;

              const comparison = employeeTotal > median ? 'au-dessus' : employeeTotal < median ? 'en-dessous' : 'à';
              rankingAnalysis += `   📍 ${employeeName}: ${employeeTotal.toFixed(2)}€ (${comparison} de la médiane)\n`;

              if (ranking.length > 1) {
                rankingAnalysis += `   📉 Dernier: ${ranking[ranking.length - 1].name} (${ranking[ranking.length - 1].total.toFixed(2)}€)\n`;
              }
            }
          }

          let directResponse = `💰 Salaires de ${periodTitle}\n\n` +
            `Total: ${finalTotalPaid.toFixed(2)}€ (${salaryTransactions.length} paiements)` +
            monthlyAnalysis +
            minMaxAnalysis +
            rankingAnalysis;

          if (includeDetailedList) {
            directResponse += `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` + salaryList;
          }

          directResponse += autoLearnNote + suggestionMessage;

          result = {
            employee_name: args.employee_name || 'Tous les employés',
            period: `${startDate.toLocaleDateString('fr-BE')} - ${endDate.toLocaleDateString('fr-BE')}`,
            total_paid: finalTotalPaid,
            payment_count: salaryTransactions.length,
            payments: salaryTransactions.map(tx => ({
              date: tx.date,
              amount: Math.abs(tx.amount),
              description: tx.description,
            })),
            currency: 'EUR',
            direct_response: directResponse,
          };
          break;
        }

        case 'compare_employee_salaries': {
          // Validation: au moins 2 employés
          if (!args.employee_names || args.employee_names.length < 2) {
            result = {
              error: 'Au moins 2 employés sont requis pour une comparaison',
              direct_response: '❌ Veuillez spécifier au moins 2 employés à comparer.'
            };
            break;
          }

          // Déterminer la période
          let startDate: Date;
          let endDate: Date;

          if (args.month) {
            const monthMap: { [key: string]: number } = {
              'janvier': 0, 'fevrier': 1, 'février': 1, 'mars': 2, 'avril': 3,
              'mai': 4, 'juin': 5, 'juillet': 6, 'aout': 7, 'août': 7,
              'septembre': 8, 'octobre': 9, 'novembre': 10, 'decembre': 11, 'décembre': 11
            };

            let targetMonth = -1;
            const monthInput = args.month.toLowerCase();

            if (monthMap[monthInput] !== undefined) {
              targetMonth = monthMap[monthInput];
            } else if (!isNaN(parseInt(monthInput))) {
              targetMonth = parseInt(monthInput) - 1;
            }

            const targetYear = args.year ? parseInt(args.year) : new Date().getFullYear();
            startDate = new Date(targetYear, targetMonth, 1);
            endDate = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59);
          } else {
            const currentYear = args.year ? parseInt(args.year) : new Date().getFullYear();
            startDate = new Date(currentYear, 0, 1);
            endDate = new Date();
          }

          // Récupérer toutes les transactions
          const transactions = await this.bankClient.getTransactionsByPeriod(startDate, endDate);
          const { getAllEmployees } = await import('./database');
          const employees = getAllEmployees();

          // Fonction pour extraire les salaires d'un employé
          const getEmployeeSalaries = (employeeName: string) => {
            // Fuzzy matching
            let targetEmployee = employees.find(emp =>
              emp.name.toLowerCase().includes(employeeName.toLowerCase())
            );

            if (!targetEmployee) {
              const searchLower = employeeName.toLowerCase();
              const searchParts = searchLower.split(' ');

              const closestMatch = employees.reduce((best: any, emp: any) => {
                const empNameLower = emp.name.toLowerCase();
                const nameParts = empNameLower.split(' ');

                let distance = this.levenshteinDistance(searchLower, empNameLower);

                // 🔄 Tester aussi l'ordre inversé (ex: "Mokhlis Jamhoun" → "Jamhoun Mokhlis")
                if (searchParts.length === 2 && nameParts.length === 2) {
                  const reversedSearch = `${searchParts[1]} ${searchParts[0]}`;
                  const reversedDistance = this.levenshteinDistance(reversedSearch, empNameLower);
                  distance = Math.min(distance, reversedDistance);
                }

                if (!best || distance < best.distance) {
                  return { employee: emp, distance };
                }
                return best;
              }, null);

              if (closestMatch && closestMatch.distance <= 3) {
                targetEmployee = closestMatch.employee;
              }
            }

            if (!targetEmployee) {
              return { name: employeeName, total: 0, count: 0, transactions: [], found: false, avg: 0, max: 0, maxDate: null };
            }

            const salaries = transactions.filter(tx => {
              if (tx.type !== 'Debit' || !tx.description) return false;
              const desc = tx.description.toLowerCase();
              if (!desc.includes('salaire') && !desc.includes('salair')) return false;

              const nameParts = targetEmployee.name.toLowerCase().split(' ');
              return nameParts.every(part => desc.includes(part));
            });

            const total = salaries.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
            const sortedSalaries = salaries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            const max = sortedSalaries.length > 0 ? sortedSalaries.reduce((m, tx) => Math.max(m, Math.abs(tx.amount)), 0) : 0;
            const maxTx = sortedSalaries.find(tx => Math.abs(tx.amount) === max);

            return {
              name: targetEmployee.name,
              total,
              count: salaries.length,
              avg: salaries.length > 0 ? total / salaries.length : 0,
              max,
              maxDate: maxTx ? new Date(maxTx.date) : null,
              transactions: sortedSalaries,
              found: true
            };
          };

          // Récupérer les données de tous les employés
          const employeesData = args.employee_names.map(getEmployeeSalaries);

          // Vérifier si tous ont été trouvés
          const notFound = employeesData.filter((e: any) => !e.found);
          if (notFound.length > 0) {
            result = {
              error: `Employé(s) non trouvé(s): ${notFound.map((e: any) => e.name).join(', ')}`,
              direct_response: `❌ Employé(s) non trouvé(s): ${notFound.map((e: any) => e.name).join(', ')}`
            };
            break;
          }

          // Trier par total décroissant
          const sorted = employeesData.sort((a: any, b: any) => b.total - a.total);

          // Générer le titre de période
          let periodTitle: string;
          if (args.month) {
            periodTitle = startDate.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
          } else {
            periodTitle = `année ${startDate.getFullYear()}`;
          }

          // Générer la réponse comparative
          let directResponse = `📊 COMPARAISON DE SALAIRES\n\n`;
          directResponse += `${sorted.map((e: any) => e.name).join(' vs ')} (${periodTitle})\n\n`;
          directResponse += `💰 Classement par total perçu:\n`;
          sorted.forEach((emp: any, i: number) => {
            const icon = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
            directResponse += `   ${icon} ${emp.name}: ${emp.total.toFixed(2)}€ (${emp.count} paiements)\n`;
          });

          if (sorted.length === 2) {
            const diff = sorted[0].total - sorted[1].total;
            directResponse += `\n📈 Différence: ${Math.abs(diff).toFixed(2)}€ en faveur de ${sorted[0].name}\n`;
          }

          directResponse += `\n📊 Salaires moyens:\n`;
          sorted.forEach((emp: any, i: number) => {
            const icon = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
            directResponse += `   ${icon} ${emp.name}: ${emp.avg.toFixed(2)}€ par paiement\n`;
          });

          directResponse += `\n🏆 Plus hauts paiements individuels:\n`;
          sorted.forEach((emp: any) => {
            directResponse += `   • ${emp.name}: ${emp.max.toFixed(2)}€${emp.maxDate ? ` (${emp.maxDate.toLocaleDateString('fr-BE')})` : ''}\n`;
          });

          result = {
            employees: sorted.map((e: any) => ({
              name: e.name,
              total: e.total,
              count: e.count,
              avg: e.avg,
              max: e.max
            })),
            winner: sorted[0].name,
            direct_response: directResponse
          };
          break;
        }

        case 'analyze_supplier_expenses': {
          // Gérer month/year ou start_month/end_month
          let startDate: Date;
          let endDate: Date;

          const monthMap: { [key: string]: number } = {
            'janvier': 0, 'fevrier': 1, 'février': 1, 'mars': 2, 'avril': 3,
            'mai': 4, 'juin': 5, 'juillet': 6, 'aout': 7, 'août': 7,
            'septembre': 8, 'octobre': 9, 'novembre': 10, 'decembre': 11, 'décembre': 11,
          };

          const parseMonth = (monthInput: string): number => {
            const lower = monthInput.toLowerCase();
            if (monthMap[lower] !== undefined) {
              return monthMap[lower];
            } else if (!isNaN(parseInt(lower))) {
              return parseInt(lower) - 1;
            }
            return -1;
          };

          if (args.month) {
            // Mois unique
            const targetMonth = parseMonth(args.month);
            if (targetMonth === -1) {
              return JSON.stringify({ error: `Mois invalide: ${args.month}` });
            }

            const targetYear = args.year ? parseInt(args.year) : new Date().getFullYear();
            startDate = new Date(targetYear, targetMonth, 1);
            endDate = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59);
          } else if (args.start_month && args.end_month) {
            // Période multi-mois (ex: octobre à décembre)
            const startMonth = parseMonth(args.start_month);
            const endMonth = parseMonth(args.end_month);

            if (startMonth === -1 || endMonth === -1) {
              return JSON.stringify({ error: `Mois invalide: ${args.start_month} ou ${args.end_month}` });
            }

            const targetYear = args.year ? parseInt(args.year) : new Date().getFullYear();
            startDate = new Date(targetYear, startMonth, 1);
            endDate = new Date(targetYear, endMonth + 1, 0, 23, 59, 59);
          } else {
            // Par défaut: année courante complète
            const currentYear = args.year ? parseInt(args.year) : new Date().getFullYear();
            startDate = new Date(currentYear, 0, 1);
            endDate = new Date();
          }

          if (!startDate || !endDate) {
            return JSON.stringify({ error: 'Format de date invalide' });
          }

          // Récupérer les transactions
          let transactions = await this.bankClient.getTransactionsByPeriod(startDate, endDate);

          // Importer les fonctions de fournisseur
          const { matchesSupplier, SUPPLIER_ALIASES } = await import('./supplier-aliases');
          const suppliers = Object.keys(SUPPLIER_ALIASES);

          // Filtrer les transactions du fournisseur (TOUS types : crédit ET débit)
          let supplierTransactions: any[];

          if (args.supplier_name) {
            // Filtrer pour un fournisseur spécifique
            const searchTerm = args.supplier_name.toLowerCase();

            // Recherche floue de fournisseur
            let matchingSuppliers = suppliers.filter((sup: any) =>
              sup.toLowerCase().includes(searchTerm) ||
              matchesSupplier(sup, searchTerm)
            );

            console.log(`🔍 Recherche fournisseur "${searchTerm}": ${matchingSuppliers.length} fournisseur(s) trouvé(s)`);

            if (matchingSuppliers.length > 0) {
              supplierTransactions = transactions.filter(tx => {
                // ✅ CHANGEMENT: Accepter TOUS les types (Credit et Debit)
                return matchingSuppliers.some((sup: string) => matchesSupplier(tx.description || '', sup));
              });
            } else {
              // Recherche directe dans les descriptions
              supplierTransactions = transactions.filter(tx =>
                matchesSupplier(tx.description || '', args.supplier_name)
              );
            }
          } else {
            // Obtenir TOUTES les transactions vers fournisseurs connus (débits uniquement pour le top global)
            supplierTransactions = transactions.filter(tx => {
              if (tx.type !== 'Debit') return false;
              // Vérifier si correspond à un fournisseur connu
              return suppliers.some((sup: string) => matchesSupplier(tx.description || '', sup));
            });
          }

          // ✨ DÉTECTION AUTOMATIQUE: Dépenses ou Revenus ?
          const debits = supplierTransactions.filter(tx => tx.type === 'Debit');
          const credits = supplierTransactions.filter(tx => tx.type === 'Credit');
          const totalDebits = debits.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
          const totalCredits = credits.reduce((sum, tx) => sum + tx.amount, 0);

          // Si plus de crédits que de débits, c'est un partenaire qui verse (revenus)
          const isRevenuePartner = totalCredits > totalDebits;
          const supplierExpenses = isRevenuePartner ? credits : debits;

          const totalSpent = supplierExpenses.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

          // Trier par date décroissante
          supplierExpenses.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

          // 📊 ANALYSE PAR FOURNISSEUR
          const questionLower = this.currentQuestion.toLowerCase();
          const userAsksForAnalysis = questionLower.includes('analyse') || questionLower.includes('top');
          const isMultiSupplierQuery = !args.supplier_name && supplierExpenses.length > 0;
          const isSpecificSupplierAnalysis = args.supplier_name && supplierExpenses.length > 0;

          let analysisText = '';
          const showSupplierAnalysis = !args.supplier_name && isMultiSupplierQuery;

          if (isSpecificSupplierAnalysis) {
            // ✨ ANALYSE DÉTAILLÉE D'UN FOURNISSEUR SPÉCIFIQUE ✨
            const amounts = supplierExpenses.map(tx => Math.abs(tx.amount));
            const minAmount = Math.min(...amounts);
            const maxAmount = Math.max(...amounts);
            const avgAmount = totalSpent / supplierExpenses.length;

            // Label adapté selon le type
            const transactionLabel = isRevenuePartner ? 'versements' : 'paiements';
            const lastTransactionsLabel = isRevenuePartner ? 'Derniers versements' : 'Derniers paiements';

            // Calculer l'évolution mensuelle
            const monthlyBreakdown: { [key: string]: { total: number; count: number } } = {};
            supplierExpenses.forEach(tx => {
              const monthKey = new Date(tx.date).toLocaleDateString('fr-BE', { month: 'long', year: 'numeric' });
              if (!monthlyBreakdown[monthKey]) {
                monthlyBreakdown[monthKey] = { total: 0, count: 0 };
              }
              monthlyBreakdown[monthKey].total += Math.abs(tx.amount);
              monthlyBreakdown[monthKey].count++;
            });

            // Trier les mois par date
            const sortedMonths = Object.entries(monthlyBreakdown)
              .map(([month, data]) => ({ month, ...data }))
              .sort((a, b) => {
                // Parser les dates pour les comparer
                const dateA = new Date(a.month.split(' ').reverse().join('-'));
                const dateB = new Date(b.month.split(' ').reverse().join('-'));
                return dateB.getTime() - dateA.getTime(); // Plus récent en premier
              });

            analysisText = `\n\n📊 ANALYSE DÉTAILLÉE\n\n`;
            analysisText += `💰 Statistiques:\n`;
            analysisText += `   • Montant total: ${totalSpent.toFixed(2)}€\n`;
            analysisText += `   • Nombre de ${transactionLabel}: ${supplierExpenses.length}\n`;
            analysisText += `   • Montant moyen: ${avgAmount.toFixed(2)}€\n`;
            analysisText += `   • Montant minimum: ${minAmount.toFixed(2)}€\n`;
            analysisText += `   • Montant maximum: ${maxAmount.toFixed(2)}€\n`;

            if (sortedMonths.length > 1) {
              analysisText += `\n📅 Évolution mensuelle:\n`;
              sortedMonths.forEach(m => {
                const avgMonth = m.total / m.count;
                analysisText += `   • ${m.month}: ${m.total.toFixed(2)}€ (${m.count} ${transactionLabel}, moy: ${avgMonth.toFixed(2)}€)\n`;
              });
            }

            // Afficher les 10 dernières transactions
            if (supplierExpenses.length > 0) {
              const recentPayments = supplierExpenses.slice(0, Math.min(10, supplierExpenses.length));
              analysisText += `\n💳 ${lastTransactionsLabel}:\n`;
              recentPayments.forEach((tx, i) => {
                const date = new Date(tx.date).toLocaleDateString('fr-BE');
                const amount = Math.abs(tx.amount).toFixed(2);
                analysisText += `   ${i + 1}. ${date}: ${amount}€\n`;
              });

              if (supplierExpenses.length > 10) {
                analysisText += `   ... et ${supplierExpenses.length - 10} autres ${transactionLabel}\n`;
              }
            }
          } else if (showSupplierAnalysis) {
            // Grouper par fournisseur
            const supplierTotals: { [key: string]: { total: number; count: number } } = {};

            supplierExpenses.forEach(tx => {
              const desc = tx.description || '';

              // Identifier le fournisseur
              for (const supplier of suppliers) {
                if (matchesSupplier(desc, supplier)) {
                  if (!supplierTotals[supplier]) {
                    supplierTotals[supplier] = { total: 0, count: 0 };
                  }
                  supplierTotals[supplier].total += Math.abs(tx.amount);
                  supplierTotals[supplier].count++;
                  break; // Un seul fournisseur par transaction
                }
              }
            });

            // Trier par total décroissant
            const sortedSuppliers = Object.entries(supplierTotals)
              .map(([name, data]) => ({ name, ...data }))
              .sort((a, b) => b.total - a.total);

            if (sortedSuppliers.length > 0) {
              // Détection de "top X" dans la question
              const topMatch = questionLower.match(/(?:top\s*(\d+)|les?\s+(\d+)\s+fournisseurs)/);
              const topN = topMatch ? Math.min(parseInt(topMatch[1] || topMatch[2]), sortedSuppliers.length) : Math.min(5, sortedSuppliers.length);

              analysisText = `\n\n📊 ANALYSE DES DÉPENSES FOURNISSEURS\n\n`;
              analysisText += `🏪 Top ${topN} des fournisseurs par dépenses:\n`;
              sortedSuppliers.slice(0, topN).forEach((sup, i) => {
                const icon = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
                analysisText += `${icon} ${sup.name}: ${sup.total.toFixed(2)}€ (${sup.count} paiements)\n`;
              });

              // Statistiques globales
              const totalSuppliers = sortedSuppliers.length;
              const avgPerSupplier = totalSpent / totalSuppliers;
              analysisText += `\n📈 Statistiques:\n`;
              analysisText += `   • Nombre de fournisseurs: ${totalSuppliers}\n`;
              analysisText += `   • Dépense moyenne par fournisseur: ${avgPerSupplier.toFixed(2)}€\n`;
              analysisText += `   • Total dépensé: ${totalSpent.toFixed(2)}€\n`;
            }
          }

          // Formatter la liste des dépenses
          const expenseList = supplierExpenses.map((tx, index) => {
            const num = String(index + 1).padStart(2, ' ');
            const date = new Date(tx.date).toLocaleDateString('fr-BE');
            const amount = Math.abs(tx.amount).toFixed(2);
            const desc = tx.description || 'Sans description';

            // Identifier le fournisseur
            let supplierName = 'Inconnu';
            for (const supplier of suppliers) {
              if (matchesSupplier(desc, supplier)) {
                supplierName = supplier;
                break;
              }
            }

            return `${num}. ${date} - ${amount}€ - ${supplierName}`;
          }).join('\n');

          // Générer le titre de période
          let periodTitle: string;
          if (args.month) {
            periodTitle = startDate.toLocaleDateString('fr-BE', { month: 'long', year: 'numeric' });
          } else if (args.start_month && args.end_month) {
            const startMonthName = startDate.toLocaleDateString('fr-BE', { month: 'long' });
            const endMonthName = endDate.toLocaleDateString('fr-BE', { month: 'long' });
            const year = startDate.getFullYear();
            periodTitle = `${startMonthName} à ${endMonthName} ${year}`;
          } else if (args.year) {
            periodTitle = `année ${args.year}`;
          } else {
            periodTitle = `année ${startDate.getFullYear()}`;
          }

          // Décider si on inclut la liste détaillée
          const userAsksForList = questionLower.includes('liste') || questionLower.includes('détail');
          const userWantsDetails = args.include_details === true || userAsksForList;
          const userAsksForTopOnly = /top\s*\d+/.test(questionLower) && !userAsksForList;
          const isSpecificSupplierSearch = args.supplier_name && supplierExpenses.length <= 10;
          const isSingleMonthManyExpenses = args.month && supplierExpenses.length > 10;
          const includeDetailedList = !userAsksForTopOnly && !isSingleMonthManyExpenses && (userWantsDetails || isSpecificSupplierSearch);

          // Adapter le titre selon le type (dépenses ou revenus)
          const titleIcon = isRevenuePartner ? '💰' : '💸';
          const titleType = isRevenuePartner ? 'Revenus' : 'Dépenses fournisseurs';
          const countLabel = isRevenuePartner ? 'versements' : 'paiements';

          let directResponse = `${titleIcon} ${titleType} de ${periodTitle}\n\n` +
            `Total: ${totalSpent.toFixed(2)}€ (${supplierExpenses.length} ${countLabel})` +
            analysisText;

          if (includeDetailedList) {
            directResponse += `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` + expenseList;
          }

          result = {
            supplier_name: args.supplier_name || 'Tous les fournisseurs',
            period: `${startDate.toLocaleDateString('fr-BE')} - ${endDate.toLocaleDateString('fr-BE')}`,
            total_spent: totalSpent,
            expense_count: supplierExpenses.length,
            expenses: supplierExpenses.map(tx => ({
              date: tx.date,
              amount: Math.abs(tx.amount),
              description: tx.description,
            })),
            currency: 'EUR',
            direct_response: directResponse,
          };
          break;
        }

        case 'compare_supplier_expenses': {
          // Validation: au moins 2 fournisseurs
          if (!args.supplier_names || args.supplier_names.length < 2) {
            result = {
              error: 'Au moins 2 fournisseurs sont requis pour une comparaison',
              direct_response: '❌ Veuillez spécifier au moins 2 fournisseurs à comparer.'
            };
            break;
          }

          // Déterminer la période
          let startDate: Date;
          let endDate: Date;

          if (args.month) {
            const monthMap: { [key: string]: number } = {
              'janvier': 0, 'fevrier': 1, 'février': 1, 'mars': 2, 'avril': 3,
              'mai': 4, 'juin': 5, 'juillet': 6, 'aout': 7, 'août': 7,
              'septembre': 8, 'octobre': 9, 'novembre': 10, 'decembre': 11, 'décembre': 11
            };

            let targetMonth = -1;
            const monthInput = args.month.toLowerCase();

            if (monthMap[monthInput] !== undefined) {
              targetMonth = monthMap[monthInput];
            } else if (!isNaN(parseInt(monthInput))) {
              targetMonth = parseInt(monthInput) - 1;
            }

            const targetYear = args.year ? parseInt(args.year) : new Date().getFullYear();
            startDate = new Date(targetYear, targetMonth, 1);
            endDate = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59);
          } else {
            const currentYear = args.year ? parseInt(args.year) : new Date().getFullYear();
            startDate = new Date(currentYear, 0, 1);
            endDate = new Date();
          }

          // Récupérer toutes les transactions
          const transactions = await this.bankClient.getTransactionsByPeriod(startDate, endDate);
          const { matchesSupplier } = await import('./supplier-aliases');

          // Fonction pour extraire les dépenses d'un fournisseur
          const getSupplierExpenses = (supplierName: string) => {
            const expenses = transactions.filter(tx =>
              tx.type === 'Debit' &&
              matchesSupplier(tx.description || '', supplierName)
            );

            const total = expenses.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
            const sortedExpenses = expenses.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            const max = sortedExpenses.length > 0 ? sortedExpenses.reduce((m, tx) => Math.max(m, Math.abs(tx.amount)), 0) : 0;
            const maxTx = sortedExpenses.find(tx => Math.abs(tx.amount) === max);

            return {
              name: supplierName,
              total,
              count: expenses.length,
              avg: expenses.length > 0 ? total / expenses.length : 0,
              max,
              maxDate: maxTx ? new Date(maxTx.date) : null,
              transactions: sortedExpenses,
              found: expenses.length > 0
            };
          };

          // Récupérer les données de tous les fournisseurs
          const suppliersData = args.supplier_names.map(getSupplierExpenses);

          // Vérifier si tous ont des dépenses
          const notFound = suppliersData.filter((s: any) => !s.found);
          if (notFound.length === args.supplier_names.length) {
            result = {
              error: 'Aucune dépense trouvée pour ces fournisseurs',
              direct_response: `❌ Aucune dépense trouvée pour: ${notFound.map((s: any) => s.name).join(', ')}`
            };
            break;
          }

          // Filtrer uniquement les fournisseurs trouvés
          const foundSuppliers = suppliersData.filter((s: any) => s.found);

          // Trier par total décroissant
          const sorted = foundSuppliers.sort((a: any, b: any) => b.total - a.total);

          // Générer le titre de période
          let periodTitle: string;
          if (args.month) {
            periodTitle = startDate.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
          } else {
            periodTitle = `année ${startDate.getFullYear()}`;
          }

          // Générer la réponse comparative
          let directResponse = `📊 COMPARAISON DE DÉPENSES FOURNISSEURS\n\n`;
          directResponse += `${sorted.map((s: any) => s.name).join(' vs ')} (${periodTitle})\n\n`;
          directResponse += `💸 Classement par total dépensé:\n`;
          sorted.forEach((sup: any, i: number) => {
            const icon = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
            directResponse += `   ${icon} ${sup.name}: ${sup.total.toFixed(2)}€ (${sup.count} paiements)\n`;
          });

          if (sorted.length === 2) {
            const diff = sorted[0].total - sorted[1].total;
            const percentage = ((diff / sorted[1].total) * 100).toFixed(1);
            directResponse += `\n📈 Différence: ${Math.abs(diff).toFixed(2)}€ (+${percentage}%) en faveur de ${sorted[0].name}\n`;
          }

          directResponse += `\n📊 Dépense moyenne par paiement:\n`;
          sorted.forEach((sup: any, i: number) => {
            const icon = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
            directResponse += `   ${icon} ${sup.name}: ${sup.avg.toFixed(2)}€\n`;
          });

          directResponse += `\n🏆 Plus hauts paiements individuels:\n`;
          sorted.forEach((sup: any) => {
            directResponse += `   • ${sup.name}: ${sup.max.toFixed(2)}€${sup.maxDate ? ` (${sup.maxDate.toLocaleDateString('fr-BE')})` : ''}\n`;
          });

          // Ajouter avertissement si certains fournisseurs n'ont pas de dépenses
          if (notFound.length > 0) {
            directResponse += `\n⚠️ Aucune dépense pour: ${notFound.map((s: any) => s.name).join(', ')}`;
          }

          result = {
            suppliers: sorted.map((s: any) => ({
              name: s.name,
              total: s.total,
              count: s.count,
              avg: s.avg,
              max: s.max
            })),
            winner: sorted[0].name,
            direct_response: directResponse
          };
          break;
        }

        case 'get_supplier_payments': {
          // Gérer month/year
          let startDate: Date;
          let endDate: Date;

          if (args.month) {
            // Convertir le mois en dates
            const monthMap: { [key: string]: number } = {
              'janvier': 0, 'fevrier': 1, 'février': 1, 'mars': 2, 'avril': 3,
              'mai': 4, 'juin': 5, 'juillet': 6, 'aout': 7, 'août': 7,
              'septembre': 8, 'octobre': 9, 'novembre': 10, 'decembre': 11, 'décembre': 11,
            };

            let targetMonth: number;
            const monthInput = args.month.toLowerCase();

            if (monthMap[monthInput] !== undefined) {
              targetMonth = monthMap[monthInput];
            } else if (!isNaN(parseInt(monthInput))) {
              targetMonth = parseInt(monthInput) - 1;
            } else {
              return JSON.stringify({ error: `Mois invalide: ${args.month}` });
            }

            const targetYear = args.year ? parseInt(args.year) : new Date().getFullYear();
            startDate = new Date(targetYear, targetMonth, 1);
            endDate = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59);
          } else {
            // Par défaut: année courante complète
            const currentYear = new Date().getFullYear();
            startDate = new Date(currentYear, 0, 1);
            endDate = new Date();
          }

          let transactions = await this.bankClient.getTransactionsByPeriod(startDate, endDate);

          // Filtrer par fournisseur SEULEMENT les débits (paiements VERS le fournisseur)
          const { matchesSupplier } = await import('./supplier-aliases');
          const supplierPayments = transactions.filter(tx =>
            tx.type === 'Debit' &&
            matchesSupplier(tx.description || '', args.supplier_name)
          );

          // Calculer le total (débits sont négatifs, on prend la valeur absolue)
          const totalPaid = supplierPayments.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

          result = {
            supplier_name: args.supplier_name,
            period: `${startDate.toLocaleDateString('fr-BE')} - ${endDate.toLocaleDateString('fr-BE')}`,
            total_paid: totalPaid,
            payment_count: supplierPayments.length,
            payments: supplierPayments.map(tx => ({
              date: tx.date,
              amount: Math.abs(tx.amount), // Afficher en positif (paiement)
              description: tx.description,
            })),
            currency: 'EUR',
          };
          break;
        }

        case 'get_supplier_received_payments': {
          // Gérer month/year
          let startDate: Date;
          let endDate: Date;

          if (args.month) {
            // Convertir le mois en dates
            const monthMap: { [key: string]: number } = {
              'janvier': 0, 'fevrier': 1, 'février': 1, 'mars': 2, 'avril': 3,
              'mai': 4, 'juin': 5, 'juillet': 6, 'aout': 7, 'août': 7,
              'septembre': 8, 'octobre': 9, 'novembre': 10, 'decembre': 11, 'décembre': 11,
            };

            let targetMonth: number;
            const monthInput = args.month.toLowerCase();

            if (monthMap[monthInput] !== undefined) {
              targetMonth = monthMap[monthInput];
            } else if (!isNaN(parseInt(monthInput))) {
              targetMonth = parseInt(monthInput) - 1;
            } else {
              return JSON.stringify({ error: `Mois invalide: ${args.month}` });
            }

            const targetYear = args.year ? parseInt(args.year) : new Date().getFullYear();
            startDate = new Date(targetYear, targetMonth, 1);
            endDate = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59);
          } else {
            // Par défaut: année courante complète
            const currentYear = new Date().getFullYear();
            startDate = new Date(currentYear, 0, 1);
            endDate = new Date();
          }

          let transactions = await this.bankClient.getTransactionsByPeriod(startDate, endDate);

          // Filtrer par fournisseur SEULEMENT les crédits (versements DU fournisseur)
          const { matchesSupplier } = await import('./supplier-aliases');
          const supplierReceived = transactions.filter(tx =>
            tx.type === 'Credit' &&
            matchesSupplier(tx.description || '', args.supplier_name)
          );

          // Calculer le total (crédits sont positifs)
          const totalReceived = supplierReceived.reduce((sum, tx) => sum + tx.amount, 0);

          result = {
            supplier_name: args.supplier_name,
            period: `${startDate.toLocaleDateString('fr-BE')} - ${endDate.toLocaleDateString('fr-BE')}`,
            total_received: totalReceived,
            payment_count: supplierReceived.length,
            payments: supplierReceived.map(tx => ({
              date: tx.date,
              amount: tx.amount,
              description: tx.description,
            })),
            currency: 'EUR',
          };
          break;
        }

        case 'search_invoices': {
          const invoices = await this.billitClient.searchInvoices(args.search_term);
          result = {
            search_term: args.search_term,
            count: invoices.length,
            invoices: invoices.slice(0, 10).map(inv => ({
              supplier: inv.supplier_name,
              invoice_number: inv.invoice_number,
              amount: inv.total_amount,
              status: inv.status,
              date: inv.invoice_date,
            })),
          };
          break;
        }

        case 'get_invoice_by_supplier_and_amount': {
          const { matchesSupplier } = await import('./supplier-aliases');

          // Récupérer toutes les factures
          const allInvoices = await this.billitClient.getInvoices({ limit: 120 });

          // Filtrer par fournisseur
          const supplierInvoices = allInvoices.filter(inv =>
            matchesSupplier(inv.supplier_name || '', args.supplier_name)
          );

          // Si un montant est spécifié, trouver la facture la plus proche
          let matchedInvoices = supplierInvoices;
          if (args.amount) {
            const tolerance = 50; // Tolérance de 50€
            matchedInvoices = supplierInvoices.filter(inv =>
              Math.abs(inv.total_amount - args.amount) <= tolerance
            ).sort((a, b) =>
              Math.abs(a.total_amount - args.amount) - Math.abs(b.total_amount - args.amount)
            );
          }

          // Filtrer par mois/année si spécifié
          if (args.month || args.year) {
            const monthMap: { [key: string]: number } = {
              'janvier': 0, 'fevrier': 1, 'février': 1, 'mars': 2, 'avril': 3,
              'mai': 4, 'juin': 5, 'juillet': 6, 'aout': 7, 'août': 7,
              'septembre': 8, 'octobre': 9, 'novembre': 10, 'decembre': 11, 'décembre': 11,
            };

            const targetMonth = args.month ? monthMap[args.month.toLowerCase()] : undefined;
            const targetYear = args.year ? parseInt(args.year) : undefined;

            matchedInvoices = matchedInvoices.filter(inv => {
              const invDate = new Date(inv.invoice_date);
              if (targetMonth !== undefined && invDate.getMonth() !== targetMonth) return false;
              if (targetYear && invDate.getFullYear() !== targetYear) return false;
              return true;
            });
          }

          if (matchedInvoices.length === 0) {
            result = {
              supplier_name: args.supplier_name,
              found: false,
              message: `Aucune facture trouvée pour ${args.supplier_name}` +
                      (args.amount ? ` d'environ ${args.amount} €` : '') +
                      (args.month ? ` en ${args.month}` : ''),
            };
          } else {
            const bestMatch = matchedInvoices[0];
            result = {
              supplier_name: args.supplier_name,
              found: true,
              invoice: {
                invoice_number: bestMatch.invoice_number,
                supplier: bestMatch.supplier_name,
                amount: bestMatch.total_amount,
                date: bestMatch.invoice_date,
                due_date: bestMatch.due_date,
                status: bestMatch.status,
              },
              other_matches: matchedInvoices.length > 1 ? matchedInvoices.slice(1, 4).map(inv => ({
                invoice_number: inv.invoice_number,
                amount: inv.total_amount,
                date: inv.invoice_date,
              })) : [],
            };
          }
          break;
        }

        case 'list_suppliers': {
          // Lister tous les fournisseurs depuis la base de données SQLite
          try {
            const suppliers = getAllSuppliers();

            if (suppliers.length === 0) {
              result = {
                success: false,
                error: 'empty_list',
                message: '❌ Aucun fournisseur n\'est configuré.',
              };
              break;
            }

            // Formatage simple et cohérent pour Telegram (même format que les employés)
            const suppliersList = suppliers.map((sup, index) => {
              const num = String(index + 1).padStart(2, ' ');
              const name = sup.name;
              const type = sup.type || 'fournisseur';

              // Format simple: "1. Nom - Type"
              return `${num}. ${name} - ${type}`;
            }).join('\n');

            const formattedMessage = `📦 Liste des fournisseurs (${suppliers.length})\n\n${suppliersList}`;

            result = {
              success: true,
              direct_response: formattedMessage,
              message: formattedMessage,
            };
          } catch (error: any) {
            result = {
              success: false,
              error: 'database_error',
              message: `❌ Erreur lors de la récupération des fournisseurs: ${error.message}`,
            };
          }
          break;
        }

        case 'get_monthly_invoices': {
          const allInvoices = await this.billitClient.getInvoices({ limit: 120 });
          const now = new Date();
          const monthInvoices = allInvoices.filter(inv => {
            const invDate = new Date(inv.invoice_date);
            return invDate.getMonth() === now.getMonth() && invDate.getFullYear() === now.getFullYear();
          });

          const paid = monthInvoices.filter(inv =>
            inv.status.toLowerCase().includes('paid') || inv.status.toLowerCase().includes('payé')
          );
          const unpaid = monthInvoices.filter(inv =>
            !inv.status.toLowerCase().includes('paid') && !inv.status.toLowerCase().includes('payé')
          );

          result = {
            month: now.toLocaleDateString('fr-BE', { month: 'long', year: 'numeric' }),
            total_invoices: monthInvoices.length,
            paid_count: paid.length,
            paid_amount: paid.reduce((sum, inv) => sum + inv.total_amount, 0),
            unpaid_count: unpaid.length,
            unpaid_amount: unpaid.reduce((sum, inv) => sum + inv.total_amount, 0),
            total_amount: monthInvoices.reduce((sum, inv) => sum + inv.total_amount, 0),
            paid_invoices: paid.slice(0, 10).map(inv => ({
              supplier: inv.supplier_name,
              amount: inv.total_amount,
              invoice_number: inv.invoice_number,
              date: inv.invoice_date,
            })),
            unpaid_invoices: unpaid.slice(0, 10).map(inv => ({
              supplier: inv.supplier_name,
              amount: inv.total_amount,
              invoice_number: inv.invoice_number,
              date: inv.invoice_date,
            })),
            currency: 'EUR',
          };
          break;
        }

        case 'get_invoices_by_month': {
          const monthMap: { [key: string]: number } = {
            'janvier': 0, 'fevrier': 1, 'février': 1, 'mars': 2, 'avril': 3,
            'mai': 4, 'juin': 5, 'juillet': 6, 'aout': 7, 'août': 7,
            'septembre': 8, 'octobre': 9, 'novembre': 10, 'decembre': 11, 'décembre': 11,
          };

          let targetMonth: number;
          const monthInput = args.month.toLowerCase();

          if (monthMap[monthInput] !== undefined) {
            targetMonth = monthMap[monthInput];
          } else if (!isNaN(parseInt(monthInput))) {
            targetMonth = parseInt(monthInput) - 1; // 01 → 0, 12 → 11
          } else {
            return JSON.stringify({ error: `Mois invalide: ${args.month}` });
          }

          const targetYear = args.year ? parseInt(args.year) : new Date().getFullYear();

          const allInvoices = await this.billitClient.getInvoices({ limit: 120 }); // Max 100 pour Billit API
          const monthInvoices = allInvoices.filter(inv => {
            const invDate = new Date(inv.invoice_date);
            return invDate.getMonth() === targetMonth && invDate.getFullYear() === targetYear;
          });

          const paid = monthInvoices.filter(inv =>
            inv.status.toLowerCase().includes('paid') || inv.status.toLowerCase().includes('payé')
          );
          const unpaid = monthInvoices.filter(inv =>
            !inv.status.toLowerCase().includes('paid') && !inv.status.toLowerCase().includes('payé')
          );

          const monthName = new Date(targetYear, targetMonth).toLocaleDateString('fr-BE', { month: 'long', year: 'numeric' });

          result = {
            month: monthName,
            total_invoices: monthInvoices.length,
            paid_count: paid.length,
            paid_amount: paid.reduce((sum, inv) => sum + inv.total_amount, 0),
            unpaid_count: unpaid.length,
            unpaid_amount: unpaid.reduce((sum, inv) => sum + inv.total_amount, 0),
            total_amount: monthInvoices.reduce((sum, inv) => sum + inv.total_amount, 0),
            all_invoices: monthInvoices.slice(0, 20).map(inv => ({
              supplier: inv.supplier_name,
              amount: inv.total_amount,
              invoice_number: inv.invoice_number,
              date: inv.invoice_date,
              status: inv.status,
            })),
            currency: 'EUR',
          };
          break;
        }

        case 'send_invoice_pdf': {
          // Envoyer le PDF d'une facture via Telegram
          if (!this.telegramBot || !this.chatId) {
            result = {
              success: false,
              error: 'Service Telegram non disponible',
            };
            break;
          }

          let invoiceId = args.invoice_id;

          // Si on a seulement le numéro de facture, chercher l'ID
          if (!invoiceId && args.invoice_number) {
            const allInvoices = await this.billitClient.getInvoices({ limit: 120 });
            const invoice = allInvoices.find(inv =>
              inv.invoice_number === args.invoice_number
            );
            if (invoice) {
              invoiceId = invoice.id;
            }
          }

          if (!invoiceId) {
            result = {
              success: false,
              error: 'Facture non trouvée',
            };
            break;
          }

          // Télécharger le PDF
          const pdfBuffer = await this.billitClient.downloadInvoicePdf(invoiceId);

          if (!pdfBuffer) {
            result = {
              success: false,
              error: 'PDF non disponible',
            };
            break;
          }

          // Récupérer les détails pour le nom de fichier
          const invoiceDetails = await this.billitClient.getInvoiceDetails(invoiceId);
          const supplierName = invoiceDetails.Supplier?.Name || 'Facture';
          const invoiceNumber = invoiceDetails.OrderNumber || invoiceId;
          const filename = `Facture_${invoiceNumber}_${supplierName.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;

          // Préparer le message de légende
          const caption = `📄 Facture ${invoiceNumber} - ${supplierName}`;

          // Envoyer via Telegram
          await this.telegramBot.sendDocument(this.chatId, pdfBuffer, {
            caption: caption,
            parse_mode: 'HTML',
          }, {
            filename: filename,
            contentType: 'application/pdf',
          });

          result = {
            success: true,
            message: `Fichier PDF envoyé: ${filename}`,
            invoice_number: invoiceNumber,
            supplier: supplierName,
          };
          break;
        }

        case 'search_by_communication': {
          // Rechercher une facture par numéro de communication
          const invoices = await this.billitClient.searchByCommunication(
            args.communication_number,
            10
          );

          if (invoices.length === 0) {
            result = {
              found: false,
              message: `Aucune facture trouvée avec la communication "${args.communication_number}"`,
              search_term: args.communication_number,
            };
            break;
          }

          // Formatter les résultats
          result = {
            found: true,
            count: invoices.length,
            invoices: invoices.map(inv => ({
              supplier: inv.supplier_name,
              invoice_number: inv.invoice_number,
              amount: inv.total_amount,
              currency: inv.currency,
              date: inv.invoice_date,
              communication: inv.communication,
              status: inv.status,
            })),
          };
          break;
        }

        case 'add_supplier': {
          // Ajouter manuellement un fournisseur
          const { SupplierLearningService } = await import('./supplier-learning-service');
          const learningService = new SupplierLearningService();

          const added = learningService.addSupplier(
            args.supplier_name,
            args.aliases
          );

          result = {
            success: added,
            supplier_name: args.supplier_name,
            aliases: args.aliases || [],
            message: added
              ? `✅ Fournisseur "${args.supplier_name}" ajouté avec succès à la base de données !`
              : `ℹ️  Le fournisseur "${args.supplier_name}" existe déjà dans la base de données.`,
          };
          break;
        }

        case 'delete_supplier': {
          // Supprimer un fournisseur
          const { SupplierLearningService } = await import('./supplier-learning-service');
          const learningService = new SupplierLearningService();

          const deleted = learningService.removeSupplier(args.supplier_key);

          result = {
            success: deleted,
            supplier_key: args.supplier_key,
            message: deleted
              ? `🗑️ Fournisseur "${args.supplier_key}" supprimé avec succès de la base de données !`
              : `❌ Le fournisseur "${args.supplier_key}" n'existe pas dans la base de données.`,
          };
          break;
        }

        case 'add_user': {
          // Ajouter un utilisateur autorisé à la base de données SQLite
          const chatIdToAdd = args.chat_id?.trim();
          const usernameToAdd = args.username?.trim() || null;

          // Validation
          if (!chatIdToAdd) {
            result = {
              success: false,
              error: 'missing_chat_id',
              message: '❌ Veuillez spécifier un Chat ID.\n\nExemple: "Ajoute l\'utilisateur 123456789"\n\n💡 Pour trouver votre Chat ID, parlez au bot @userinfobot sur Telegram.',
            };
            break;
          }

          if (!/^\d+$/.test(chatIdToAdd)) {
            result = {
              success: false,
              error: 'invalid_chat_id',
              message: `❌ Chat ID invalide: "${chatIdToAdd}"\n\nUn Chat ID doit contenir uniquement des chiffres.`,
            };
            break;
          }

          try {
            // Vérifier si l'utilisateur existe déjà
            const existingUser = getUserByChatId(chatIdToAdd);
            if (existingUser) {
              result = {
                success: false,
                error: 'already_exists',
                message: `⚠️ L'utilisateur avec le Chat ID "${chatIdToAdd}" est déjà autorisé.`,
              };
              break;
            }

            // Ajouter le nouvel utilisateur
            const success = addAuthorizedUser(chatIdToAdd, usernameToAdd, 'user', 'ai_assistant');

            if (!success) {
              result = {
                success: false,
                error: 'database_error',
                message: `❌ Erreur lors de l'ajout de l'utilisateur.`,
              };
              break;
            }

            // Récupérer le total d'utilisateurs
            const allUsers = getAllAuthorizedUsers();
            const username = usernameToAdd || 'Inconnu';

            result = {
              success: true,
              chat_id: chatIdToAdd,
              username: username,
              total_users: allUsers.length,
              message: `✅ Utilisateur ajouté avec succès !\n\n📱 Chat ID: <b>${chatIdToAdd}</b>${username !== 'Inconnu' ? ` (${username})` : ''}\n👥 Total utilisateurs: ${allUsers.length}\n\n✅ Changements appliqués immédiatement (pas besoin de redémarrage).`,
            };
          } catch (error: any) {
            result = {
              success: false,
              error: 'database_error',
              message: `❌ Erreur lors de l'ajout de l'utilisateur: ${error.message}`,
            };
          }
          break;
        }

        case 'remove_user': {
          // Supprimer un utilisateur autorisé depuis la base de données SQLite
          const chatIdToRemove = args.chat_id?.trim();

          // Validation
          if (!chatIdToRemove) {
            result = {
              success: false,
              error: 'missing_chat_id',
              message: '❌ Veuillez spécifier un Chat ID.\n\nExemple: "Supprime l\'utilisateur 123456789"',
            };
            break;
          }

          if (!/^\d+$/.test(chatIdToRemove)) {
            result = {
              success: false,
              error: 'invalid_chat_id',
              message: `❌ Chat ID invalide: "${chatIdToRemove}"\n\nUn Chat ID doit contenir uniquement des chiffres.`,
            };
            break;
          }

          try {
            // Vérifier si l'utilisateur existe
            const existingUser = getUserByChatId(chatIdToRemove);
            if (!existingUser) {
              result = {
                success: false,
                error: 'not_found',
                message: `⚠️ L'utilisateur avec le Chat ID "${chatIdToRemove}" n'existe pas dans la liste.`,
              };
              break;
            }

            // Vérifier qu'il restera au moins un utilisateur
            const allUsers = getAllAuthorizedUsers();
            if (allUsers.length <= 1) {
              result = {
                success: false,
                error: 'cannot_remove_last',
                message: '❌ Impossible de supprimer le dernier utilisateur autorisé. Il doit toujours y avoir au moins un utilisateur.',
              };
              break;
            }

            // Supprimer l'utilisateur (désactive dans la BD)
            const success = removeAuthorizedUser(chatIdToRemove);

            if (!success) {
              result = {
                success: false,
                error: 'database_error',
                message: `❌ Erreur lors de la suppression de l'utilisateur.`,
              };
              break;
            }

            const username = existingUser.username || 'Inconnu';
            const remainingUsers = getAllAuthorizedUsers();

            result = {
              success: true,
              chat_id: chatIdToRemove,
              username: username,
              total_users: remainingUsers.length,
              message: `✅ Utilisateur supprimé avec succès !\n\n📱 Chat ID: <b>${chatIdToRemove}</b>${username !== 'Inconnu' ? ` (${username})` : ''}\n👥 Total utilisateurs: ${remainingUsers.length}`,
            };
          } catch (error: any) {
            result = {
              success: false,
              error: 'database_error',
              message: `❌ Erreur lors de la suppression de l'utilisateur: ${error.message}`,
            };
          }
          break;
        }

        case 'list_users': {
          // Lister tous les utilisateurs autorisés depuis la base de données SQLite
          try {
            const users = getAllAuthorizedUsers();

            if (users.length === 0) {
              result = {
                success: false,
                error: 'empty_list',
                message: '❌ Aucun utilisateur autorisé n\'est configuré.',
              };
              break;
            }

            const usersList = users.map((user, index) => {
              const username = user.username || 'Inconnu';
              const roleLabel = user.role === 'owner' ? '👑' : user.role === 'admin' ? '⭐' : '';
              return `${index + 1}. Chat ID: <b>${user.chat_id}</b>${username !== 'Inconnu' ? ` (${username})` : ''} ${roleLabel}`;
            }).join('\n');

            const formattedMessage = `👥 Utilisateurs autorisés (${users.length})\n\n${usersList}`;

            result = {
              success: true,
              direct_response: formattedMessage,
              message: formattedMessage,
            };
          } catch (error: any) {
            result = {
              success: false,
              error: 'database_error',
              message: `❌ Erreur lors de la récupération des utilisateurs: ${error.message}`,
            };
          }
          break;
        }

        case 'list_employees': {
          // Lister tous les employés depuis la base de données SQLite
          try {
            const employees = getAllEmployees();

            if (employees.length === 0) {
              result = {
                success: false,
                error: 'empty_list',
                message: '❌ Aucun employé n\'est configuré.',
              };
              break;
            }

            // Formatage simple et cohérent pour Telegram (sans backticks, sans astérisques)
            const employeesList = employees.map((emp, index) => {
              const num = String(index + 1).padStart(2, ' ');
              const name = emp.name;
              const position = emp.position || 'Employé';
              const chatId = emp.chat_id;

              // Format simple: "1. Nom - Poste (ID: xxx)" ou "1. Nom - Poste"
              if (chatId) {
                return `${num}. ${name} - ${position} (ID: ${chatId})`;
              } else {
                return `${num}. ${name} - ${position}`;
              }
            }).join('\n');

            const formattedMessage = `💼 Liste des employés (${employees.length})\n\n${employeesList}`;

            result = {
              success: true,
              direct_response: formattedMessage,
              message: formattedMessage,
            };
          } catch (error: any) {
            result = {
              success: false,
              error: 'database_error',
              message: `❌ Erreur lors de la récupération des employés: ${error.message}`,
            };
          }
          break;
        }

        case 'add_employee': {
          // Ajouter un nouvel employé
          const employeeName = args.name?.trim();
          const employeeChatId = args.chat_id?.trim() || null;
          const employeePosition = args.position?.trim() || 'Employé';

          // Validation
          if (!employeeName) {
            result = {
              success: false,
              error: 'missing_name',
              message: '❌ Veuillez spécifier un nom pour l\'employé.\n\nExemple: "Ajoute l\'employé Mohamed Ali"',
            };
            break;
          }

          if (employeeName.length < 3) {
            result = {
              success: false,
              error: 'invalid_name',
              message: '❌ Le nom de l\'employé doit contenir au moins 3 caractères.',
            };
            break;
          }

          try {
            // Vérifier si l'employé existe déjà (actif ou inactif)
            const existing = employeeExistsByName(employeeName);
            if (existing) {
              if (existing.is_active) {
                result = {
                  success: false,
                  error: 'already_exists',
                  message: `⚠️ Un employé nommé "${employeeName}" existe déjà dans la base de données (actif).`,
                };
              } else {
                result = {
                  success: false,
                  error: 'already_exists_inactive',
                  message: `⚠️ Un employé nommé "${employeeName}" existe déjà mais est désactivé. Veuillez d'abord le supprimer complètement ou utiliser un autre nom.`,
                };
              }
              break;
            }

            // Ajouter l'employé
            const employeeId = addEmployee(employeeName, employeeChatId, employeePosition);

            if (!employeeId) {
              result = {
                success: false,
                error: 'database_error',
                message: '❌ Erreur lors de l\'ajout de l\'employé dans la base de données.',
              };
              break;
            }

            // Récupérer tous les employés pour afficher la liste mise à jour
            const allEmployees = getAllEmployees();
            const employeesList = allEmployees.map((emp, index) => {
              const num = String(index + 1).padStart(2, ' ');
              const name = emp.name;
              const position = emp.position || 'Employé';
              const chatId = emp.chat_id;

              // Format simple: "1. Nom - Poste (ID: xxx)" ou "1. Nom - Poste"
              if (chatId) {
                return `${num}. ${name} - ${position} (ID: ${chatId})`;
              } else {
                return `${num}. ${name} - ${position}`;
              }
            }).join('\n');

            const chatInfo = employeeChatId ? `\n📱 Chat ID: ${employeeChatId}` : '';
            const formattedMessage = `✅ Employé ajouté avec succès !\n\n👤 Nom: ${employeeName}\n💼 Poste: ${employeePosition}${chatInfo}\n🆔 ID: ${employeeId}\n\n💼 Liste mise à jour des employés (${allEmployees.length})\n\n${employeesList}`;

            result = {
              success: true,
              employee_id: employeeId,
              name: employeeName,
              position: employeePosition,
              chat_id: employeeChatId,
              direct_response: formattedMessage,
              message: formattedMessage,
            };
          } catch (error: any) {
            result = {
              success: false,
              error: 'database_error',
              message: `❌ Erreur lors de l'ajout de l'employé: ${error.message}`,
            };
          }
          break;
        }

        case 'remove_employee': {
          // Supprimer un employé
          const employeeName = args.name?.trim();

          // Validation
          if (!employeeName) {
            result = {
              success: false,
              error: 'missing_name',
              message: '❌ Veuillez spécifier le nom de l\'employé à supprimer.\n\nExemple: "Supprime l\'employé Hassan Madidi"',
            };
            break;
          }

          try {
            // Chercher l'employé
            const employee = getEmployeeByName(employeeName);

            if (!employee) {
              result = {
                success: false,
                error: 'not_found',
                message: `⚠️ Aucun employé nommé "${employeeName}" n'a été trouvé.\n\nVeuillez vérifier l'orthographe exacte avec la commande "liste des employés".`,
              };
              break;
            }

            // Vérifier qu'il restera au moins un employé
            const allEmployees = getAllEmployees();
            if (allEmployees.length <= 1) {
              result = {
                success: false,
                error: 'cannot_remove_last',
                message: '❌ Impossible de supprimer le dernier employé. Il doit toujours y avoir au moins un employé.',
              };
              break;
            }

            // Supprimer l'employé (désactiver)
            const success = removeEmployee(employee.id);

            if (!success) {
              result = {
                success: false,
                error: 'database_error',
                message: '❌ Erreur lors de la suppression de l\'employé.',
              };
              break;
            }

            const remainingEmployees = getAllEmployees();

            // Formatage de la liste mise à jour
            const employeesList = remainingEmployees.map((emp, index) => {
              const num = String(index + 1).padStart(2);
              const name = emp.name;
              const position = emp.position || 'Employé';
              const chatId = emp.chat_id || 'N/A';

              return `\`${num}. ${name}\`\n   └─ ${position} ${chatId !== 'N/A' ? `│ ID: ${chatId}` : ''}`;
            }).join('\n\n');

            const formattedMessage = `✅ Employé supprimé avec succès !\n\n👤 Nom: ${employee.name}\n💼 Poste: ${employee.position || 'N/A'}\n\n💼 Liste mise à jour des employés (${remainingEmployees.length})\n\n${employeesList}`;

            result = {
              success: true,
              employee_id: employee.id,
              name: employee.name,
              direct_response: formattedMessage,
              message: formattedMessage,
            };
          } catch (error: any) {
            result = {
              success: false,
              error: 'database_error',
              message: `❌ Erreur lors de la suppression de l'employé: ${error.message}`,
            };
          }
          break;
        }

        case 'detect_new_suppliers': {
          try {
            // Importer les fonctions nécessaires
            const { matchesSupplier } = await import('./supplier-aliases');
            const { normalizeSearchTerm } = await import('./utils/string-utils');
            const { extractPotentialSupplierNames } = await import('./supplier-aliases');

            // Récupérer toutes les transactions bancaires
            const transactions = await this.bankClient.getAllTransactions();

            // Mots-clés à exclure (salaires, taxes, paiements récurrents)
            const EXCLUDED_KEYWORDS = [
              'salaire', 'salary', 'avance', 'solde salaire',
              'onss', 'tva', 'precompte', 'fiscal', 'impot',
              'loyer', 'rent', 'ordre permanent', 'standing order',
              'tonton chami', 'bureau', 'compte',
              'indexation', 'sogle', 'team precompte'
            ];

            // Récupérer tous les fournisseurs connus
            const suppliers = getAllSuppliers();
            const supplierNames = suppliers.map(s => s.name);

            // Filtrer les transactions Debit qui ne matchent aucun fournisseur connu
            const unmatchedTransactions = transactions.filter((tx: any) => {
              if (tx.type !== 'Debit') return false;

              const description = tx.description || '';
              const descLower = description.toLowerCase();

              // Ignorer les transactions vides ou trop courtes
              if (description.length < 10) return false;

              // Ignorer les mots-clés exclus
              if (EXCLUDED_KEYWORDS.some(keyword => descLower.includes(keyword))) {
                return false;
              }

              // Vérifier si matche un fournisseur connu
              const matchesKnownSupplier = supplierNames.some(supplier =>
                matchesSupplier(description, supplier)
              );

              return !matchesKnownSupplier;
            });

            if (unmatchedTransactions.length === 0) {
              result = {
                success: true,
                count: 0,
                message: '✅ Toutes les transactions correspondent à des fournisseurs connus !\n\n🎯 Couverture: 100%\n📊 Fournisseurs en base: ' + suppliers.length,
              };
            } else {
              // Regrouper les transactions par description similaire
              const grouped = new Map<string, any>();

              unmatchedTransactions.forEach((tx: any) => {
                const description = tx.description || '';
                const normalized = normalizeSearchTerm(description);
                const potentialNames = extractPotentialSupplierNames(description);

                const key = normalized.substring(0, 30);

                if (grouped.has(key)) {
                  const existing = grouped.get(key);
                  existing.count++;
                  existing.totalAmount += Math.abs(tx.amount);
                  existing.transactions.push({
                    date: tx.date,
                    amount: Math.abs(tx.amount),
                    description: description
                  });
                } else {
                  grouped.set(key, {
                    description: description,
                    normalizedDescription: normalized,
                    potentialNames: potentialNames,
                    count: 1,
                    totalAmount: Math.abs(tx.amount),
                    transactions: [{
                      date: tx.date,
                      amount: Math.abs(tx.amount),
                      description: description
                    }]
                  });
                }
              });

              // Convertir en tableau et trier par montant total décroissant
              const unknownSuppliers = Array.from(grouped.values())
                .sort((a, b) => b.totalAmount - a.totalAmount);

              // Formater le message
              let message = `🔍 DÉTECTION DE NOUVEAUX FOURNISSEURS\n\n`;
              message += `📊 ${unmatchedTransactions.length} transaction(s) non matchée(s)\n`;
              message += `📋 ${unknownSuppliers.length} fournisseur(s) potentiel(s) détecté(s)\n\n`;
              message += `${'='.repeat(40)}\n\n`;

              unknownSuppliers.slice(0, 10).forEach((supplier, index) => {
                message += `${index + 1}. 💰 ${supplier.totalAmount.toFixed(2)}€ (${supplier.count} transaction${supplier.count > 1 ? 's' : ''})\n`;
                message += `   📝 ${supplier.description.substring(0, 60)}${supplier.description.length > 60 ? '...' : ''}\n`;

                if (supplier.potentialNames.length > 0) {
                  message += `   🏷️  ${supplier.potentialNames.slice(0, 3).join(', ')}\n`;
                }

                message += `   📅 ${supplier.transactions[0].date}: ${supplier.transactions[0].amount.toFixed(2)}€\n`;

                if (supplier.transactions.length > 1) {
                  message += `   ... et ${supplier.transactions.length - 1} autre(s)\n`;
                }

                message += `\n`;
              });

              if (unknownSuppliers.length > 10) {
                message += `... et ${unknownSuppliers.length - 10} autre(s)\n\n`;
              }

              message += `💡 Pour ajouter ces fournisseurs:\n`;
              message += `1. Modifier src/reload-suppliers.ts\n`;
              message += `2. Ajouter à ADDITIONAL_KNOWN_SUPPLIERS\n`;
              message += `3. Exécuter: npm run build && node dist/reload-suppliers.js`;

              result = {
                success: true,
                count: unknownSuppliers.length,
                unmatched_transactions: unmatchedTransactions.length,
                suppliers: unknownSuppliers,
                message: message,
              };
            }
          } catch (error: any) {
            result = {
              success: false,
              error: 'detection_error',
              message: `❌ Erreur lors de la détection: ${error.message}`,
            };
          }
          break;
        }

        case 'restart_bot': {
          // Redémarrer le bot
          result = {
            success: true,
            message: '🔄 Redémarrage du bot en cours...\n\n⏳ Le bot sera de retour dans quelques secondes.',
          };

          // Envoyer la réponse immédiatement, puis redémarrer après un court délai
          setTimeout(() => {
            console.log('🔄 Redémarrage du bot initié via restart_bot...');
            console.log('💾 Sauvegarde de l\'état de conversation...');

            // Sauvegarder la conversation actuelle
            this.saveConversationState();

            console.log('✅ Arrêt du bot...');
            process.exit(0); // Code de sortie 0 pour redémarrage propre
          }, 1000);

          break;
        }

        default:
          return JSON.stringify({ error: `Fonction inconnue: ${functionName}` });
      }

      return JSON.stringify(result, null, 2);

    } catch (error: any) {
      console.error(`❌ Erreur ${functionName}:`, error);
      return JSON.stringify({ error: error.message });
    }
  }

  /**
   * Analyse les sources principales de recettes
   */
  private getTopSources(transactions: any[]): string[] {
    // Grouper par type de paiement (VISA, MC, etc.)
    const sources: { [key: string]: number } = {};

    transactions.forEach(tx => {
      const desc = tx.description || '';
      let source = 'Autres';

      if (desc.includes('VISA')) source = 'VISA';
      else if (desc.includes('MC-') || desc.includes('MASTERCARD')) source = 'Mastercard';
      else if (desc.includes('MAESTRO') || desc.includes('VPAY')) source = 'Maestro/VPay';
      else if (desc.includes('VIREMENT')) source = 'Virements';

      sources[source] = (sources[source] || 0) + tx.amount;
    });

    return Object.entries(sources)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, amount]) => `${name} (${this.formatAmount(amount)} €)`);
  }

  /**
   * Analyse les principales dépenses
   */
  private getTopExpenses(transactions: any[]): Array<{ name: string; amount: number }> {
    const expenses: { [key: string]: number } = {};

    transactions.forEach(tx => {
      const desc = (tx.description || '').toLowerCase();
      let name = 'Autres';

      if (desc.includes('foster')) name = 'Foster';
      else if (desc.includes('onss')) name = 'ONSS';
      else if (desc.includes('precompte')) name = 'Précompte';
      else if (desc.includes('salaire') || desc.includes('jamhoun') || desc.includes('mokhlis')) name = 'Salaires';

      expenses[name] = (expenses[name] || 0) + Math.abs(tx.amount);
    });

    return Object.entries(expenses)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, amount]) => ({ name, amount }));
  }

  /**
   * Formate un montant
   */
  private formatAmount(amount: number): string {
    return new Intl.NumberFormat('fr-BE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  }

  /**
   * Calcule la distance de Levenshtein entre deux chaînes
   * (nombre minimum d'opérations pour transformer s1 en s2)
   */
  private levenshteinDistance(s1: string, s2: string): number {
    const len1 = s1.length;
    const len2 = s2.length;
    const matrix: number[][] = [];

    // Initialiser la matrice
    for (let i = 0; i <= len1; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= len2; j++) {
      matrix[0][j] = j;
    }

    // Remplir la matrice
    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,      // suppression
          matrix[i][j - 1] + 1,      // insertion
          matrix[i - 1][j - 1] + cost // substitution
        );
      }
    }

    return matrix[len1][len2];
  }

  /**
   * Trouve l'employé le plus proche d'un nom donné (fuzzy matching)
   * Retourne null si aucune correspondance acceptable
   */
  private async findClosestEmployee(searchName: string): Promise<{ employee: any; distance: number } | null> {
    const { getAllEmployees } = await import('./database');
    const employees = getAllEmployees();

    if (employees.length === 0) {
      return null;
    }

    const searchLower = searchName.toLowerCase();
    const searchParts = searchLower.split(' ');
    let bestMatch: { employee: any; distance: number } | null = null;

    for (const emp of employees) {
      const empNameLower = emp.name.toLowerCase();
      const nameParts = empNameLower.split(' ');

      // Calculer la distance pour le nom complet
      let distance = this.levenshteinDistance(searchLower, empNameLower);

      // 🔄 NOUVEAU: Tester aussi l'ordre inversé (ex: "Mokhlis Jamhoun" → "Jamhoun Mokhlis")
      if (searchParts.length === 2 && nameParts.length === 2) {
        const reversedSearch = `${searchParts[1]} ${searchParts[0]}`;
        const reversedDistance = this.levenshteinDistance(reversedSearch, empNameLower);
        distance = Math.min(distance, reversedDistance);
      }

      // Accepter seulement si la distance est raisonnable (max 3 caractères de différence)
      const maxDistance = Math.max(3, Math.floor(searchLower.length * 0.3));

      if (distance <= maxDistance) {
        if (!bestMatch || distance < bestMatch.distance) {
          bestMatch = { employee: emp, distance };
        }
      }
    }

    return bestMatch;
  }

  /**
   * Trouve plusieurs employés similaires à un nom donné (fuzzy matching)
   * Retourne jusqu'à 5 suggestions triées par pertinence
   */
  private async findSimilarEmployees(searchName: string, maxResults: number = 5): Promise<Array<{ employee: any; distance: number }>> {
    const { getAllEmployees } = await import('./database');
    const employees = getAllEmployees();

    if (employees.length === 0) {
      return [];
    }

    const searchLower = searchName.toLowerCase();
    const matches: Array<{ employee: any; distance: number }> = [];

    for (const emp of employees) {
      const empNameLower = emp.name.toLowerCase();

      // Calculer la distance pour le nom complet
      let distance = this.levenshteinDistance(searchLower, empNameLower);

      // Vérifier aussi si le terme de recherche correspond à une partie du nom
      const nameParts = empNameLower.split(' ');
      for (const part of nameParts) {
        const partDistance = this.levenshteinDistance(searchLower, part);
        distance = Math.min(distance, partDistance);
      }

      // 🔄 NOUVEAU: Tester aussi l'ordre inversé (ex: "Mokhlis Jamhoun" → "Jamhoun Mokhlis")
      const searchParts = searchLower.split(' ');
      if (searchParts.length === 2 && nameParts.length === 2) {
        // Inverser l'ordre du nom recherché
        const reversedSearch = `${searchParts[1]} ${searchParts[0]}`;
        const reversedDistance = this.levenshteinDistance(reversedSearch, empNameLower);
        distance = Math.min(distance, reversedDistance);
      }

      // Accepter si la distance est raisonnable
      const maxDistance = Math.max(4, Math.floor(searchLower.length * 0.4));

      if (distance <= maxDistance) {
        matches.push({ employee: emp, distance });
      }
    }

    // Trier par distance (plus proche en premier) et limiter le nombre de résultats
    return matches
      .sort((a, b) => a.distance - b.distance)
      .slice(0, maxResults);
  }

  /**
   * Traite une question
   */
  async processQuestion(question: string, chatId?: string): Promise<string> {
    try {
      // Stocker le chatId pour envoyer les PDFs
      if (chatId) {
        this.chatId = chatId;
      }

      // Stocker la question actuelle pour la détection automatique de "liste"
      this.currentQuestion = question;

      console.log('🤖 Question V2:', question);

      // 🔍 DÉTECTION SIMPLIFIÉE: Ajouter des hints pour guider l'IA
      const questionLower = question.toLowerCase();

      // Détection de comparaison entre employés
      const isComparisonQuery =
        (questionLower.includes('comparaison') ||
         questionLower.includes('comparer') ||
         questionLower.includes('compare') ||
         questionLower.includes('différence') ||
         questionLower.includes('vs')) &&
        (questionLower.includes(' et ') || questionLower.includes(','));

      if (isComparisonQuery) {
        console.log('🔍 Détection: Question de comparaison de salaires - ajout d\'un hint pour l\'IA');
        question = `[HINT: Cette question nécessite compare_employee_salaries, pas get_employee_salaries] ${question}`;
      }

      // Détection de période multi-mois (ex: "entre octobre et décembre")
      const multiMonthPattern = /entre\s+(\w+)\s+et\s+(\w+)/i;
      const multiMonthMatch = question.match(multiMonthPattern);
      if (multiMonthMatch && questionLower.includes('salaire')) {
        console.log('🔍 Détection: Période multi-mois - ajout d\'un hint pour l\'IA');
        question = `[HINT: L'utilisateur demande une période de plusieurs mois (${multiMonthMatch[1]} à ${multiMonthMatch[2]}). Utiliser get_employee_salaries avec start_month="${multiMonthMatch[1]}" et end_month="${multiMonthMatch[2]}" (NE PAS utiliser month=).] ${question}`;
      }

      // Détection de "top X employés" ou "les X employés les mieux payés"
      const topEmployeesPattern = /(top\s*(\d+)\s+employ[eé]s|les?\s+(\d+)\s+employ[eé]s\s+(les\s+)?(mieux|plus)\s+pay[eé]s)/i;
      const topEmployeesMatch = question.match(topEmployeesPattern);
      if (topEmployeesMatch && !questionLower.includes('salaire')) {
        // Extraire le nombre (peut être dans le groupe 2 ou 3)
        const topNumber = topEmployeesMatch[2] || topEmployeesMatch[3];
        console.log(`🔍 Détection: Top ${topNumber} employés - ajout d'un hint pour l'IA`);
        question = `[HINT: L'utilisateur demande le top ${topNumber} des employés les mieux payés. Utiliser get_employee_salaries sans employee_name ni month pour obtenir le classement des salaires.] ${question}`;
      }

      // Détection de "où se situe X" ou "position de X" ou "classement de X"
      const rankingPattern = /(où se situe|position de|classement de|rang de|se classe)\s+([a-zàâäçèéêëìîïòôöùûü\s]+)\s+(par rapport|parmi|dans)/i;
      const rankingMatch = question.match(rankingPattern);
      if (rankingMatch) {
        const employeeName = rankingMatch[2].trim();
        console.log(`🔍 Détection: Question de classement pour "${employeeName}" - ajout d'un hint pour l'IA`);
        question = `[HINT: L'utilisateur demande le classement de "${employeeName}" parmi tous les employés. Utiliser get_employee_salaries avec employee_name="${employeeName}" pour obtenir son classement.] ${question}`;
      }

      // Détection de nom partiel court (possiblement une recherche partielle)
      // Ex: "lina" (4 chars), "hassan" (6 chars) sans contexte de phrase
      const singleWordPattern = /^[a-zàâäçèéêëìîïòôöùûü]{3,15}$/i;
      const isSingleShortName = singleWordPattern.test(question.trim());
      if (isSingleShortName) {
        console.log('🔍 Détection: Nom partiel court - ajout d\'un hint pour l\'IA');
        question = `[HINT: "${question.trim()}" semble être un nom partiel. Utiliser get_employee_salaries avec employee_name="${question.trim()}" pour trouver les employés correspondants.] ${question}`;
      }

      // ========== DÉTECTIONS POUR LES FOURNISSEURS ==========

      // Liste des fournisseurs connus (noms courants)
      const knownSuppliers = ['foster', 'coca-cola', 'cocacola', 'engie', 'vivaqua', 'shell', 'edenred', 'pluxee',
                              'colruyt', 'sligro', 'makro', 'metro', 'transgourmet', 'alkhoomsy', 'turbatu'];

      // Détecter si la question mentionne des noms de fournisseurs connus
      const mentionsSuppliers = knownSuppliers.some(supplier => questionLower.includes(supplier));

      // Détection de comparaison entre fournisseurs (améliorée)
      const isSupplierComparisonQuery =
        (questionLower.includes('comparaison') ||
         questionLower.includes('comparer') ||
         questionLower.includes('compare') ||
         questionLower.includes('différence') ||
         questionLower.includes('vs')) &&
        (questionLower.includes('fournisseur') || questionLower.includes('supplier') || mentionsSuppliers) &&
        (questionLower.includes(' et ') || questionLower.includes(','));

      if (isSupplierComparisonQuery) {
        console.log('🔍 Détection: Question de comparaison de fournisseurs - ajout d\'un hint pour l\'IA');
        question = `[HINT: Cette question nécessite compare_supplier_expenses, pas compare_employee_salaries ou analyze_supplier_expenses. Les noms mentionnés sont des FOURNISSEURS.] ${question}`;
      }

      // Détection de "top X fournisseurs" ou "les X fournisseurs les plus chers" (case-insensitive)
      const topSuppliersPattern = /(top\s*(\d+)\s+fournisseurs?|les?\s+(\d+)\s+fournisseurs?\s+(les\s+)?(plus|mieux|chers)?|top\s*(\d+).*fournisseurs?.*novembre|top\s*(\d+).*fournisseurs?.*décembre|top\s*(\d+).*fournisseurs?.*octobre)/i;
      const topSuppliersMatch = question.match(topSuppliersPattern);
      if (topSuppliersMatch) {
        const topNumber = topSuppliersMatch[2] || topSuppliersMatch[3] || topSuppliersMatch[6] || topSuppliersMatch[7] || topSuppliersMatch[8];
        console.log(`🔍 Détection: Top ${topNumber} fournisseurs - ajout d'un hint pour l'IA`);
        question = `[HINT: L'utilisateur demande le top ${topNumber} des fournisseurs par dépenses. Utiliser analyze_supplier_expenses sans supplier_name pour obtenir le classement des fournisseurs. NE PAS utiliser get_period_transactions.] ${question}`;
      }

      // Détection de période multi-mois pour fournisseurs (ex: "dépenses entre octobre et décembre")
      if (multiMonthMatch && (questionLower.includes('fournisseur') || questionLower.includes('dépense') || questionLower.includes('dépenses'))) {
        console.log('🔍 Détection: Période multi-mois pour fournisseurs - ajout d\'un hint pour l\'IA');
        question = `[HINT: L'utilisateur demande une période de plusieurs mois (${multiMonthMatch[1]} à ${multiMonthMatch[2]}) pour les fournisseurs/dépenses. Utiliser analyze_supplier_expenses avec start_month="${multiMonthMatch[1]}" et end_month="${multiMonthMatch[2]}" (NE PAS utiliser month= ni get_period_transactions).] ${question}`;
      }

      // Détection de "analyse dépenses fournisseurs"
      const analyzeExpensesPattern = /analyse.*(dépenses?|fournisseurs?)|dépenses?.*(analyse|fournisseurs?)/i;
      const analyzeExpensesMatch = question.match(analyzeExpensesPattern);
      if (analyzeExpensesMatch) {
        console.log('🔍 Détection: Analyse de dépenses fournisseurs - ajout d\'un hint pour l\'IA');
        question = `[HINT: L'utilisateur demande une analyse des dépenses fournisseurs. Utiliser analyze_supplier_expenses pour obtenir l'analyse complète avec statistiques.] ${question}`;
      }

      // ========== DÉTECTIONS POUR LES BALANCES MENSUELLES ==========

      // Détection de demande de balances pour PLUSIEURS mois (minimum 2)
      // Ex: "balances d'octobre, novembre et décembre", "balances d'octobre et novembre"
      // Compter le nombre de mois mentionnés avec virgules ou "et"
      const monthNames = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
      const mentionedMonths = monthNames.filter(month => questionLower.includes(month));
      const hasMultipleMonths = mentionedMonths.length >= 2;
      const hasBalanceKeyword = questionLower.includes('balance');
      const hasRevenuesKeyword = questionLower.includes('recette') || questionLower.includes('revenue') || questionLower.includes('rentrée');

      if (hasBalanceKeyword && hasMultipleMonths) {
        console.log(`🔍 Détection: Balances multi-mois (${mentionedMonths.length} mois détectés) - ajout d'un hint pour l'IA`);
        question = `[HINT: L'utilisateur demande les balances de ${mentionedMonths.length} mois (${mentionedMonths.join(', ')}). Utiliser get_monthly_summaries avec la liste des mois mentionnés (format YYYY-MM). NE PAS utiliser get_period_transactions car l'utilisateur veut un résumé par mois sans liste détaillée des transactions.] ${question}`;
      }

      // Détection de recettes multi-mois (ex: "recettes des 3 derniers mois", "recettes d'octobre et novembre")
      if (hasRevenuesKeyword && (hasMultipleMonths || questionLower.match(/\d+\s*(derniers?|précédents?)\s*mois/))) {
        console.log(`🔍 Détection: Recettes multi-mois - ajout d'un hint pour l'IA`);
        question = `[HINT: L'utilisateur demande les recettes de PLUSIEURS mois. Utiliser get_multi_month_revenues avec la liste des mois concernés (format YYYY-MM). NE PAS utiliser get_period_transactions.] ${question}`;
      }

      // Construire les messages avec l'historique de conversation
      // Date actuelle pour le contexte
      const now = new Date();
      const currentDate = now.toLocaleDateString('fr-BE', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
      const currentMonth = now.toLocaleDateString('fr-BE', { month: 'long', year: 'numeric' });

      const messages: any[] = [
        {
          role: 'system',
          content: `Tu es un assistant expert en gestion d'entreprise. Tu as accès à des outils pour récupérer toutes les informations sur les factures et transactions bancaires.

📅 DATE ACTUELLE: ${currentDate}
📅 MOIS EN COURS: ${currentMonth}

IMPORTANT - CALCUL DES DATES:
- Aujourd'hui = ${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear()}
- Année en cours = ${now.getFullYear()}
- Mois en cours = ${now.getMonth() + 1} (${currentMonth})
- Quand l'utilisateur dit "ce mois", "le mois en cours" → ${currentMonth}
- Quand l'utilisateur dit "les 3 derniers mois" → calcule à partir d'aujourd'hui (${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear()})

RÈGLES IMPORTANTES:
⚠️ **RÈGLE ABSOLUE - ZÉRO HALLUCINATION** ⚠️
TU NE DOIS JAMAIS, SOUS AUCUN PRÉTEXTE, INVENTER OU DEVINER DES DONNÉES.
- Pour TOUTE question nécessitant des données (montants, nombres, listes, noms), tu DOIS appeler l'outil correspondant
- Si un outil existe pour une question, tu DOIS l'appeler AVANT de répondre
- NE JAMAIS utiliser ta mémoire ou ta connaissance générale pour répondre à des questions factuelles sur ce business
- NE JAMAIS inventer de chiffres, même approximatifs
- NE JAMAIS inventer de noms de fournisseurs, d'employés ou d'utilisateurs
- Si tu n'as pas appelé d'outil pour obtenir les données, tu NE DOIS PAS répondre

1. **UTILISE TES OUTILS SYSTÉMATIQUEMENT** - Pour CHAQUE question sur les factures, transactions, utilisateurs, fournisseurs, tu DOIS appeler l'outil correspondant. Aucune exception.
2. **NE DIS JAMAIS "je n'ai pas accès"** - Tu as TOUTES les données via tes outils. Appelle-les.
2b. **LISTE DES OUTILS** - Si on te demande "liste les outils", "quels outils as-tu", "liste les fonctions IA", réponds directement avec la liste de tes 25 outils disponibles (factures, paiements, recherche, gestion utilisateurs, etc.) SANS appeler de fonction
3. **SYNTHÈSE** - Réponds en 2-4 phrases (sauf pour les listes explicites)
4. **FORMAT NATUREL** - Parle comme un humain
5. **ÉMOJIS** - 2-3 max pour la clarté
6. **COHÉRENCE** - Même montant = même réponse
7. **CONTEXTE CONVERSATIONNEL** - Tu as accès à l'historique complet de la conversation. Lis-le ATTENTIVEMENT avant de répondre:
   - "Cette facture" → Facture mentionnée dans l'échange précédent
   - "Celle de X" → Entité mentionnée précédemment (ex: si on vient de parler de factures Foster, "celle de octobre" = factures Foster d'octobre)
   - "Le même fournisseur" → Fournisseur mentionné précédemment
   - "Ces transactions" → Transactions mentionnées précédemment
   - AVANT d'appeler une fonction, vérifie l'historique pour identifier les entités contextuelles !

8. **RÉSOLUTION DES PRONOMS** - CRITIQUE: Si la question contient "celle", "celui", "celles", "ces", "cette":
   - REGARDE l'historique pour trouver l'entité référencée
   - Exemple:
     Q1: "Factures Foster après le 15 décembre"
     Q2: "Celle de la première semaine d'octobre"
     → "Celle" = "Factures Foster" → Cherche factures Foster d'octobre (PAS toutes les factures d'octobre)

9. **TOUS LES SALAIRES** - Quand on demande "tous les salaires" ou "les salaires" sans période spécifique, utilise get_employee_salaries SANS paramètre month (couvre toute l'année)

10. **ZERO RÉSULTAT FOURNISSEUR/EMPLOYÉ = DEMANDE ORTHOGRAPHE** - UNIQUEMENT pour get_supplier_payments, get_supplier_received_payments, get_employee_salaries: Si le résultat est 0 (payment_count: 0, total: 0), demande l'orthographe: "🔍 Je ne trouve pas de fournisseur/employé nommé 'X'. Pourriez-vous vérifier l'orthographe ?" MAIS pour les autres fonctions (recettes_mois, get_period_transactions, etc.), réponds normalement avec les montants, même si c'est 0 €.

10b. ⚠️ **MOTS-CLÉS GÉNÉRIQUES = DEMANDE DE PRÉCISION** - RÈGLE ABSOLUE ET OBLIGATOIRE:
   - ⛔ INTERDIT D'UTILISER get_period_transactions si la question contient "loyer", "électricité", "gaz", "eau", "internet", "téléphone" SANS nom de fournisseur
   - Tu DOIS TOUJOURS demander d'abord le nom du fournisseur avec cette formule EXACTE:
     "🔍 Pour vous donner le montant exact, pourriez-vous me préciser le nom du fournisseur/propriétaire pour [le loyer/l'électricité/etc.] ?"
   - ⚠️ NE JAMAIS appeler get_period_transactions sans supplier_name pour ces mots-clés
   - ⚠️ NE JAMAIS retourner toutes les transactions quand l'utilisateur demande un type spécifique de dépense
   - EXCEPTION: Si le contexte de conversation précédent mentionne déjà le fournisseur, utilise ce contexte
   - Exemples OBLIGATOIRES:
     * "Combien j'ai payé de loyer ?" → Tu DOIS répondre: "🔍 Pour vous donner le montant exact, pourriez-vous me préciser le nom du propriétaire ?"
     * "Loyer des 3 derniers mois" → Tu DOIS répondre: "🔍 Pour vous donner le montant exact, pourriez-vous me préciser à qui vous payez le loyer ?"
     * "Factures électricité" → Tu DOIS répondre: "🔍 Pour vous donner le montant exact, pourriez-vous me préciser votre fournisseur d'électricité ?"
   - ❌ NE JAMAIS faire: Appeler get_period_transactions({start_date, end_date}) sans supplier_name pour ces cas

11. ⚠️ **GESTION DES UTILISATEURS - NE JAMAIS INVENTER** - CRITIQUE:
   - Pour TOUTE question sur les utilisateurs, tu DOIS appeler list_users() AVANT de répondre
   - NE JAMAIS inventer de Chat IDs ou de noms d'utilisateurs
   - ⚠️ NE JAMAIS utiliser les infos de CLAUDE.md pour les utilisateurs - ces infos sont OBSOLÈTES
   - ⚠️ NE JAMAIS utiliser ta mémoire de conversation pour la liste d'utilisateurs
   - SEUL list_users() retourne la liste ACTUELLE et VRAIE
   - Si l'utilisateur dit "supprime le 4" ou "supprime le 3ème", tu DOIS:
     1. Appeler list_users() pour obtenir la vraie liste
     2. Identifier le Chat ID correspondant à la position demandée
     3. Appeler remove_user() avec le Chat ID EXACT
     4. Appeler list_users() à nouveau pour confirmer
   - Après add_user() ou remove_user(), tu DOIS rappeler list_users() pour afficher la liste mise à jour
   - TOUJOURS utiliser les données RÉELLES retournées par les outils, JAMAIS ta mémoire ou imagination

12. ⚠️ **FONCTIONS AVEC MESSAGE PRÉFORMATÉ** - CRITIQUE:
   - Pour list_users(), list_employees(), list_suppliers(): La réponse contient un champ "direct_response"
   - ⚠️⚠️⚠️ RÈGLE ABSOLUE: Si la réponse contient le champ "direct_response", tu DOIS renvoyer EXACTEMENT ce contenu, RIEN D'AUTRE
   - NE PAS ajouter "Voici la liste", "Voici", "Voici la liste des employés", "Voici les fournisseurs", ou une introduction
   - NE PAS reformater, NE PAS créer ta propre liste, NE PAS modifier le format
   - NE PAS ajouter d'astérisques **, NE PAS ajouter de gras, NE PAS ajouter de code (backticks), NE PAS changer la ponctuation
   - "direct_response" est déjà formaté pour Telegram, RENVOIE-LE TEL QUEL sans un seul changement, sans un seul mot ajouté
   - C'est comme un "COPY-PASTE": tu copies exactement direct_response et tu envoies, rien de plus
   - ⚠️ INTERDICTION FORMELLE: Ne jamais entourer les noms avec ** ou guillemets inversés ou tout autre caractère Markdown

EXEMPLES D'UTILISATION CORRECTE DES OUTILS:
✅ Question: "Combien de factures en décembre ?"
   → APPELLE: get_invoices_by_month("décembre")
   → RÉPONDS: "8 factures en décembre pour 19 250,67 €"

✅ Question: "Liste des utilisateurs"
   → APPELLE: list_users()
   → RÉPONDS avec la liste RÉELLE retournée par l'outil

✅ Question: "Combien j'ai gagné ce mois ?"
   → APPELLE: get_monthly_credits()
   → RÉPONDS avec le total RÉEL retourné

❌ EXEMPLES DE CE QU'IL NE FAUT JAMAIS FAIRE:
❌ Question: "Combien de factures en décembre ?"
   → NE PAS RÉPONDRE: "Il y a environ 10 factures" (INVENTION!)
   → NE PAS utiliser ta mémoire ou estimation

❌ Question: "Liste des utilisateurs"
   → NE PAS RÉPONDRE sans appeler list_users()
   → NE JAMAIS inventer: "Il y a Hassan, Soufiane, Loubna, et un 4ème" (FAUX!)

❌ Question: "Balance du mois"
   → NE PAS RÉPONDRE: "Environ 5000 €" (INVENTION!)
   → APPELLE get_monthly_balance() pour obtenir le montant EXACT

Question: "Salaires de novembre"
→ APPELLE: get_employee_salaries({employee_name: "Jamhoun Mokhlis", month: "novembre"})
→ RÉPONDS: Salaires de novembre uniquement

CAS SPÉCIAL - FOURNISSEUR NON TROUVÉ:
Question: "Combien j'ai payé à Moniz ?"
Données: {"payment_count": 0, "total_paid": 0}
✅ BONNE RÉPONSE: "🔍 Je ne trouve pas de fournisseur nommé 'Moniz'. Pourriez-vous l'épeler (M-O-N-I-Z) ou me donner l'orthographe exacte pour que je puisse le retrouver ?"
❌ MAUVAISE RÉPONSE: "💰 En décembre, vous n'avez reçu aucun montant du fournisseur Moniz, avec un total de 0 € sur 0 paiements."</think>

EXEMPLES DE BONNES RÉPONSES:
Question: "Combien j'ai gagné ce mois ?"
Données: {"total_amount": 46060.32, "transaction_count": 58}
✅ Réponse: "💵 Ce mois-ci, vous avez généré 46 060,32 € de recettes sur 58 transactions, principalement via paiements par carte."

Question: "Factures impayées ?"
Données: {"count": 5, "total_amount": 12500}
✅ Réponse: "📋 Vous avez 5 factures impayées pour un total de 12 500 €."

Question: "Liste les factures payées"
Données: {"paid_count": 5, "paid_invoices": [{supplier: "Uber Eats", amount: 1823.40}, ...]}
✅ Réponse: "📋 Vous avez payé 5 factures ce mois-ci:
1. Uber Eats - 1 823,40 €
2. Foster - 4 500,00 €
...
Total: 16 727,32 €"

CONTEXTE ET RÉFÉRENCES:
IMPORTANT: Quand l'utilisateur demande "le détail de cette facture", "plus d'infos sur cette facture", ou "est-ce qu'il existe un détail pour cette facture?", tu DOIS utiliser le CONTEXTE de la conversation précédente.

Exemple 1 - Référence à une facture:
Utilisateur: "Dernière facture payée pour Foster?"
Bot: "Le 22 décembre 2025 pour 5 903,70 €"
Utilisateur: "Est-ce qu'il existe un détail pour cette facture?"
→ APPELLE: get_invoice_by_supplier_and_amount({supplier_name: "Foster", amount: 5903.70})
→ RÉPONDS: Détails complets de la facture (numéro, date d'échéance, statut, PDF...)

Exemple 2 - Référence pronominale "celle de":
Utilisateur: "Donne-moi toutes les factures de Foster après le 15 décembre"
Bot: "Voici les factures Foster..."
Utilisateur: "Celle de la première semaine d'octobre"
→ CONTEXTE IDENTIFIÉ: "celle" = factures Foster (mentionné dans l'historique)
→ APPELLE: get_period_transactions({start_date: "2025-10-01", end_date: "2025-10-07", supplier_name: "Foster"})
→ PAS get_invoices_by_month("octobre") sans le fournisseur !

Si le contexte mentionne un fournisseur SANS montant précis, appelle get_invoice_by_supplier_and_amount avec juste le supplier_name.

🛠️ TES 36 OUTILS DISPONIBLES (réponds TOUJOURS en français):
📋 **Factures** (11 outils):
   • Factures impayées • Factures payées • Dernière facture • Factures en retard
   • Statistiques factures • Factures mois actuel • Factures par mois
   • Rechercher factures • Facture par montant • Recherche communication
   • Envoyer PDF facture

💰 **Transactions** (7 outils):
   • Balance du mois • Recettes du mois • Dépenses du mois
   • Transactions période • Salaires employés
   • Paiements fournisseur • Versements reçus

👥 **Employés** (5 outils):
   • Liste employés • Ajouter employé • Supprimer employé
   • Analyse salaires • Comparaison salaires

🏢 **Fournisseurs** (9 outils):
   • Liste fournisseurs • Ajouter fournisseur • Supprimer fournisseur
   • Analyse fournisseur • Top fournisseurs • Comparaison fournisseurs
   • Dépenses fournisseur • Paiements fournisseur • Détecter nouveaux fournisseurs

👥 **Utilisateurs** (3 outils):
   • Ajouter utilisateur • Retirer utilisateur • Liste utilisateurs

🔧 **Système** (1 outil):
   • Redémarrer le bot

⚠️ IMPORTANT: Quand on te demande "liste les outils", utilise UNIQUEMENT les noms en FRANÇAIS ci-dessus, JAMAIS les noms techniques (get_*, add_*, etc.)

INTERDICTIONS:
❌ Ne liste JAMAIS toutes les transactions bancaires une par une
❌ Ne répète JAMAIS les données brutes du JSON
❌ Ne dépasse JAMAIS 10 lignes (sauf pour les listes explicitement demandées)
❌ JAMAIS d'incohérence entre les montants dans la même conversation`,
        },
        ...this.conversationHistory, // Inclure l'historique récent
        {
          role: 'user',
          content: question,
        },
      ];

      let iteration = 0;
      const MAX_ITERATIONS = 10;

      while (iteration < MAX_ITERATIONS) {
        iteration++;
        console.log(`🔄 Itération ${iteration}...`);

        // Appeler soit OpenRouter soit Groq
        let response;
        if (this.aiProvider === 'openrouter' && this.openRouter) {
          response = await this.openRouter.chatCompletion({
            messages: messages as any,
            tools: this.tools,
            tool_choice: 'auto',
            temperature: 0.3,
            max_tokens: 500,
          });
        } else if (this.groq) {
          response = await this.groq.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            messages: messages as any,
            tools: this.tools,
            tool_choice: 'auto',
            temperature: 0.3,
            max_tokens: 500,
          });
        } else {
          throw new Error('Aucun provider IA disponible');
        }

        const message = response.choices[0]?.message;
        if (!message) throw new Error('Pas de réponse');

        messages.push(message);

        if (message.tool_calls && message.tool_calls.length > 0) {
          console.log(`📞 Appel de ${message.tool_calls.length} fonction(s)`);

          let directResponse: string | null = null;

          for (const toolCall of message.tool_calls) {
            const functionName = toolCall.function.name;
            const functionArgs = JSON.parse(toolCall.function.arguments);

            const result = await this.executeFunction(functionName, functionArgs);
            console.log(`✓ ${functionName}:`, result.substring(0, 100) + '...');

            // Vérifier si le résultat contient un direct_response (ne prendre que le premier)
            try {
              const parsedResult = JSON.parse(result);
              if (parsedResult.direct_response && !directResponse) {
                // Prendre seulement le PREMIER direct_response, ignorer les suivants
                directResponse = parsedResult.direct_response;
                console.log('📝 direct_response détecté - court-circuit de l\'IA');
              }
            } catch (e) {
              // Pas de JSON valide, ignorer
            }

            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: result,
            });
          }

          // Si on a un direct_response, le retourner immédiatement
          if (directResponse) {
            this.conversationHistory.push(
              { role: 'user', content: question },
              { role: 'assistant', content: directResponse }
            );
            if (this.conversationHistory.length > this.MAX_HISTORY) {
              this.conversationHistory = this.conversationHistory.slice(-this.MAX_HISTORY);
            }
            this.saveConversationState();
            // Supprimer tous les ** du texte
            return directResponse.replace(/\*\*/g, '');
          }

          continue;
        }

        if (message.content) {
          console.log('✅ Réponse finale générée');
          // Sauvegarder l'échange dans l'historique
          this.conversationHistory.push(
            { role: 'user', content: question },
            { role: 'assistant', content: message.content }
          );
          // Garder seulement les MAX_HISTORY derniers messages
          if (this.conversationHistory.length > this.MAX_HISTORY) {
            this.conversationHistory = this.conversationHistory.slice(-this.MAX_HISTORY);
          }
          // Sauvegarder l'état sur disque
          this.saveConversationState();
          // Supprimer tous les ** du texte
          return message.content.replace(/\*\*/g, '');
        }

        break;
      }

      const errorMsg = '❌ Impossible de traiter votre demande.';
      // Même en cas d'erreur, on sauvegarde la question
      this.conversationHistory.push({ role: 'user', content: question });
      if (this.conversationHistory.length > this.MAX_HISTORY) {
        this.conversationHistory = this.conversationHistory.slice(-this.MAX_HISTORY);
      }
      this.saveConversationState();
      return errorMsg;

    } catch (error: any) {
      console.error('❌ Erreur:', error);
      const errorMsg = `❌ Erreur: ${error.message}`;
      // Même en cas d'erreur, on sauvegarde la question
      this.conversationHistory.push({ role: 'user', content: question });
      if (this.conversationHistory.length > this.MAX_HISTORY) {
        this.conversationHistory = this.conversationHistory.slice(-this.MAX_HISTORY);
      }
      this.saveConversationState();
      return errorMsg;
    }
  }

  /**
   * Sauvegarde l'état de la conversation dans un fichier JSON
   */
  private saveConversationState(): void {
    try {
      const state = {
        conversationHistory: this.conversationHistory,
        timestamp: new Date().toISOString(),
        version: '2.0'
      };

      // S'assurer que le dossier data existe
      const dir = path.dirname(this.CONVERSATION_STATE_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(
        this.CONVERSATION_STATE_FILE,
        JSON.stringify(state, null, 2),
        'utf-8'
      );

      console.log('💾 État de conversation sauvegardé');
    } catch (error: any) {
      console.error('⚠️  Erreur sauvegarde conversation:', error.message);
    }
  }

  /**
   * Charge l'état de la conversation depuis le fichier JSON
   */
  private loadConversationState(): void {
    try {
      if (!fs.existsSync(this.CONVERSATION_STATE_FILE)) {
        console.log('📝 Nouvelle session de conversation');
        return;
      }

      const content = fs.readFileSync(this.CONVERSATION_STATE_FILE, 'utf-8');
      const state = JSON.parse(content);

      // Vérifier que la sauvegarde n'est pas trop ancienne (24h)
      const savedAt = new Date(state.timestamp);
      const now = new Date();
      const hoursSinceLastSave = (now.getTime() - savedAt.getTime()) / (1000 * 60 * 60);

      if (hoursSinceLastSave > 24) {
        console.log('🕐 État de conversation expiré (>24h), nouvelle session');
        return;
      }

      // Restaurer l'historique
      if (state.conversationHistory && Array.isArray(state.conversationHistory)) {
        this.conversationHistory = state.conversationHistory;
        console.log(`💡 État de conversation restauré (${this.conversationHistory.length} messages, sauvegardé ${Math.round(hoursSinceLastSave)}h ago)`);
      }
    } catch (error: any) {
      console.error('⚠️  Erreur chargement conversation:', error.message);
    }
  }

  /**
   * Efface l'historique de conversation
   */
  public clearConversationHistory(): void {
    this.conversationHistory = [];
    try {
      if (fs.existsSync(this.CONVERSATION_STATE_FILE)) {
        fs.unlinkSync(this.CONVERSATION_STATE_FILE);
      }
      console.log('🗑️  Historique de conversation effacé');
    } catch (error: any) {
      console.error('⚠️  Erreur effacement conversation:', error.message);
    }
  }

  isConfigured(): boolean {
    return !!config.groq.apiKey && config.groq.apiKey.length > 0;
  }
}
