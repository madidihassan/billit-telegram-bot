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
          description: '⚠️ APPEL OBLIGATOIRE: Obtenir le total RÉEL des recettes/rentrées du mois. Tu DOIS appeler cet outil pour TOUTE question sur les recettes, rentrées, ou entrées d\'argent. Ne JAMAIS inventer de montant. Exemples: "Recettes du mois?", "Total rentrées?", "Combien d\'entrées?"',
          parameters: { type: 'object', properties: {}, required: [] },
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
          name: 'get_period_transactions',
          description: 'Obtenir les transactions bancaires pour une période donnée. ⚠️ IMPORTANT: Si l\'utilisateur mentionne un fournisseur spécifique (ex: "paiements à Foster", "loyer d\'Alkhoomsy"), tu DOIS utiliser le paramètre supplier_name pour filtrer. Ne retourne PAS toutes les transactions si un fournisseur est mentionné.',
          parameters: {
            type: 'object',
            properties: {
              start_date: {
                type: 'string',
                description: 'Date de début (YYYY-MM-DD)',
              },
              end_date: {
                type: 'string',
                description: 'Date de fin (YYYY-MM-DD)',
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
          description: '⚠️ IMPORTANT: Si l\'utilisateur demande "TOUS les salaires", NE PAS spécifier employee_name pour obtenir TOUS les employés en UN SEUL APPEL. UTILISE CETTE FONCTION UNIQUEMENT pour les SALAIRES des EMPLOYÉS (Hassan, Jamhoun, Mokhlis, Soufiane Madidi, etc.). NE PAS utiliser pour les fournisseurs comme Foster, Coca-Cola, CIERS qui sont des factures, pas des salaires.',
          parameters: {
            type: 'object',
            properties: {
              employee_name: {
                type: 'string',
                description: '⚠️ OPTIONNEL: Nom de l\'employé (Hassan Madidi, Jamhoun Mokhlis, etc.). Si l\'utilisateur demande "TOUS les salaires", NE PAS spécifier ce paramètre pour obtenir TOUS les employés.',
              },
              month: {
                type: 'string',
                description: 'Mois en français (novembre, décembre) ou numéro (11, 12). NE PAS spéficier si l\'utilisateur demande "tous les salaires" sans mentionner un mois précis.',
              },
              year: {
                type: 'string',
                description: 'Année (2025, 2024). Par défaut année en cours si non spécifié.',
              },
            },
            required: [],
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
          const credits = await this.bankClient.getCredits();
          const now = new Date();
          const monthCredits = credits.filter(tx => {
            const txDate = new Date(tx.date);
            return txDate.getMonth() === now.getMonth() && txDate.getFullYear() === now.getFullYear();
          });
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

        case 'get_monthly_debits': {
          const debits = await this.bankClient.getDebits();
          const now = new Date();
          const monthDebits = debits.filter(tx => {
            const txDate = new Date(tx.date);
            return txDate.getMonth() === now.getMonth() && txDate.getFullYear() === now.getFullYear();
          });
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

          // Générer la liste formatée des transactions
          // Limiter à 30 transactions pour ne pas dépasser la limite Telegram (4096 caractères)
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
              const desc = (tx.description || 'Sans description').substring(0, 100); // Limiter la description
              return `${num}. ${date} ${type} ${amount}\n     ${desc}`;
            })
            .join('\n\n');

          const moreMessage = hasMore
            ? `\n\n... et ${transactions.length - maxTransactions} autres transactions\n(Affichage limité aux ${maxTransactions} plus récentes)`
            : '';

          const directResponse = `📊 Transactions du ${startDate.toLocaleDateString('fr-BE')} au ${endDate.toLocaleDateString('fr-BE')}\n\n` +
            `Total: ${transactions.length} transactions\n` +
            `💰 Crédits: ${totalCredits.toFixed(2)}€ (${credits.length} tx)\n` +
            `💸 Débits: ${totalDebits.toFixed(2)}€ (${debits.length} tx)\n` +
            `📈 Balance: ${balance.toFixed(2)}€\n\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            transactionsList +
            moreMessage;

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
          // Gérer month/year ou start_date/end_date
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
            return desc.includes('salaire');
          };

          if (args.employee_name) {
            // Filtrer pour un employé spécifique
            salaryTransactions = transactions.filter(tx => {
              if (tx.type !== 'Debit' || !tx.description) return false;
              // Accepter si: contient "salaire" OU si le nom de l'employé correspond
              return isSalaryTransaction(tx.description) || matchesEmployeeName(tx.description, args.employee_name);
            });
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

          result = {
            employee_name: args.employee_name || 'Tous les employés',
            period: `${startDate.toLocaleDateString('fr-BE')} - ${endDate.toLocaleDateString('fr-BE')}`,
            total_paid: totalPaid,
            payment_count: salaryTransactions.length,
            payments: salaryTransactions.map(tx => ({
              date: tx.date,
              amount: Math.abs(tx.amount),
              description: tx.description,
            })),
            currency: 'EUR',
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

            // Formatage optimisé pour Telegram
            const suppliersList = suppliers.map((sup, index) => {
              const num = String(index + 1).padStart(2);
              const name = sup.name;
              const type = sup.type || 'fournisseur';
              const typeIcon = type === 'fournisseur' ? '📦' : type === 'partenaire' ? '🤝' : '👤';

              return `\`${num}. ${name}\`\n   └─ ${typeIcon} ${type}`;
            }).join('\n\n');

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
   * Traite une question
   */
  async processQuestion(question: string, chatId?: string): Promise<string> {
    try {
      // Stocker le chatId pour envoyer les PDFs
      if (chatId) {
        this.chatId = chatId;
      }

      console.log('🤖 Question V2:', question);

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

10b. ⚠️ **MOTS-CLÉS GÉNÉRIQUES = DEMANDE DE PRÉCISION** - CRITIQUE:
   - Si l'utilisateur utilise des termes génériques comme "loyer", "électricité", "gaz", "eau", "internet", "téléphone" SANS mentionner un nom de fournisseur spécifique:
   - Tu DOIS demander le nom du fournisseur: "🔍 Pourriez-vous préciser le nom du fournisseur pour le [loyer/électricité/etc.] ? Par exemple, [suggérer quelques fournisseurs possibles si connus]"
   - NE PAS utiliser get_period_transactions sans supplier_name pour ces termes génériques
   - EXCEPTION: Si le contexte de conversation précédent mentionne déjà le fournisseur, utilise ce contexte
   - Exemples:
     * "Combien j'ai payé de loyer ?" → Demande: "Quel est le nom du propriétaire/agence ?"
     * "Loyer des 3 derniers mois" → Demande: "À qui payez-vous le loyer ?"
     * "Factures électricité" → Demande: "Quel est votre fournisseur d'électricité ? (ex: Engie, Luminus)"

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

🛠️ TES 25 OUTILS DISPONIBLES (réponds TOUJOURS en français):
📋 **Factures** (11 outils):
   • Factures impayées • Factures payées • Dernière facture • Factures en retard
   • Statistiques factures • Factures mois actuel • Factures par mois
   • Rechercher factures • Facture par montant • Recherche communication
   • Envoyer PDF facture

💰 **Transactions** (7 outils):
   • Balance du mois • Recettes du mois • Dépenses du mois
   • Transactions période • Salaires employés
   • Paiements fournisseur • Versements reçus

🏢 **Fournisseurs** (3 outils):
   • Liste fournisseurs • Ajouter fournisseur • Supprimer fournisseur

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

            // Vérifier si le résultat contient un direct_response
            try {
              const parsedResult = JSON.parse(result);
              if (parsedResult.direct_response) {
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
