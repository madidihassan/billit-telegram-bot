import Groq from 'groq-sdk';
import { config } from './config';
import { CommandHandler } from './command-handler';
import { BillitClient } from './billit-client';
import { BankClient } from './bank-client';
import { OpenRouterClient } from './openrouter-client';
import { ExpenseCategorizer, ExpenseCategoryType } from './expense-categorizer';
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
  hasPermission,
  getPermissionDeniedMessage,
} from './database';

// Nouveaux imports V3.0
import { allTools } from './ai-agent/tools';
import { logInfo, logDebug, logError, logWarn, logAudit } from './utils/logger';
import { globalCache, CacheKeys, CacheTTL } from './cache/smart-cache';
import { globalMetrics } from './monitoring/bot-metrics';
import { AlertService } from './alert-service'; // 🚀 OUTIL 10: Système d'alertes

// NIVEAU 2: Intelligence contextuelle
import { ConversationManager } from './services/conversation-manager';
import { ContextDetector } from './services/context-detector';
import { SemanticCache } from './services/semantic-cache';
import { aiMatchSupplier, aiMatchEmployee, aiParsePeriod } from './services/ai-helpers';
import { executeAnalyticsFunction } from './ai-agent/executors/analytics-executor';
import { executeAdminFunction } from './ai-agent/executors/admin-executor';
import { executeInvoiceFunction } from './ai-agent/executors/invoice-executor';
import { executeTransactionFunction } from './ai-agent/executors/transaction-executor';
import { executeEmployeeFunction } from './ai-agent/executors/employee-executor';
import { executeSupplierFunction } from './ai-agent/executors/supplier-executor';
import { executeMiscFunction } from './ai-agent/executors/misc-executor';
import type { ExecutorContext, ExecutorHelpers } from './ai-agent/executors/types';
import type { ToolArgs, ToolResult, AITool, AIMessage, TelegramBotInstance, EmployeeData, SupplierData, DisplaySection, InlineButton } from './types/ai-agent';
import { BillitInvoice } from './types';
import { BankTransaction } from './bank-client';

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
  private telegramBot: TelegramBotInstance | null = null;
  private chatId: string | null = null;
  private currentQuestion: string = '';
  private tools: AITool[];
  public lastToolsCalled: string[] = []; // Outils appelés lors de la dernière requête (pour benchmark)
  private lastSuggestionQuestions: string[] | null = null; // 🆕 Suggestions contextuelles (tableau de questions)

  // NIVEAU 2: Nouveau système de conversation intelligent
  private conversationManager: ConversationManager;
  private contextDetector: ContextDetector;
  private semanticCache: SemanticCache;
  private alertService: AlertService; // 🚀 OUTIL 10: Système d'alertes

  // ANCIEN SYSTÈME (conservé temporairement pour compatibilité)
  private conversationHistory: Array<{ role: string; content: string }> = [];
  private readonly MAX_HISTORY = 20;
  private readonly CONVERSATION_STATE_FILE = 'data/conversation-state.json';

  constructor(commandHandler: CommandHandler, telegramBot?: TelegramBotInstance) {
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

    // NIVEAU 2: Initialiser les services intelligents
    this.conversationManager = new ConversationManager();
    this.contextDetector = new ContextDetector();
    this.semanticCache = new SemanticCache();
    this.alertService = new AlertService(); // 🚀 OUTIL 10: Système d'alertes

    // Afficher le provider utilisé
    if (this.aiProvider === 'openrouter') {
      console.log(`✓ Agent IA autonome V2.5 (OpenRouter ${openRouterClient.getModel()}) - ${this.tools.length} outils`);
    } else {
      console.log(`✓ Agent IA autonome V2.5 (Groq fallback) - ${this.tools.length} outils`);
    }

    // Charger l'état de conversation sauvegardé (ancien système, conservé)
    this.loadConversationState();

    logInfo('NIVEAU 2 activé: Mémoire contextuelle + Détection de références', 'ai-agent-v2');
  }

  /**
   * Définit tous les outils disponibles
   * REFACTORÉ: Les outils sont maintenant définis dans src/ai-agent/tools/
   */
  private defineTools(): Groq.Chat.Completions.ChatCompletionTool[] {
    return allTools;
  }

  /**
   * 🎯 OPTIMISATION: Sélectionne dynamiquement les outils pertinents selon la question
   * Réduit l'usage de tokens de ~70% en n'envoyant que les outils nécessaires
   */
  /**
   * 🤖 Classification IA de la question pour sélectionner les catégories d'outils pertinentes
   * Remplace les mots-clés en dur par une analyse intelligente
   */
  private async classifyQuestionWithAI(question: string): Promise<string[]> {
    try {
      const classificationPrompt = `Tu es un classificateur de questions pour un assistant IA de gestion financière.

Catégories disponibles:
- invoices: Questions sur les factures (liste, statut, impayées, en retard, dernière facture)
- transactions: Questions sur les transactions bancaires (balance mensuelle simple, paiements généraux, flux financiers, dernière transaction)
- employees: Questions sur les employés, salaires, paie, staff
- suppliers: Questions sur les fournisseurs, dépenses chez un fournisseur, paiements à un fournisseur spécifique
- aggregation: Résumés complets, bilans annuels, BÉNÉFICES, RÉSULTATS, profits, rapports annuels/trimestriels, comparaisons de périodes, questions "combien gagné/perdu sur l'année"
- analytics: Prévisions, analyses de tendances, détection d'anomalies, exports de données
- users: Gestion des utilisateurs et accès

Question: "${question}"

Retourne UNIQUEMENT un tableau JSON des catégories pertinentes, sans explication.
Exemple: ["suppliers", "transactions"]

Règles spéciales:
- Si la question mentionne un fournisseur spécifique (nom propre d'entreprise), inclus TOUJOURS "suppliers"
- Si la question mentionne "bénéfice", "résultat", "profit", "perte", "gagné", "perdu" sur une année, inclus TOUJOURS "aggregation" (et pas "transactions")
- Si demande de résumé/bilan annuel complet, utilise "aggregation" (pas "transactions")

Réponse JSON:`;

      let response;
      if (this.aiProvider === 'openrouter' && this.openRouter) {
        response = await this.openRouter.chatCompletion({
          messages: [{ role: 'user', content: classificationPrompt }],
          temperature: 0.1,
          max_tokens: 100,
        });
      } else if (this.groq) {
        response = await this.groq.chat.completions.create({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'user', content: classificationPrompt }],
          temperature: 0.1,
          max_tokens: 100,
        });
      } else {
        throw new Error('Aucun provider IA disponible');
      }

      let content = response.choices[0]?.message?.content?.trim() || '[]';

      // 🔧 FIX: Nettoyer les backticks markdown si présents
      // Exemples: "```json\n[...]\n```" ou "```\n[...]\n```"
      content = content.replace(/^```(?:json)?\n?/g, '').replace(/\n?```$/g, '');

      // Parser le JSON
      const categories = JSON.parse(content);

      if (!Array.isArray(categories)) {
        console.warn('⚠️ Classification IA invalide, fallback vers tous les outils');
        return ['invoices', 'transactions', 'employees', 'suppliers', 'aggregation', 'analytics', 'users'];
      }

      console.log(`🤖 Classification IA: ${categories.join(', ')}`);
      return categories;

    } catch (error) {
      console.error('❌ Erreur classification IA:', error);
      // Fallback: retourner toutes les catégories
      return ['invoices', 'transactions', 'employees', 'suppliers', 'aggregation', 'analytics', 'users'];
    }
  }

  /**
   * ⚡ Matching intelligent de fournisseur avec FUZZY LOCAL (OPTIMISÉ - pas d'appel IA)
   * Convertit les noms approximatifs en noms exacts de la base de données
   * Exemples: "verisur" → "VERISURE SA", "kbc" → "KBC Bank SA"
   */
  private async matchSupplierWithAI(searchTerm: string): Promise<string> {
    try {
      // Récupérer tous les fournisseurs actifs de la BD
      const suppliers = getAllSuppliers();

      if (suppliers.length === 0) {
        console.warn('⚠️ Aucun fournisseur dans la base de données');
        return searchTerm;
      }

      // Fuzzy matching local
      const searchLower = searchTerm.toLowerCase();
      let bestMatch: { name: string; distance: number } | null = null;

      for (const supplier of suppliers) {
        const supplierNameLower = supplier.name.toLowerCase();

        // Calculer la distance de Levenshtein
        const distance = this.levenshteinDistance(searchLower, supplierNameLower);

        // Accepter si la distance est raisonnable (max 3 caractères de différence ou 30% du nom)
        const maxDistance = Math.max(3, Math.floor(searchLower.length * 0.3));

        if (distance <= maxDistance) {
          if (!bestMatch || distance < bestMatch.distance) {
            bestMatch = { name: supplier.name, distance };
          }
        }
      }

      if (bestMatch) {
        console.log(`🎯 Matching fournisseur LOCAL: "${searchTerm}" → "${bestMatch.name}" (distance: ${bestMatch.distance})`);
        return bestMatch.name;
      } else {
        console.log(`⚠️ Aucun match fournisseur trouvé pour "${searchTerm}", utilisation du terme original`);
        return searchTerm;
      }

    } catch (error) {
      console.error('❌ Erreur matching fournisseur:', error);
      return searchTerm;
    }
  }

  /**
   * ⚡ Matching intelligent d'employé avec FUZZY LOCAL (OPTIMISÉ - pas d'appel IA)
   * Convertit les noms approximatifs/prénoms seuls en noms complets exacts
   * Exemples: "sufjan" → "Soufiane Madidi", "jawad" → "Jawad Madidi"
   */
  private async matchEmployeeWithAI(searchTerm: string): Promise<string> {
    try {
      // Utiliser la fonction de fuzzy matching locale existante
      const closestMatch = await this.findClosestEmployee(searchTerm);

      if (closestMatch) {
        console.log(`🎯 Matching employé LOCAL: "${searchTerm}" → "${closestMatch.employee.name}" (distance: ${closestMatch.distance})`);
        return closestMatch.employee.name;
      } else {
        console.log(`⚠️ Aucun match employé trouvé pour "${searchTerm}", utilisation du terme original`);
        return searchTerm;
      }

    } catch (error) {
      console.error('❌ Erreur matching employé:', error);
      return searchTerm;
    }
  }

  /**
   * 🤖 Parsing intelligent de période avec IA
   * Convertit du langage naturel en dates précises
   * Exemples: "année 2025" → {start: 2025-01-01, end: 2025-12-31}
   *           "janvier" → {start: 2026-01-01, end: 2026-01-31}
   */
  private async parsePeriodWithAI(text: string): Promise<{ start: Date; end: Date; description: string } | null> {
    try {
      // 🔧 FIX: Vérifier que le client IA est disponible et obtenir le bon client
      let aiClient: Groq | ReturnType<OpenRouterClient['getOpenAICompatibleClient']>;
      if (this.aiProvider === 'openrouter') {
        if (!this.openRouter) {
          console.log(`⚠️ Client OpenRouter non disponible, impossible de parser la période`);
          return null;
        }
        // Utiliser le client OpenAI compatible
        aiClient = this.openRouter.getOpenAICompatibleClient();
      } else {
        if (!this.groq) {
          console.log(`⚠️ Client Groq non disponible, impossible de parser la période`);
          return null;
        }
        aiClient = this.groq;
      }

      // Créer le provider IA
      const provider = {
        type: this.aiProvider,
        client: aiClient
      };

      // Appeler aiParsePeriod
      const period = await aiParsePeriod(text, provider);

      if (period) {
        console.log(`🎯 Parsing période IA: "${text}" → ${period.start.toISOString().split('T')[0]} à ${period.end.toISOString().split('T')[0]}`);
        return period;
      } else {
        console.log(`⚠️ Impossible de parser la période "${text}"`);
        return null;
      }

    } catch (error) {
      console.error('❌ Erreur parsing période IA:', error);
      return null;
    }
  }

  private async selectRelevantTools(question: string): Promise<Groq.Chat.Completions.ChatCompletionTool[]> {
    const selectedTools: Groq.Chat.Completions.ChatCompletionTool[] = [];

    // Import des catégories d'outils
    const { invoiceTools } = require('./ai-agent/tools/invoice-tools');
    const { transactionTools } = require('./ai-agent/tools/transaction-tools');
    const { employeeTools } = require('./ai-agent/tools/employee-tools');
    const { supplierTools } = require('./ai-agent/tools/supplier-tools');
    const { aggregationTools } = require('./ai-agent/tools/aggregation-tools');
    const { analyticsTools } = require('./ai-agent/tools/analytics-tools');
    const { userTools } = require('./ai-agent/tools/user-tools');
    const { systemTools } = require('./ai-agent/tools/system-tools');

    // Toujours inclure les outils système (légers)
    selectedTools.push(...systemTools);

    // 🤖 Classification IA de la question
    let categories = await this.classifyQuestionWithAI(question);

    // 🔧 FIX CRITIQUE: Forcer aggregation pour questions bénéfice/résultat annuel
    const questionLower = question.toLowerCase();
    const isBenefitQuestion = (questionLower.includes('bénéfice') || questionLower.includes('benef') ||
                               questionLower.includes('résultat') || questionLower.includes('profit') ||
                               questionLower.includes('gagné') || questionLower.includes('perdu')) &&
                              (/\d{4}|année|annuel/.test(questionLower));

    if (isBenefitQuestion) {
      console.log('🔧 DÉTECTION: Question bénéfice annuel → Force aggregation, exclut transactions');
      // Forcer aggregation
      if (!categories.includes('aggregation')) {
        categories.push('aggregation');
      }
      // Exclure transactions pour éviter get_period_transactions
      categories = categories.filter(c => c !== 'transactions');
    }

    // Sélection des outils selon les catégories
    if (categories.includes('invoices')) {
      selectedTools.push(...invoiceTools);
    }
    if (categories.includes('transactions')) {
      selectedTools.push(...transactionTools);
    }
    if (categories.includes('employees')) {
      selectedTools.push(...employeeTools);
    }
    if (categories.includes('suppliers')) {
      selectedTools.push(...supplierTools);
    }
    if (categories.includes('aggregation')) {
      selectedTools.push(...aggregationTools);
    }
    if (categories.includes('analytics')) {
      selectedTools.push(...analyticsTools);
    }
    if (categories.includes('users')) {
      selectedTools.push(...userTools);
    }

    // Si aucune catégorie sélectionnée, fallback vers tous les outils
    if (selectedTools.length <= systemTools.length) {
      console.warn('⚠️ Aucune catégorie sélectionnée, utilisation de tous les outils');
      return allTools;
    }

    // Dédupliquer les outils
    const uniqueTools = selectedTools.filter((tool, index, self) =>
      index === self.findIndex(t => t.function?.name === tool.function?.name)
    );

    console.log(`🎯 Outils sélectionnés: ${uniqueTools.length}/${allTools.length} (économie de ${Math.round((1 - uniqueTools.length / allTools.length) * 100)}%)`);

    return uniqueTools;
  }

  /**
   * 🔧 CORRECTION AUTO: Normalise les arguments des outils pour forcer period_text
   * Corrige les bugs où l'IA utilise year au lieu de period_text pour les années complètes
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- args viennent du JSON.parse de l'IA, structure dynamique
  private normalizeToolArguments(functionName: string, args: Record<string, any>, question: string): Record<string, any> {
    const questionLower = question.toLowerCase();

    // 🎯 CORRECTION CRITIQUE #1: Détection "entre X et Y" pour multi-mois (PRIORITAIRE)
    if ((functionName === 'get_employee_salaries' || functionName === 'compare_employee_salaries' ||
         functionName === 'get_supplier_payments' || functionName === 'compare_supplier_expenses' ||
         functionName === 'analyze_supplier_expenses')) {

      // 🔵 PRIORITÉ #0: CORRECTION IMPORTANT - Si month est présent, supprimer period_text/year s'ils ne sont PAS "année XXXX" explicite
      // L'IA ajoute parfois period_text="année 2025" même quand month="novembre" est spécifié
      if (args.month && (args.period_text || args.year)) {
        const periodText = args.period_text || args.year || '';
        // Vérifier si period_text contient "année XXXX" (format valide) ou non
        const isValidYearPeriod = periodText.match(/année\s+(\d{4})/i);
        if (!isValidYearPeriod) {
          // period_text ne contient pas "année XXXX", c'est une mauvaise détection de l'IA
          delete args.period_text;
          delete args.year;
          console.log(`🔧 CORRECTION AUTO: Suppression period_text/year car month="${args.month}" est prioritaire`);
        } else {
          // period_text contient "année XXXX" - vérifier si la question demande explicitement "année XXXX"
          const questionHasYearPhrase = questionLower.includes('année') && questionLower.includes(isValidYearPeriod[1]);
          if (!questionHasYearPhrase) {
            // La question ne mentionne PAS "année XXXX", utiliser month à la place
            delete args.period_text;
            delete args.year;
            console.log(`🔧 CORRECTION AUTO: Suppression period_text/year (${periodText}) car month="${args.month}" et question ne mentionne pas "année ${isValidYearPeriod[1]}"`);
          } else {
            // La question mentionne explicitement "année XXXX", utiliser period_text et supprimer month
            delete args.month;
            console.log(`🔧 CORRECTION AUTO: Suppression month="${args.month}" car question mentionne "année ${isValidYearPeriod[1]}"`);
          }
        }
      }

      // 🔵 PRIORITÉ #1: Détection "entre X et Y" pour périodes multi-mois
      if (questionLower.includes('entre') && questionLower.includes(' et ')) {
        const match = questionLower.match(/entre\s+(\w+)\s+et\s+(\w+)/i);
        const hasPeriodParam = args.period_text || args.year || args.month || args.start_month || args.end_month || args.start_date || args.end_date;
        if (match && !hasPeriodParam) {
          args.start_month = match[1];
          args.end_month = match[2];
          console.log(`🔧 CORRECTION AUTO: "entre ${match[1]} et ${match[2]}" → start_month/end_month`);
          return args; // Ne pas continuer les autres corrections
        }
      }

      // 🔵 PRIORITÉ #2: Détecter "année XXXX" si AUCUN paramètre de période n'est passé
      const yearMatch = questionLower.match(/année\s+(\d{4})/);
      const hasPeriodParam = args.period_text || args.year || args.month || args.start_month || args.end_month || args.start_date || args.end_date;

      if (yearMatch && !hasPeriodParam) {
        const year = yearMatch[1];
        args.period_text = `année ${year}`;
        console.log(`🔧 CORRECTION AUTO: Ajout period_text="année ${year}" (aucun paramètre de période détecté)`);
      }

      // 🔵 PRIORITÉ #3: year → period_text pour les années complètes
      if (args.year && !args.period_text) {
        const year = args.year;
        delete args.year; // Supprimer year
        args.period_text = `année ${year}`; // Forcer period_text
        console.log(`🔧 CORRECTION AUTO: year="${year}" → period_text="année ${year}"`);
      }
    }

    return args;
  }

  /**
   * 💡 Génère des suggestions contextuelles basées sur les outils utilisés
   * RETOURNE: { text: string, questions: string[] } - text contient les suggestions numérotées, questions contient les questions à exécuter
   */
  private generateContextualSuggestion(toolsUsed: string[], response: string): { text: string, questions: string[] } | null {
    console.log('🔍 generateContextualSuggestion appelé avec toolsUsed =', toolsUsed, 'length =', response.length);

    // Ne pas suggérer si la réponse est extrêmement longue (>5000 chars)
    if (response.length > 5000) {
      console.log('⚠️ Suggestion bloquée: réponse trop longue');
      return null;
    }

    // 🔧 EXTRAIRE: Nom du fournisseur depuis la réponse pour les rendre autonomes
    let supplierName: string | null = null;
    const supplierMatch = response.match(/🏪\s*Fournisseur\s*:\s*([^\n]+)/i);
    if (supplierMatch && supplierMatch[1]) {
      supplierName = supplierMatch[1].trim();
      console.log('🔍 Fournisseur extrait:', supplierName);
    }

    // Fonction helper pour remplacer "ce fournisseur" par le nom réel
    const makeQuestionAutonomous = (question: string): string => {
      if (supplierName) {
        return question.replace(/ce fournisseur/gi, supplierName);
      }
      return question;
    };

    // Map des suggestions avec les questions correspondantes
    const suggestionMap: { [key: string]: Array<{ text: string, question: string }> } = {
      'get_recent_invoices': [
        { text: 'Voir les factures impayées', question: 'Montre-moi les factures impayées' },
        { text: 'Voir les factures en retard', question: 'Montre-moi les factures en retard' },
        { text: 'Calculer le total des factures récentes', question: 'Quel est le total des factures récentes ?' },
        { text: 'Voir les factures du mois', question: 'Montre-moi les factures du mois' },
        { text: 'Voir les factures payées', question: 'Montre-moi les factures payées' },
      ],
      'get_supplier_invoices': [
        { text: 'Voir le total des dépenses', question: 'Quel est le total des dépenses avec ce fournisseur ?' },
        { text: 'Analyser l\'évolution des dépenses', question: 'Analyse l\'évolution des dépenses avec ce fournisseur sur les 12 derniers mois' },
        { text: 'Voir les factures impayées de ce fournisseur', question: 'Montre-moi les factures impayées de ce fournisseur' },
        { text: 'Voir les factures payées de ce fournisseur', question: 'Montre-moi les factures payées de ce fournisseur' },
        { text: 'Comparer avec un autre fournisseur', question: 'Compare les dépenses avec un autre fournisseur' },
      ],
      'get_latest_invoice': [
        { text: 'Voir les autres factures de ce fournisseur', question: 'Cherche toutes les factures du fournisseur ce fournisseur' },
        { text: 'Voir le total des dépenses', question: 'Quel est le total des dépenses avec ce fournisseur ?' },
        { text: 'Analyser l\'évolution des dépenses', question: 'Analyse l\'évolution des dépenses avec ce fournisseur' },
        { text: 'Voir les factures impayées de ce fournisseur', question: 'Montre-moi les factures impayées de ce fournisseur' },
        { text: 'Comparer avec un autre fournisseur', question: 'Compare ce fournisseur avec un autre' },
      ],
      'get_unpaid_invoices': [
        { text: 'Voir les factures en retard', question: 'Montre-moi les factures en retard' },
        { text: 'Calculer le total des impayés', question: 'Calcule le total des factures impayées' },
        { text: 'Voir les factures à échéance proche', question: 'Quelles factures arrivent à échéance bientôt ?' },
        { text: 'Voir les factures du mois', question: 'Montre-moi les factures impayées du mois' },
        { text: 'Analyser les dépenses par fournisseur', question: 'Analyse les dépenses par fournisseur' },
      ],
      'get_overdue_invoices': [
        { text: 'Calculer le total en retard', question: 'Calcule le total des factures en retard' },
        { text: 'Voir toutes les impayées', question: 'Montre-moi toutes les factures impayées' },
        { text: 'Voir les factures à échéance proche', question: 'Quelles factures arrivent à échéance bientôt ?' },
        { text: 'Voir les factures en retard du mois', question: 'Montre-moi les factures en retard du mois' },
        { text: 'Analyser l\'évolution des impayés', question: 'Analyse l\'évolution des factures impayées' },
      ],
      'analyze_supplier_trends': [
        { text: 'Voir le classement des fournisseurs', question: 'Quel est le classement des fournisseurs par dépenses ?' },
        { text: 'Comparer avec un autre fournisseur', question: 'Compare les dépenses avec un autre fournisseur' },
        { text: 'Voir les dépenses mensuelles', question: 'Montre-moi les dépenses mensuelles de ce fournisseur' },
        { text: 'Calculer la moyenne mensuelle', question: 'Quelle est la moyenne mensuelle des dépenses ?' },
        { text: 'Voir les factures de ce fournisseur', question: 'Montre-moi les factures de ce fournisseur' },
      ],
      'get_upcoming_due_invoices': [
        { text: 'Voir les factures en retard', question: 'Montre-moi les factures en retard' },
        { text: 'Calculer le total à payer', question: 'Calcule le total des factures à payer' },
        { text: 'Voir toutes les impayées', question: 'Montre-moi toutes les factures impayées' },
        { text: 'Analyser les échéances', question: 'Analyse les échéances des factures impayées' },
        { text: 'Voir les factures du mois', question: 'Montre-moi les factures impayées du mois' },
      ],
      'get_paid_invoices': [
        { text: 'Voir les factures impayées', question: 'Montre-moi les factures impayées' },
        { text: 'Calculer le total payé', question: 'Calcule le total des factures payées' },
        { text: 'Voir les factures du mois', question: 'Montre-moi les factures payées du mois' },
        { text: 'Analyser les paiements', question: 'Analyse les paiements par fournisseur' },
        { text: 'Voir les dernières factures payées', question: 'Montre-moi les dernières factures payées' },
      ],
      'get_monthly_balance': [
        { text: 'Voir le détail des transactions', question: 'Montre-moi le détail des transactions du mois' },
        { text: 'Comparer avec le mois précédent', question: 'Compare avec le mois précédent' },
        { text: 'Voir les statistiques du mois', question: 'Donne-moi les statistiques du mois' },
        { text: 'Analyser les dépenses', question: 'Analyse les dépenses du mois' },
        { text: 'Voir le solde bancaire', question: 'Quel est le solde bancaire actuel ?' },
      ],
      'get_monthly_stats': [
        { text: 'Voir le top 5 fournisseurs', question: 'Qui sont les top 5 fournisseurs du mois ?' },
        { text: 'Comparer avec le mois précédent', question: 'Compare les statistiques avec le mois précédent' },
        { text: 'Voir les factures impayées', question: 'Montre-moi les factures impayées du mois' },
        { text: 'Analyser les dépenses par catégorie', question: 'Analyse les dépenses par catégorie' },
        { text: 'Voir le résumé mensuel', question: 'Donne-moi un résumé du mois' },
      ],
      'get_supplier_ranking': [
        { text: 'Analyser un fournisseur spécifique', question: 'Analyse les dépenses de ce fournisseur' },
        { text: 'Comparer deux fournisseurs', question: 'Compare les dépenses entre ces deux fournisseurs' },
        { text: 'Voir les factures impayées', question: 'Montre-moi les factures impayées' },
        { text: 'Analyser les tendances', question: 'Analyse les tendances des dépenses' },
        { text: 'Voir le classement annuel', question: 'Quel est le classement des fournisseurs sur l\'année ?' },
      ],
      'get_year_summary': [
        { text: 'Voir le top 10 fournisseurs', question: 'Qui sont les top 10 fournisseurs de l\'année ?' },
        { text: 'Comparer avec l\'année précédente', question: 'Compare avec l\'année précédente' },
        { text: 'Voir les statistiques mensuelles', question: 'Montre-moi les statistiques de chaque mois' },
        { text: 'Analyser les tendances annuelles', question: 'Analyse les tendances sur l\'année' },
        { text: 'Voir les factures impayées', question: 'Montre-moi les factures impayées' },
      ],
      'compare_periods': [
        { text: 'Voir les détails de la première période', question: 'Montre-moi les détails de cette période' },
        { text: 'Analyser les dépenses', question: 'Analyse les dépenses par fournisseur' },
        { text: 'Comparer avec d\'autres périodes', question: 'Compare avec d\'autres périodes' },
        { text: 'Voir les factures impayées', question: 'Montre-moi les factures impayées' },
        { text: 'Obtenir un résumé annuel', question: 'Donne-moi le résumé de l\'année' },
      ],
      'detect_anomalies': [
        { text: 'Analyser les dépenses anormales', question: 'Analyse les dépenses par fournisseur' },
        { text: 'Voir les factures impayées', question: 'Montre-moi les factures impayées' },
        { text: 'Comparer les périodes', question: 'Compare les dépenses entre deux périodes' },
        { text: 'Analyser les tendances', question: 'Analyse les tendances des dépenses' },
        { text: 'Voir le top fournisseurs', question: 'Qui sont les top fournisseurs ?' },
      ],
      'predict_next_month': [
        { text: 'Analyser l\'historique', question: 'Analyse l\'historique des dépenses' },
        { text: 'Voir les tendances', question: 'Analyse les tendances des dépenses' },
        { text: 'Comparer avec le mois actuel', question: 'Compare avec les dépenses du mois actuel' },
        { text: 'Voir les factures impayées', question: 'Montre-moi les factures impayées' },
        { text: 'Obtenir un résumé mensuel', question: 'Donne-moi le résumé du mois' },
      ],
      'analyze_trends': [
        { text: 'Voir les prévisions', question: 'Prévois les dépenses du prochain mois' },
        { text: 'Comparer les périodes', question: 'Compare les dépenses entre deux périodes' },
        { text: 'Analyser par fournisseur', question: 'Analyse les dépenses par fournisseur' },
        { text: 'Voir les statistiques', question: 'Donne-moi les statistiques du mois' },
        { text: 'Détecter les anomalies', question: 'Détecte les dépenses anormales' },
      ],
      'get_employee_salaries': [
        { text: 'Voir le top 10 employés', question: 'Qui sont les 10 employés les mieux payés ?' },
        { text: 'Comparer deux employés', question: 'Compare les salaires de deux employés' },
        { text: 'Voir les salaires du mois', question: 'Montre-moi les salaires du mois' },
        { text: 'Analyser l\'évolution des salaires', question: 'Montre-moi les salaires employés des 3 derniers mois' },
        { text: 'Calculer le total des salaires', question: 'Calcule le total des salaires du mois' },
      ],
      'get_all_invoices': [
        { text: 'Voir les factures impayées', question: 'Montre-moi les factures impayées' },
        { text: 'Voir les factures en retard', question: 'Montre-moi les factures en retard' },
        { text: 'Voir les factures du mois', question: 'Montre-moi les factures du mois' },
        { text: 'Analyser par fournisseur', question: 'Analyse les dépenses par fournisseur' },
        { text: 'Voir les statistiques', question: 'Donne-moi les statistiques' },
      ],
      'get_bank_balances': [
        { text: 'Voir le solde du mois', question: 'Montre-moi le solde du mois' },
        { text: 'Voir les dernières transactions', question: 'Montre-moi les dernières transactions bancaires' },
        { text: 'Analyser les dépenses', question: 'Analyse les dépenses bancaires' },
        { text: 'Voir les factures impayées', question: 'Montre-moi les factures impayées' },
        { text: 'Comparer les périodes', question: 'Compare les soldes entre deux périodes' },
      ],
      'get_quarterly_report': [
        { text: 'Voir le rapport trimestriel détaillé', question: 'Donne-moi le rapport trimestriel détaillé' },
        { text: 'Comparer les trimestres', question: 'Compare les dépenses entre les trimestres' },
        { text: 'Voir le top fournisseurs du trimestre', question: 'Qui sont les top fournisseurs du trimestre ?' },
        { text: 'Analyser les tendances trimestrielles', question: 'Analyse les tendances trimestrielles' },
        { text: 'Voir le résumé annuel', question: 'Donne-moi le résumé de l\'année' },
      ],
      'export_to_csv': [
        { text: 'Voir les factures impayées', question: 'Montre-moi les factures impayées' },
        { text: 'Analyser les dépenses', question: 'Analyse les dépenses par fournisseur' },
        { text: 'Voir les statistiques du mois', question: 'Donne-moi les statistiques du mois' },
        { text: 'Exporter les transactions', question: 'Exporte les transactions en CSV' },
        { text: 'Voir les tendances', question: 'Analyse les tendances des dépenses' },
      ],
      'compare_supplier_expenses': [
        { text: 'Analyser un fournisseur spécifique', question: 'Analyse les dépenses de ce fournisseur' },
        { text: 'Voir le classement des fournisseurs', question: 'Quel est le classement des fournisseurs ?' },
        { text: 'Voir les factures impayées', question: 'Montre-moi les factures impayées' },
        { text: 'Analyser les tendances', question: 'Analyse les tendances des dépenses' },
        { text: 'Voir les statistiques', question: 'Donne-moi les statistiques' },
      ],
      'analyze_supplier_expenses': [
        { text: 'Voir le classement des fournisseurs', question: 'Quel est le classement des fournisseurs ?' },
        { text: 'Comparer avec un autre fournisseur', question: 'Compare les dépenses avec un autre fournisseur' },
        { text: 'Voir les factures impayées', question: 'Montre-moi les factures impayées' },
        { text: 'Analyser les tendances', question: 'Analyse les tendances des dépenses' },
        { text: 'Obtenir un résumé annuel', question: 'Donne-moi le résumé de l\'année' },
      ],
      'get_monthly_invoices': [
        { text: 'Voir les factures impayées', question: 'Montre-moi les factures impayées du mois' },
        { text: 'Voir les factures en retard', question: 'Montre-moi les factures en retard du mois' },
        { text: 'Analyser par fournisseur', question: 'Analyse les dépenses par fournisseur du mois' },
        { text: 'Comparer avec le mois précédent', question: 'Compare avec le mois précédent' },
        { text: 'Voir les statistiques du mois', question: 'Donne-moi les statistiques du mois' },
      ],
      'detect_supplier_patterns': [
        { text: 'Analyser un fournisseur spécifique', question: 'Analyse les dépenses de ce fournisseur' },
        { text: 'Voir le classement des fournisseurs', question: 'Quel est le classement des fournisseurs ?' },
        { text: 'Voir les factures impayées', question: 'Montre-moi les factures impayées' },
        { text: 'Analyser les tendances', question: 'Analyse les tendances des dépenses' },
        { text: 'Détecter les anomalies', question: 'Détecte les dépenses anormales' },
      ],
    };

    // Prendre TOUTES les suggestions du premier outil utilisé
    for (const tool of toolsUsed) {
      if (suggestionMap[tool]) {
        const suggestions = suggestionMap[tool];

        // 🆕 FORMATER: Créer le texte avec des suggestions numérotées (une par ligne, sans espacement)
        const suggestionLines = suggestions.map((s, index) => {
          return `${index + 1}. ${s.text} ?`;
        });
        const suggestionText = '💡 Suggestions :\n\n' + suggestionLines.join('\n') + '\n\nRépondez avec le numéro (1, 2...)';

        // 🆕 RENDRE LES QUESTIONS AUTONOMES: Remplacer "ce fournisseur" par le nom réel
        const questions = suggestions.map(s => makeQuestionAutonomous(s.question));

        return {
          text: suggestionText,
          questions: questions
        };
      }
    }

    // Pas de suggestion spécifique
    return null;
  }

  /**
   * Génère des boutons inline pour les suggestions contextuelles (NON UTILISÉ pour l'instant)
   */
  generateInlineButtons(toolsUsed: string[]): InlineButton[][] | null {
    console.log('🔍 generateInlineButtons appelé avec toolsUsed =', toolsUsed);

    // Map des suggestions avec les questions correspondantes
    const suggestionButtonsMap: { [key: string]: Array<{ text: string, question: string }> } = {
      'get_recent_invoices': [
        { text: '📋 Factures impayées', question: 'Montre-moi les factures impayées' },
        { text: '⚠️ Factures en retard', question: 'Quelles factures sont en retard ?' },
      ],
      'get_supplier_invoices': [
        { text: '💰 Total dépenses fournisseur', question: 'Quel est le total des dépenses avec ce fournisseur ?' },
        { text: '📈 Évolution dépenses', question: 'Analyse l\'évolution des dépenses avec ce fournisseur' },
      ],
      'get_latest_invoice': [
        { text: '📄 Autres factures fournisseur', question: 'Montre-moi les autres factures de ce fournisseur' },
        { text: '💰 Total dépenses fournisseur', question: 'Quel est le total des dépenses avec ce fournisseur ?' },
      ],
      'get_unpaid_invoices': [
        { text: '⚠️ Factures en retard', question: 'Montre-moi les factures en retard' },
        { text: '📆 Factures à échéance proche', question: 'Quelles factures arrivent à échéance bientôt ?' },
      ],
      'get_overdue_invoices': [
        { text: '💰 Total en retard', question: 'Calcule le total des factures en retard' },
        { text: '📋 Toutes les impayées', question: 'Montre-moi toutes les factures impayées' },
      ],
      'get_monthly_balance': [
        { text: '📊 Détail transactions', question: 'Montre-moi le détail des transactions du mois' },
        { text: '📈 Recettes vs Dépenses', question: 'Compare les recettes et les dépenses du mois' },
      ],
      'get_monthly_stats': [
        { text: '🏆 Top 5 fournisseurs', question: 'Qui sont les top 5 fournisseurs du mois ?' },
        { text: '📊 Comparaison mois précédent', question: 'Compare avec le mois précédent' },
      ],
    };

    // Prendre les boutons du premier outil utilisé
    for (const tool of toolsUsed) {
      if (suggestionButtonsMap[tool]) {
        const buttons = suggestionButtonsMap[tool];
        // Retourner format inline_keyboard pour Telegram
        return buttons.map(btn => [{ text: btn.text, callback_data: `suggestion:${btn.question}` }]);
      }
    }

    // Boutons par défaut
    const defaultButtons = [
      [{ text: '📋 Factures impayées', callback_data: 'suggestion:Montre-moi les factures impayées' }],
      [{ text: '📊 Statistiques du mois', callback_data: 'suggestion:Donne-moi les statistiques du mois' }],
    ];
    return defaultButtons;
  }

  /**
   * 💡 OPTIMISATION: Génère des hints dynamiques selon le contexte de la question
   * Améliore la précision en guidant l'IA avec des instructions contextuelles
   */
  private generateDynamicHints(question: string): string {
    const q = question.toLowerCase();
    const hints: string[] = [];

    // ⚠️ CRITIQUE: "du mois" sans spécifier le mois = mois actuel
    if ((q.includes('du mois') || q.includes('ce mois') || q.includes('le mois')) && !q.match(/janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre/i)) {
      const now = new Date();
      const currentMonthName = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'][now.getMonth()];
      hints.push(`⚠️⚠️⚠️ "DU MOIS" DÉTECTÉ: L'utilisateur parle du mois actuel (${currentMonthName} ${now.getFullYear()}). TOUJOURS ajouter month="${currentMonthName}". Exemple: {month: "${currentMonthName}"}`);
    }

    // ⚠️ CRITIQUE: Hints pour les périodes annuelles - FORCER period_text
    if (q.includes('année 202') || q.includes('de l\'année') || q.includes('sur l\'année')) {
      hints.push('⚠️⚠️⚠️ PÉRIODE ANNÉE DÉTECTÉE: TOUJOURS utiliser period_text="année 202X" (NE PAS utiliser year!). Exemple: {period_text: "année 2025"}');
    }

    // Hints pour les périodes multi-mois (entre X et Y)
    if (q.includes('entre') && q.includes(' et ')) {
      hints.push('⚠️ PÉRIODE MULTI-MOIS DÉTECTÉE: TOUJOURS utiliser start_month et end_month. Exemple: {start_month: "octobre", end_month: "décembre"}');
    }

    // Hints pour les questions de prédiction
    if (q.includes('prévision') || q.includes('prédi') || q.includes('prochaine') || q.includes('futur')) {
      hints.push('💡 PRÉDICTION DÉTECTÉE: Utilise predict_next_month pour des prévisions basées sur l\'historique. Affiche la fourchette de confiance et la tendance.');
    }

    // Hints pour les anomalies
    if (q.includes('anomalie') || q.includes('suspect') || q.includes('inhabituel') || q.includes('alerte')) {
      hints.push('💡 DÉTECTION ANOMALIES: Utilise detect_anomalies avec threshold_percent=50 par défaut. Explique pourquoi c\'est anormal.');
    }

    // Hints pour les tendances
    if (q.includes('tendance') || q.includes('évolution') || q.includes('croissance') || q.includes('augment') || q.includes('baisse')) {
      hints.push('💡 ANALYSE TENDANCES: Utilise analyze_trends pour calculer taux de croissance mensuel et annualisé. Inclus projection +3 mois.');
    }

    // Hints pour les comparaisons de périodes
    if ((q.includes('compar') || q.includes('vs') || q.includes('versus')) && (q.includes('mois') || q.includes('trimestre') || q.includes('année'))) {
      hints.push('💡 COMPARAISON PÉRIODES: Utilise compare_periods pour comparer 2 périodes personnalisées. Affiche variation en € et %.');
    }

    // Hints pour les résumés annuels et bénéfices
    if ((q.includes('résumé') || q.includes('bilan') || q.includes('rapport') || q.includes('bénéfice') || q.includes('benef') || q.includes('résultat') || q.includes('profit') || q.includes('perte')) && (q.includes('année') || q.includes('annuel') || /\d{4}/.test(q))) {
      hints.push('💡 RÉSUMÉ ANNUEL: Utilise get_year_summary avec top 10 fournisseurs et comparaison YoY. Explique clairement pour un novice : recettes = argent reçu, dépenses = argent dépensé, bénéfice = recettes - dépenses.');
    }

    // Hints pour les exports
    if (q.includes('export') || q.includes('csv') || q.includes('excel') || q.includes('télécharge')) {
      hints.push('💡 EXPORT DONNÉES: Utilise export_to_csv. Le fichier sera sauvegardé dans data/exports/ avec le chemin complet.');
    }

    // Hints pour les patterns récurrents
    if (q.includes('récurr') || q.includes('réguli') || q.includes('mensuel') || q.includes('hebdo')) {
      hints.push('💡 PATTERNS RÉCURRENTS: Utilise detect_supplier_patterns pour identifier paiements hebdo/mensuel avec anomalies >2σ.');
    }

    // Hints pour les top N
    if (q.match(/top\s*\d+|les\s*\d+\s*(meilleur|premier|plus)/)) {
      hints.push('💡 TOP N DÉTECTÉ: Limite à exactement N résultats. Si "top 10" → affiche 10, pas 72. Ne montre PAS la liste détaillée sauf demande explicite.');
    }

    // Hints pour les rankings
    if (q.includes('classement') || q.includes('position') || q.includes('se situe') || q.includes('rang')) {
      hints.push('💡 CLASSEMENT: Calcule la position par rapport aux autres. Affiche médiane et comparaison avec moyenne.');
    }

    if (hints.length === 0) {
      return ''; // Pas de hints spécifiques
    }

    return '\n\n' + hints.join('\n');
  }

  /**
   * Exécute une fonction et retourne des données structurées (JSON)
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- args viennent du JSON.parse de l'IA, structure dynamique
  private async executeFunction(functionName: string, args: Record<string, any>): Promise<string> {
    console.log(`🔧 Exécution: ${functionName}`, args);

    try {
      let result: ToolResult;

      // Dispatcher vers les executors modulaires
      const ctx: ExecutorContext = {
        billitClient: this.billitClient,
        bankClient: this.bankClient,
        commandHandler: this.commandHandler,
        chatId: this.chatId,
        telegramBot: this.telegramBot,
        currentQuestion: this.currentQuestion,
        alertService: this.alertService,
        onBeforeRestart: () => this.saveConversationState(),
      };

      const executorHelpers: ExecutorHelpers = {
        matchSupplierWithAI: (s) => this.matchSupplierWithAI(s),
        matchEmployeeWithAI: (s) => this.matchEmployeeWithAI(s),
        parsePeriodWithAI: (t) => this.parsePeriodWithAI(t),
        findClosestEmployee: (n) => this.findClosestEmployee(n),
        findSimilarEmployees: (n, m) => this.findSimilarEmployees(n, m),
        levenshteinDistance: (a, b) => this.levenshteinDistance(a, b),
        formatAmount: (a) => this.formatAmount(a),
        getTopSources: (t) => this.getTopSources(t),
        getTopExpenses: (t) => this.getTopExpenses(t),
      };

      // Essayer les executors modulaires d'abord
      const executors = [executeAnalyticsFunction, executeAdminFunction, executeInvoiceFunction, executeTransactionFunction, executeEmployeeFunction, executeSupplierFunction, executeMiscFunction];
      for (const executor of executors) {
        const executorResult = await executor(functionName, args, ctx, executorHelpers);
        if (executorResult !== null) {
          return executorResult;
        }
      }


      // Tous les cas sont gérés par les executors modulaires
      return JSON.stringify({ error: `Fonction inconnue: ${functionName}` });


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
        // Test 1: Ordre inversé de la recherche
        const reversedSearch = `${searchParts[1]} ${searchParts[0]}`;
        const reversedDistance = this.levenshteinDistance(reversedSearch, empNameLower);
        distance = Math.min(distance, reversedDistance);

        // Test 2: Si les noms correspondent mais dans l'ordre inverse (distance 0 pour l'ordre inversé)
        if (reversedDistance === 0) {
          // Correspondance parfaite avec ordre inversé - distance très faible
          distance = 1; // Distance minimale pour indiquer une correspondance
        }
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
    const searchParts = searchLower.split(' ');
    const matches: Array<{ employee: any; distance: number }> = [];

    for (const emp of employees) {
      const empNameLower = emp.name.toLowerCase();
      const nameParts = empNameLower.split(' ');

      // Calculer la distance pour le nom complet
      let distance = this.levenshteinDistance(searchLower, empNameLower);

      // Vérifier aussi si le terme de recherche correspond à une partie du nom
      for (const part of nameParts) {
        const partDistance = this.levenshteinDistance(searchLower, part);
        distance = Math.min(distance, partDistance);
      }

      // 🔄 NOUVEAU: Tester aussi l'ordre inversé (ex: "Mokhlis Jamhoun" → "Jamhoun Mokhlis")
      if (searchParts.length === 2 && nameParts.length === 2) {
        // Inverser l'ordre du nom recherché
        const reversedSearch = `${searchParts[1]} ${searchParts[0]}`;
        const reversedDistance = this.levenshteinDistance(reversedSearch, empNameLower);
        distance = Math.min(distance, reversedDistance);

        // Si correspondance parfaite avec ordre inversé, distance minimale
        if (reversedDistance === 0) {
          distance = 1;
        }
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
   * Extraire les entités importantes de la question et des arguments
   */
  private extractEntities(question: string, toolCalls: string[], functionArgs: any[]): string[] {
    const entities: Set<string> = new Set();

    // Extraire des arguments des fonctions
    for (const args of functionArgs) {
      if (args.supplier_name) entities.add(args.supplier_name);
      if (args.employee_name) entities.add(args.employee_name);
      if (args.month) entities.add(args.month);
      if (args.start_month) entities.add(args.start_month);
      if (args.end_month) entities.add(args.end_month);
      if (args.category) entities.add(args.category);
    }

    // Si aucune entité extraite des args, essayer d'extraire de la question
    if (entities.size === 0) {
      const questionLower = question.toLowerCase();

      // Extraire les mois
      const months = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
                     'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
      for (const month of months) {
        if (questionLower.includes(month)) {
          entities.add(month);
        }
      }

      // Extraire les fournisseurs courants (patterns communs)
      const commonSuppliers = ['foster', 'sligro', 'colruyt', 'delhaize', 'makro', 'metro',
                              'uber', 'takeaway', 'deliveroo', 'proximus', 'orange'];
      for (const supplier of commonSuppliers) {
        if (questionLower.includes(supplier)) {
          entities.add(supplier);
        }
      }
    }

    return Array.from(entities);
  }

  /**
   * Traite une question
   */
  async processQuestion(question: string, chatId?: string): Promise<string> {
    try {
      // Réinitialiser les outils appelés pour cette requête
      this.lastToolsCalled = [];

      // 🔧 FIX: Valider que la question n'est pas vide
      if (!question || question.trim() === '') {
        throw new Error('La question ne peut pas être vide');
      }

      // Stocker le chatId pour envoyer les PDFs
      if (chatId) {
        this.chatId = chatId;
      }

      // Utiliser chatId comme userId (ou fallback à "default")
      const userId = chatId || 'default';

      // NIVEAU 2: Détecter et résoudre les références contextuelles
      const userContext = this.conversationManager.getContext(userId);
      const contextResult = this.contextDetector.detect(question, userContext);

      if (contextResult.hasReference) {
        logInfo(
          `Référence contextuelle détectée (${contextResult.referenceType}): "${question}" → "${contextResult.enrichedQuestion}"`,
          'ai-agent-v2'
        );
        question = contextResult.enrichedQuestion;
      }

      // NIVEAU 2: Vérifier le cache sémantique
      // ⚠️ DÉSACTIVÉ : Le cache sémantique cause trop de faux positifs
      // (questions similaires retournent des réponses inadaptées, contexte ignoré)
      // const cachedResponse = await this.semanticCache.get(question, userId);
      // if (cachedResponse) {
      //   this.conversationManager.addUserMessage(userId, question);
      //   this.conversationManager.addAssistantMessage(userId, cachedResponse);
      //   return cachedResponse.replace(/\*\*/g, '');
      // }

      // Stocker la question actuelle pour la détection automatique de "liste"
      this.currentQuestion = question;

      console.log('🤖 Question V2:', question);

      // Tracker le temps de réponse pour les métriques de cache
      const startTime = Date.now();

      // 🔍 DÉTECTION SIMPLIFIÉE: Collecter des hints pour guider l'IA
      // SÉCURITÉ: Les hints sont séparés dans un message 'system' dédié
      // pour éviter que l'utilisateur puisse injecter des instructions via [HINT:]
      const systemHints: string[] = [];
      const questionLower = question.toLowerCase();

      // 🔍 DÉTECTION CRITIQUE: "toutes les factures" SANS mention de période
      const allInvoicesPattern = /(?:toutes?\s+les?\s+factures?|liste\s+(?:complète|toutes?\s+les?\s+)?factures?)/i;
      const hasPeriodMention = /(?:janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre|mois|année|trimestre|semaine)/i;
      
      if (allInvoicesPattern.test(question) && !hasPeriodMention.test(question)) {
        console.log('🔍 Détection: Toutes les factures sans période - ajout hint pour get_all_invoices');
        systemHints.push(`CRITIQUE - L'utilisateur demande TOUTES les factures SANS spécifier de période. Tu DOIS utiliser get_all_invoices (PAS get_monthly_invoices qui limite au mois courant). Retourne TOUTES les factures de toutes les périodes.`);
      }

      // 🔍 DÉTECTION PRIORITAIRE: "factures de [fournisseur]" (avec ou sans période)
      // Ex: "factures de Foster", "juste les factures de foster pour le mois de janvier"
      const supplierInvoicesPattern = /(?:juste\s+)?(?:les\s+)?factures?\s+(?:de|d'|du|chez)\s+([a-zàâäéèêëïîôùûüç\s-]+?)(?:\s+(?:pour|en|du|de|d')\s+(?:le\s+)?(?:mois\s+(?:de|d')\s+)?(\w+))?(?:\s|$|\.|\?)/i;
      const supplierMatch = supplierInvoicesPattern.exec(question);
      
      if (supplierMatch) {
        const supplier = supplierMatch[1].trim();
        const period = supplierMatch[2];
        
        // Vérifier que ce n'est pas un mot commun (pour éviter faux positifs)
        const commonWords = ['toutes', 'tous', 'les', 'des', 'la', 'le', 'une', 'un'];
        if (supplier.length >= 3 && !commonWords.includes(supplier.toLowerCase())) {
          if (period) {
            console.log(`🔍 Détection: Factures fournisseur + période ("${supplier}" + "${period}") - ajout hint pour get_supplier_invoices`);
            systemHints.push(`CRITIQUE - L'utilisateur demande les factures d'un FOURNISSEUR SPÉCIFIQUE pour un MOIS. Tu DOIS utiliser get_supplier_invoices avec supplier_name="${supplier}" et month="${period}". Cet outil retourne TOUTES les factures du fournisseur (payées ET impayées) pour la période demandée.`);
          } else {
            console.log(`🔍 Détection: Factures fournisseur ("${supplier}") - ajout hint pour get_supplier_invoices`);
            systemHints.push(`CRITIQUE - L'utilisateur demande les factures d'un FOURNISSEUR SPÉCIFIQUE. Tu DOIS utiliser get_supplier_invoices avec supplier_name="${supplier}". Cet outil retourne TOUTES les factures du fournisseur (toutes périodes).`);
          }
        }
      }
      
      // 🔍 DÉTECTION CRITIQUE: "factures [statut] [fournisseur] [période]"
      // Ex: "factures impayées de Ciers de décembre"
      else {
        const invoicesSupplierPeriodPattern = /factures?\s+(?:payées?|impayées?)\s+(?:de|d'|du|chez)\s+[a-zàâäéèêëïîôùûüç\s-]+\s+(?:de|du|d')\s*(?:mois\s+de\s+)?(\w+)/i;
        if (invoicesSupplierPeriodPattern.test(question)) {
          console.log('🔍 Détection: Factures [statut] [fournisseur] [période] - ajout hint pour get_supplier_invoices');
          systemHints.push(`CRITIQUE - L'utilisateur demande une LISTE de factures (pas une analyse) d'un fournisseur spécifique pour un mois donné. Tu DOIS utiliser get_supplier_invoices avec supplier_name et month. NE PAS utiliser analyze_supplier_expenses qui est pour les ANALYSES globales.`);
        } else {
          // Fallback: "factures du mois de X" (sans fournisseur spécifique)
          const invoicesByPeriodPattern = /factures?\s+(?:(?:payées?|impayées?)\s+)?(?:du|de|d')\s*(?:mois\s+de\s+)?(\w+)/i;
          if (invoicesByPeriodPattern.test(question) && hasPeriodMention.test(question)) {
            console.log('🔍 Détection: Factures d\'un mois spécifique - ajout hint pour get_invoices_by_month');
            systemHints.push(`CRITIQUE - L'utilisateur demande les factures d'un MOIS SPÉCIFIQUE (payées, impayées, ou les deux). Tu DOIS utiliser get_invoices_by_month avec le mois demandé (PAS get_recent_invoices, PAS get_unpaid_invoices). L'outil get_invoices_by_month retourne les factures payées ET impayées du mois demandé.`);
          }
        }
      }

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
        systemHints.push(`Cette question nécessite compare_employee_salaries, pas get_employee_salaries`);
      }

      // 🔍 DÉTECTION CRITIQUE: "analyse du salaire" ou "analyse des salaires"
      // L'IA peut confondre avec analyze_expenses_by_category
      const salaryAnalysisPattern = /analyse\s+(?:du\s+|des\s+)?salaire/i;
      if (salaryAnalysisPattern.test(question)) {
        console.log('🔍 Détection: Analyse des salaires - redirection vers get_employee_salaries');
        systemHints.push(`CRITIQUE - L'utilisateur demande une analyse des SALAIRES EMPLOYÉS. Tu DOIS utiliser get_employee_salaries (pas analyze_expenses_by_category). Retourner l'analyse détaillée avec total, nombre de paiements, et répartition par employé/mois.`);
      }

      // 🔍 Détection de plusieurs fournisseurs (ex: "Uber et Takeaway", "X et Y")
      // Détecter si la question contient "X et Y" pour les fournisseurs
      const multipleSuppliersInQuestion = /(?:facture|dépense|analyse|donne|montre|voir|liste).*?(\w+(?:\s+\w+)?)\s+et\s+(\w+(?:\s+\w+)?)/i;
      const multipleSuppliersMatch = question.match(multipleSuppliersInQuestion);
      if (multipleSuppliersMatch && !questionLower.includes('comparaison') && !questionLower.includes('compare')) {
        const supplier1 = multipleSuppliersMatch[1].trim();
        const supplier2 = multipleSuppliersMatch[2].trim();
        
        // 🔧 FIX: Exclure les mots courants (articles, prépositions)
        const commonWords = ['les', 'des', 'de', 'la', 'le', 'du', 'pour', 'par', 'sur', 'dans', 'avec', 'sans', 'toutes', 'tous'];
        const isValidSupplier = (word: string) => {
          const lower = word.toLowerCase();
          return word.length >= 3 && !commonWords.includes(lower);
        };
        
        if (isValidSupplier(supplier1) && isValidSupplier(supplier2)) {
          console.log(`🔍 Détection: Plusieurs fournisseurs demandés ("${supplier1}" et "${supplier2}") - hint pour l'IA`);
          systemHints.push(`CRITIQUE - L'utilisateur demande des informations sur PLUSIEURS fournisseurs: "${supplier1}" et "${supplier2}". Tu DOIS utiliser analyze_supplier_expenses avec supplier_name contenant TOUS les fournisseurs en une seule fois, séparés par " et ". Exemple: {supplier_name: "${supplier1} et ${supplier2}"}. NE PAS faire d'appels séparés.`);
        }
      }

      // Détection de période multi-mois (ex: "entre octobre et décembre")
      const multiMonthPattern = /entre\s+(\w+)\s+et\s+(\w+)/i;
      const multiMonthMatch = question.match(multiMonthPattern);
      if (multiMonthMatch && questionLower.includes('salaire')) {
        console.log('🔍 Détection: Période multi-mois - ajout d\'un hint pour l\'IA');
        systemHints.push(`L'utilisateur demande une période de plusieurs mois (${multiMonthMatch[1]} à ${multiMonthMatch[2]}). Utiliser get_employee_salaries avec start_month="${multiMonthMatch[1]}" et end_month="${multiMonthMatch[2]}" (NE PAS utiliser month=).`);
      }

      // 🔧 CORRECTION AUTO: "X derniers mois" → conversion en start_month/end_month
      // Ex: "3 derniers mois" → start_month="octobre", end_month="décembre" (si on est en janvier 2026)
      const lastMonthsPattern = /(\d+)\s*(derniers?|précédents?)\s+mois/i;
      const lastMonthsMatch = question.match(lastMonthsPattern);
      if (lastMonthsMatch) {
        const monthCount = parseInt(lastMonthsMatch[1], 10);
        if (monthCount > 0 && monthCount <= 12) {
          const monthNames = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
          const now = new Date();
          const currentYear = now.getFullYear();
          const currentMonth = now.getMonth(); // 0-11

          // Calculer les derniers mois COMPLETS (excluant le mois courant qui est potentiellement incomplet)
          // Pour "3 derniers mois" en janvier 2026: octobre, novembre, décembre 2025
          const endMonthIndex = currentMonth - 1; // Mois précédent (décembre si janvier)
          const startMonthIndex = endMonthIndex - (monthCount - 1);

          // Calculer l'année de début (peut être l'année précédente)
          let startYear = currentYear;
          if (startMonthIndex < 0) {
            startYear = currentYear - 1;
          }

          const startMonthName = monthNames[(startMonthIndex % 12 + 12) % 12];
          const endMonthName = monthNames[(endMonthIndex % 12 + 12) % 12];

          const targetFunction = questionLower.includes('salaire') ? 'get_employee_salaries' :
                                 (questionLower.includes('fournisseur') || questionLower.includes('dépense')) ? 'analyze_supplier_expenses' :
                                 'get_period_transactions';

          console.log(`🔍 Détection: ${monthCount} derniers mois → ${startMonthName} à ${endMonthName} ${startYear}`);
          systemHints.push(`L'utilisateur demande les ${monthCount} derniers mois complets. Utiliser ${targetFunction} avec start_month="${startMonthName}" et end_month="${endMonthName}".`);
        }
      }

      // Détection de "top X employés" ou "les X employés les mieux payés"
      const topEmployeesPattern = /(top\s*(\d+)\s+employ[eé]s|les?\s+(\d+)\s+employ[eé]s\s+(les\s+)?(mieux|plus)\s+pay[eé]s)/i;
      const topEmployeesMatch = question.match(topEmployeesPattern);
      if (topEmployeesMatch && !questionLower.includes('salaire')) {
        // Extraire le nombre (peut être dans le groupe 2 ou 3)
        const topNumber = topEmployeesMatch[2] || topEmployeesMatch[3];
        console.log(`🔍 Détection: Top ${topNumber} employés - ajout d'un hint pour l'IA`);
        systemHints.push(`L'utilisateur demande le top ${topNumber} des employés les mieux payés. Utiliser get_employee_salaries sans employee_name ni month pour obtenir le classement des salaires.`);
      }

      // Détection de "où se situe X" ou "position de X" ou "classement de X"
      const rankingPattern = /(où se situe|position de|classement de|rang de|se classe)\s+([a-zàâäçèéêëìîïòôöùûü\s]+)\s+(par rapport|parmi|dans)/i;
      const rankingMatch = question.match(rankingPattern);
      if (rankingMatch) {
        const employeeName = rankingMatch[2].trim();
        console.log(`🔍 Détection: Question de classement pour "${employeeName}" - ajout d'un hint pour l'IA`);
        systemHints.push(`L'utilisateur demande le classement de "${employeeName}" parmi tous les employés. Utiliser get_employee_salaries avec employee_name="${employeeName}" pour obtenir son classement.`);
      }

      // Détection de nom partiel court (possiblement une recherche partielle)
      // Ex: "lina" (4 chars), "hassan" (6 chars) sans contexte de phrase
      const singleWordPattern = /^[a-zàâäçèéêëìîïòôöùûü]{3,15}$/i;
      const isSingleShortName = singleWordPattern.test(question.trim());
      if (isSingleShortName) {
        console.log('🔍 Détection: Nom partiel court - ajout d\'un hint pour l\'IA');
        systemHints.push(`"${question.trim()}" semble être un nom partiel. Utiliser get_employee_salaries avec employee_name="${question.trim()}" pour trouver les employés correspondants.`);
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
        systemHints.push(`Cette question nécessite compare_supplier_expenses, pas compare_employee_salaries ou analyze_supplier_expenses. Les noms mentionnés sont des FOURNISSEURS.`);
      }

      // Détection de "top X fournisseurs" ou "les X fournisseurs les plus chers" (case-insensitive)
      const topSuppliersPattern = /(top\s*(\d+)\s+fournisseurs?|les?\s+(\d+)\s+fournisseurs?\s+(les\s+)?(plus|mieux|chers)?|top\s*(\d+).*fournisseurs?.*novembre|top\s*(\d+).*fournisseurs?.*décembre|top\s*(\d+).*fournisseurs?.*octobre)/i;
      const topSuppliersMatch = question.match(topSuppliersPattern);
      if (topSuppliersMatch) {
        const topNumber = topSuppliersMatch[2] || topSuppliersMatch[3] || topSuppliersMatch[6] || topSuppliersMatch[7] || topSuppliersMatch[8];
        console.log(`🔍 Détection: Top ${topNumber} fournisseurs - ajout d'un hint pour l'IA`);
        systemHints.push(`L'utilisateur demande le top ${topNumber} des fournisseurs par dépenses. Utiliser get_supplier_ranking avec limit=${topNumber} pour obtenir le classement. NE PAS utiliser analyze_supplier_expenses ni get_period_transactions.`);
      }

      // Détection de période multi-mois pour fournisseurs (ex: "dépenses entre octobre et décembre")
      if (multiMonthMatch && (questionLower.includes('fournisseur') || questionLower.includes('dépense') || questionLower.includes('dépenses'))) {
        console.log('🔍 Détection: Période multi-mois pour fournisseurs - ajout d\'un hint pour l\'IA');
        systemHints.push(`L'utilisateur demande une période de plusieurs mois (${multiMonthMatch[1]} à ${multiMonthMatch[2]}) pour les fournisseurs/dépenses. Utiliser analyze_supplier_expenses avec start_month="${multiMonthMatch[1]}" et end_month="${multiMonthMatch[2]}" (NE PAS utiliser month= ni get_period_transactions).`);
      }

      // Détection de "analyse dépenses fournisseurs"
      const analyzeExpensesPattern = /analyse.*(dépenses?|fournisseurs?)|dépenses?.*(analyse|fournisseurs?)/i;
      const analyzeExpensesMatch = question.match(analyzeExpensesPattern);
      if (analyzeExpensesMatch) {
        console.log('🔍 Détection: Analyse de dépenses fournisseurs - ajout d\'un hint pour l\'IA');
        systemHints.push(`L'utilisateur demande une analyse des dépenses fournisseurs. Utiliser analyze_supplier_expenses pour obtenir l'analyse complète avec statistiques.`);
      }

      // 🔍 DÉTECTION: Factures/dépenses par CATÉGORIE (nourriture, alimentation, etc.)
      // Ex: "factures de nourriture", "dépenses alimentation", "tout ce qui est nourriture"
      const categoryKeywords = {
        'nourriture|alimentation|food|alimentaire|restauration|restaurant|cuisine': 'alimentation',
        'énergie|électricité|gaz|eau|utility|utilities|heating|chauffage': 'utilities',
        'télécom|internet|téléphone|phone|mobile|gsm|connection': 'telecom',
        'assurance|insurance|couverture': 'assurance',
        'loyer|location|bureau|espace|local': 'loyers',
      };

      for (const [pattern, categoryName] of Object.entries(categoryKeywords)) {
        const regex = new RegExp(`(?:factures?|dépenses?|dépense|paiements?|achats?|tout ce qui est|donne|montre|voir|liste).*(?:${pattern})|(?:${pattern}).*(?:factures?|dépenses?|paiements?|achats?)`, 'i');
        if (regex.test(question) && !mentionsSuppliers && !questionLower.includes('compare')) {
          console.log(`🔍 Détection: Catégorie "${categoryName}" détectée - analyse de tous les fournisseurs de cette catégorie`);
          systemHints.push(`CRITIQUE - Catégorie "${categoryName}" détectée. L'utilisateur veut voir TOUS les fournisseurs de cette catégorie (pas un seul fournisseur). APPEL EXACT: analyze_supplier_expenses avec {category: "${categoryName}"} - NE PAS mettre supplier_name! Exemple JSON: {"category": "${categoryName}", "include_details": true}`);
          break;
        }
      }

      // ========== DÉTECTIONS POUR "X DERNIÈRES FACTURES" ==========
      // Détection de "X dernières factures", "les X dernières", "factures récentes", etc.
      // Ex: "les 3 dernières factures", "donne-moi les 5 dernières factures", "factures récentes"
      // Mapping des nombres en lettres vers chiffres
      const numberWords: { [key: string]: string } = {
        'une': '1', 'un': '1', 'deux': '2', 'trois': '3', 'quatre': '4', 'cinq': '5',
        'six': '6', 'sept': '7', 'huit': '8', 'neuf': '9', 'dix': '10'
      };

      // Chercher d'abord les chiffres, puis les mots
      let limit = '10';
      const digitMatch = question.match(/(\d+)\s+derni[èe]res?\s+factures|les?\s+(\d+)\s+derni[èe]res?/i);
      if (digitMatch) {
        limit = digitMatch[1] || digitMatch[2] || '10';
      } else {
        // Chercher les nombres en lettres avant "dernières factures"
        for (const [word, num] of Object.entries(numberWords)) {
          if (questionLower.includes(word + ' dernières') || questionLower.includes(word + ' derniere')) {
            limit = num;
            break;
          }
        }
      }

      const lastInvoicesPattern = /(\d+|\w+)\s+derni[èe]res?\s+factures|les?\s+(\d+|\w+)\s+derni[èe]res?|factures?\s+r[ée]centes?|derni[èe]res?\s+factures/i;
      const lastInvoicesMatch = question.match(lastInvoicesPattern);
      if (lastInvoicesMatch && !questionLower.includes('analyse') && !questionLower.includes('dépense')) {
        console.log(`🔍 Détection: ${limit} dernières factures demandées - ajout d'un hint pour l'IA`);
        systemHints.push(`CRITIQUE - L'utilisateur demande les ${limit} DERNIÈRES FACTURES (pas une analyse). Tu DOIS utiliser get_last_n_invoices avec limit=${limit}. NE PAS utiliser analyze_supplier_expenses ni get_period_transactions. Si un fournisseur est mentionné, l'ajouter au paramètre supplier_name.`);
      }

      // ========== DÉTECTION POUR "FACTURES [FOURNISSEUR]" ==========
      // ⚠️ SUPPRIMÉ: Les hints manuels sont remplacés par des règles claires dans le system prompt
      // L'IA comprend maintenant automatiquement:
      // - "factures Coca-Cola" → get_recent_invoices { supplier_name: "Coca-Cola" }
      // - "Est-ce que toutes les factures Uber ont été payées ?" → get_recent_invoices { supplier_name: "Uber" }
      // Voir section "RÈGLES DE SÉLECTION D'OUTILS - FACTURES" dans le system prompt

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
        systemHints.push(`L'utilisateur demande les balances de ${mentionedMonths.length} mois (${mentionedMonths.join(', ')}). Utiliser get_monthly_summaries avec la liste des mois mentionnés (format YYYY-MM). NE PAS utiliser get_period_transactions car l'utilisateur veut un résumé par mois sans liste détaillée des transactions.`);
      }

      // Détection de recettes multi-mois (ex: "recettes des 3 derniers mois", "recettes d'octobre et novembre")
      if (hasRevenuesKeyword && (hasMultipleMonths || questionLower.match(/\d+\s*(derniers?|précédents?)\s*mois/))) {
        console.log(`🔍 Détection: Recettes multi-mois - ajout d'un hint pour l'IA`);
        systemHints.push(`L'utilisateur demande les recettes de PLUSIEURS mois. Utiliser get_multi_month_revenues avec la liste des mois concernés (format YYYY-MM). NE PAS utiliser get_period_transactions.`);
      }

      // ========== DÉTECTION DE LA BALANCE ANNUELLE ==========
      // 🔧 CORRECTION CRITIQUE: Détection de demande de bénéfice, résultat pour une année complète
      // Patterns: "bénéfice de 2025", "résultat pour l'année 2025", "profit 2025"
      const benefitPattern = /(bénéfice|benefice|profit|résultat|gagné|perdu).*?(?:pour l'année\s+|de l'année\s+|de\s+|en\s+|réalisé en\s+)?(\d{4})/i;
      const benefitMatch = question.match(benefitPattern);
      if (benefitMatch && !hasMultipleMonths) {
        // Extraire l'année
        const year = benefitMatch[2];
        console.log(`🔍 Détection: Question BÉNÉFICE/RÉSULTAT pour ${year} - FORCE get_year_summary`);
        systemHints.push(`CRITIQUE - L'utilisateur demande le BÉNÉFICE/RÉSULTAT pour l'année ${year}. Tu DOIS utiliser get_year_summary avec year="${year}" et include_comparison=true. NE PAS utiliser get_period_transactions. La réponse doit inclure: Recettes, Dépenses, BÉNÉFICE NET = Recettes - Dépenses, Top 10 fournisseurs, Répartition par catégorie.`);
      }

      // ========== DÉTECTION DE LA DERNIÈRE TRANSACTION ==========
      // Détection de demande de la dernière transaction ou dernières transactions bancaires
      const lastTransactionPattern = /(?:dernière|dernier|le? derni[eè]re?|plus?[ -]r[eé]cente?).*?(?:transaction|paiement|op[eé]ration)|transaction.*?(?:derni[eè]re?|r[eé]cente?|effectu[ée]e?)/i;
      if (lastTransactionPattern.test(question) && !questionLower.includes('facture')) {
        console.log('🔍 Détection: Dernière transaction bancaire demandée - ajout d\'un hint pour l\'IA');
        systemHints.push(`CRITIQUE - L'utilisateur demande la dernière transaction bancaire (pas une facture, pas une balance). Tu DOIS utiliser get_period_transactions avec start_date=hier, end_date=aujourd'hui, limit=10, offset=1, sans filtre_type. Affiche SEULEMENT la première transaction (la plus récente) avec date, montant, description et type.`);
      }

      // ========== DÉTECTION DE LA PAGINATION ==========
      // Détecte quand l'utilisateur demande la page suivante des transactions
      const paginationPattern = /(suivantes|suite|continue|page suivante|autre page|ensuite|suivante)/i;
      if (paginationPattern.test(question)) {
        console.log('🔍 Détection: Demande de pagination');
        systemHints.push(`PAGINATION - L\'utilisateur veut la page SUIVANTE. Cherche le pattern "Page X/Y" dans ta dernière réponse. Utilise get_period_transactions avec offset: X+1. Garde les mêmes start_date et end_date.`);
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
          content: `Tu es un assistant financier expert. Tu as accès à 53 outils pour gérer factures, transactions, salaires, fournisseurs et analytics.

📅 CONTEXTE
Date: ${currentDate}
Mois en cours: ${currentMonth}

⚠️ RÈGLE #1 : ZÉRO HALLUCINATION
- TOUJOURS appeler un outil avant de répondre
- JAMAIS inventer de données, chiffres ou noms
- Si pas d'outil appelé → pas de réponse

🎯 RÈGLES DE SÉLECTION D'OUTILS

FACTURES:
- Fournisseur mentionné → get_recent_invoices {supplier_name}
  Ex: "factures Foster" → get_recent_invoices {supplier_name: "Foster"}
- "Toutes" + fournisseur → limit: 100
  Ex: "toutes factures Sligro" → get_recent_invoices {supplier_name: "Sligro", limit: 100}
- Mois spécifique → get_invoices_by_month {month}
  Ex: "factures janvier" → get_invoices_by_month {month: "janvier"}
- "Toutes" sans filtre → get_all_invoices {}
- Impayées → get_unpaid_invoices {}

SALAIRES/EMPLOYÉS:
- Nom employé → get_employee_salaries {employee_name}
- Comparaison → compare_employee_salaries
- Top X → get_employee_salaries sans employee_name

FOURNISSEURS/DÉPENSES:
- Analyse → analyze_supplier_expenses {supplier_name}
- Top X → get_supplier_ranking ou analyze_supplier_expenses
- Comparaison → compare_supplier_expenses

RÉPONSES:
- Concis (2-4 phrases) sauf listes explicites
- 2-3 émojis max
- Format naturel
- ⚠️ PAS de conclusions du type "Si vous avez besoin d'autres informations, n'hésitez pas à demander !"
- ⚠️ PAS de phrases de politesse inutiles ("Merci de votre question", etc.)
- ⚠️ TERMINER directement après les faits/informations, sans ajout de texte

💡 SUGGESTIONS CONTEXTUELLES (OBLIGATOIRE):
⚠️ À la fin de CHAQUE réponse, ajoute 1-2 suggestions pertinentes basées sur le contexte :
- Après réponse sur factures → "Voulez-vous voir les factures impayées ?"
- Après stats/balance → "Besoin de voir les détails des transactions ?"
- Après réponse sur un fournisseur → "Voulez-vous comparer avec un autre fournisseur ?"
- Après salaires → "Souhaitez-vous voir le top des employés ?"
- Format: "💡 Vous pouvez aussi : [suggestion]" ou directement la question

⚠️ NE PAS mettre de suggestions quand :
- L'utilisateur demande une action spécifique (ex: "montre-moi X")
- La réponse est déjà longue (liste)
- C'est une réponse rapide (bonjour, merci, ok)

📋 FORMAT OBLIGATOIRE POUR LES FACTURES:
⚠️ Quand tu affiches UNE facture (get_latest_invoice), TOUJOURS inclure ces champs:
- 🏪 Fournisseur
- 💰 Montant
- 📋 N° de facture
- 📅 Date
- ⏰ Date d'échéance (si disponible)
- 💬 Communication (si disponible)
- 📊 Statut

Exemple:
📄 Dernière facture reçue de Coca-Cola :
🏪 Fournisseur : Coca-Cola Europacific Partners Belgium SRL
💰 Montant : 1 432,35 €
📋 N° de facture : 9901356238
📅 Date : 21 janvier 2026
⏰ Date d'échéance : 20 février 2026
💬 Communication : [communication]
📊 Statut : À payer

📱 FORMATAGE TELEGRAM (CRITIQUE):
⚠️ JAMAIS d'espaces au début des lignes (cause problème largeur)
✅ Bon: "🏪 Fournisseur : Foster"
❌ Mauvais: "   🏪 Fournisseur : Foster"
- Commence toujours chaque ligne au début (colonne 0)
- Pas d'indentation, pas d'espaces avant les émojis
- Utilise des sauts de ligne pour structurer`,
        },
        // NIVEAU 2: Utiliser l'historique par utilisateur (avec résumé intelligent si disponible)
        ...this.conversationManager.getFormattedHistory(userId),
        // SÉCURITÉ: Hints séparés dans un message 'system' dédié (pas mélangés avec l'input utilisateur)
        ...(systemHints.length > 0 ? [{
          role: 'system' as const,
          content: `INSTRUCTIONS DE SÉLECTION D'OUTILS:\n${systemHints.join('\n')}`,
        }] : []),
        {
          role: 'user',
          content: question,
        },
      ];

      let iteration = 0;
      const MAX_ITERATIONS = 10;
      const toolCallsUsed: string[] = []; // Tracker les outils utilisés
      const allFunctionArgs: any[] = []; // Tracker tous les arguments pour extraction d'entités

      // 🎯 OPTIMISATION V2: Donner TOUS les outils à l'IA (GPT-4o-mini est excellent pour choisir)
      // L'appel de classification IA préalable ralentissait de ~500ms sans améliorer la précision
      const relevantTools = this.tools;

      while (iteration < MAX_ITERATIONS) {
        iteration++;
        console.log(`🔄 Itération ${iteration}...`);

        // Appeler soit OpenRouter soit Groq
        let response;
        if (this.aiProvider === 'openrouter' && this.openRouter) {
          response = await this.openRouter.chatCompletion({
            messages: messages as any,
            tools: relevantTools as any,
            tool_choice: 'auto',
            temperature: 0.3,
            max_tokens: 2000, // ⚡ Augmenté de 500 → 2000 pour listes complètes
          });
        } else if (this.groq) {
          response = await this.groq.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            messages: messages as any,
            tools: relevantTools as any,
            tool_choice: 'auto',
            temperature: 0.3,
            max_tokens: 2000, // ⚡ Augmenté de 500 → 2000 pour listes complètes
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
          let guideParts: string[] | null = null;

          // 🚀 OPTIM 7: Parallélisation des outils indépendants (gain +40% vitesse)
          if (message.tool_calls.length > 1) {
            console.log('⚡ OPTIM 7: Exécution parallèle de', message.tool_calls.length, 'outils');

            // Préparer tous les appels de fonctions en parallèle
            const toolPromises = message.tool_calls.map(async (toolCall) => {
              const functionName = toolCall.function.name;
              let functionArgs = JSON.parse(toolCall.function.arguments);

              // 🔧 CORRECTION AUTO: Normaliser les arguments
              functionArgs = this.normalizeToolArguments(functionName, functionArgs, question);

              const result = await this.executeFunction(functionName, functionArgs);
              console.log(`✓ ${functionName}:`, result.substring(0, 100) + '...');

              return {
                toolCall,
                functionName,
                functionArgs,
                result,
              };
            });

            // Exécuter tous les outils EN PARALLÈLE
            const toolResults = await Promise.all(toolPromises);

            // Traiter les résultats dans l'ordre
            for (const { toolCall, functionName, functionArgs, result } of toolResults) {
              toolCallsUsed.push(functionName);
              allFunctionArgs.push(functionArgs);

              // Vérifier direct_response ou guide_parts
              try {
                const parsedResult = JSON.parse(result);
                if (parsedResult.guide_parts && !guideParts) {
                  guideParts = parsedResult.guide_parts;
                  console.log(`📖 guide_parts détecté - ${guideParts!.length} parties`);
                } else if (parsedResult.direct_response && !directResponse) {
                  directResponse = parsedResult.direct_response;
                  console.log('📝 direct_response détecté - court-circuit IA');
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
          } else {
            // Exécution séquentielle pour un seul outil (comportement original)
            for (const toolCall of message.tool_calls) {
              const functionName = toolCall.function.name;
              let functionArgs = JSON.parse(toolCall.function.arguments);

              // 🔧 CORRECTION AUTO: Normaliser les arguments pour forcer period_text
              functionArgs = this.normalizeToolArguments(functionName, functionArgs, question);

              // Tracker le tool call et les arguments
              toolCallsUsed.push(functionName);
              allFunctionArgs.push(functionArgs);

              const result = await this.executeFunction(functionName, functionArgs);
              console.log(`✓ ${functionName}:`, result.substring(0, 100) + '...');

              // Vérifier si le résultat contient un direct_response ou guide_parts
              try {
                const parsedResult = JSON.parse(result);
                if (parsedResult.guide_parts && !guideParts) {
                  // Guide utilisateur à envoyer en plusieurs parties
                  guideParts = parsedResult.guide_parts;
                  console.log(`📖 guide_parts détecté - ${guideParts!.length} parties à envoyer`);
                } else if (parsedResult.direct_response && !directResponse) {
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
          }

          // Si on a des guide_parts, les envoyer directement à Telegram
          if (guideParts) {
            const summaryMessage = `📖 Envoi du guide utilisateur en ${guideParts.length} parties...`;
            this.conversationHistory.push(
              { role: 'user', content: question },
              { role: 'assistant', content: summaryMessage }
            );
            if (this.conversationHistory.length > this.MAX_HISTORY) {
              this.conversationHistory = this.conversationHistory.slice(-this.MAX_HISTORY);
            }
            this.saveConversationState();

            // Envoyer chaque partie du guide à Telegram
            for (let i = 0; i < guideParts.length; i++) {
              await this.telegramBot!.sendMessage(this.chatId!, guideParts[i]);
              if (i < guideParts.length - 1) {
                // Attendre 500ms entre les parties pour éviter le rate limiting
                await new Promise(resolve => setTimeout(resolve, 500));
              }
            }

            // Sauvegarder les outils appelés pour le benchmark
            this.lastToolsCalled = [...toolCallsUsed];

            return summaryMessage;
          }

          // Si on a un direct_response, le retourner immédiatement
          if (directResponse) {
            console.log('🚪 SORTIE: direct_response détecté, retour de la réponse sans nouvelle itération');
            this.conversationHistory.push(
              { role: 'user', content: question },
              { role: 'assistant', content: directResponse }
            );
            if (this.conversationHistory.length > this.MAX_HISTORY) {
              this.conversationHistory = this.conversationHistory.slice(-this.MAX_HISTORY);
            }
            this.saveConversationState();

            // NIVEAU 2: Sauvegarder dans le nouveau système de conversation (avec métadonnées)
            const responseTime = Date.now() - startTime;
            const entities = this.extractEntities(this.currentQuestion, toolCallsUsed, allFunctionArgs);
            const intent = toolCallsUsed.length > 0 ? toolCallsUsed[0] : undefined;

            this.conversationManager.addUserMessage(userId, this.currentQuestion, {
              intent,
              entities,
            });
            this.conversationManager.addAssistantMessage(userId, directResponse, {
              toolCalls: toolCallsUsed,
              responseTime
            });

            // NIVEAU 2: Mettre en cache la réponse
            // ⚠️ DÉSACTIVÉ : Cache sémantique désactivé (faux positifs)
            // this.semanticCache.set(
            //   this.currentQuestion,
            //   directResponse,
            //   userId,
            //   {
            //     responseTime,
            //     toolsUsed: toolCallsUsed
            //   }
            // );

            // Sauvegarder les outils appelés pour le benchmark
            this.lastToolsCalled = [...toolCallsUsed];

            // 🔧 AJOUT: Générer et ajouter des suggestions contextuelles
            const suggestion = this.generateContextualSuggestion(toolCallsUsed, directResponse);

            // 🔧 CORRECTION: Nettoyer la réponse IA - supprimer les conclusions et anciennes suggestions
            let cleanedResponse = directResponse;
            const unwantedPatterns = [
              /Si vous avez besoin d'autres informations[^!]*!\s*/gi,
              /n'hésitez pas à demander[^!]*!\s*/gi,
              /💡 Vous pouvez aussi :[^«"\n]*[«"\n]/gi,
              /Voulez-vous voir [^«"\n]*[«"\?]\s*/gi,
            ];
            unwantedPatterns.forEach(pattern => {
              cleanedResponse = cleanedResponse.replace(pattern, '');
            });
            cleanedResponse = cleanedResponse.trim();

            // 🆕 MARQUEUR SPECIAL pour indiquer qu'il ne faut PAS utiliser le streaming
            const responseWithSuggestion = suggestion
              ? cleanedResponse + '\n\n' + suggestion.text + '[[NO_STREAMING]]'
              : cleanedResponse;

            // Stocker les questions de suggestion pour utilisation avec les numéros (1, 2, 3...)
            if (suggestion) {
              this.lastSuggestionQuestions = suggestion.questions;
            } else {
              this.lastSuggestionQuestions = null;
            }

            // Supprimer tous les ** du texte
            const finalResponse = responseWithSuggestion.replace(/\*\*/g, '');
            console.log('✅ RETOUR: réponse finale retournée, longueur =', finalResponse.length);
            return finalResponse;
          }

          continue;
        }

        if (!message.tool_calls || message.tool_calls.length === 0) {
          // Aucun tool_call - devrait y avoir message.content
          if (!message.content) {
            console.error('⚠️ L\'IA n\'a ni appelé d\'outil ni généré de réponse textuelle');
            console.error('Message reçu:', JSON.stringify(message, null, 2).substring(0, 500));
            break;
          }
        }

        if (message.content) {
          console.log('✅ Réponse finale générée');
          // Sauvegarder l'échange dans l'historique (ancien système)
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

          // NIVEAU 2: Calculer le temps de réponse
          const responseTime = Date.now() - startTime;

          // NIVEAU 2: Sauvegarder dans le nouveau système de conversation par utilisateur
          // Extraire les entités et l'intent
          const entities = this.extractEntities(this.currentQuestion, toolCallsUsed, allFunctionArgs);
          const intent = toolCallsUsed.length > 0 ? toolCallsUsed[0] : undefined;

          this.conversationManager.addUserMessage(userId, this.currentQuestion, {
            intent,
            entities,
          });
          this.conversationManager.addAssistantMessage(userId, message.content, {
            toolCalls: toolCallsUsed,
            responseTime
          });

          // NIVEAU 2: Mettre en cache la réponse
          // ⚠️ DÉSACTIVÉ : Cache sémantique désactivé (faux positifs)
          // this.semanticCache.set(
          //   this.currentQuestion,
          //   message.content,
          //   userId,
          //   {
          //     responseTime,
          //     toolsUsed: []
          //   }
          // );

          // Sauvegarder les outils appelés pour le benchmark
          this.lastToolsCalled = [...toolCallsUsed];

          // 🔧 CORRECTION: Nettoyer la réponse IA - supprimer les conclusions et anciennes suggestions
          let cleanedResponse = message.content;
          const unwantedPatterns = [
            /Si vous avez besoin d'autres informations[^!]*!\s*/gi,
            /n'hésitez pas à demander[^!]*!\s*/gi,
            /💡 Vous pouvez aussi :[^«"\n]*[«"\n]/gi,
            /Voulez-vous voir [^«"\n]*[«"\?]\s*/gi,
          ];
          unwantedPatterns.forEach(pattern => {
            cleanedResponse = cleanedResponse.replace(pattern, '');
          });
          cleanedResponse = cleanedResponse.trim();

          // Ajouter une suggestion contextuelle si pertinente
          const suggestion = this.generateContextualSuggestion(toolCallsUsed, cleanedResponse);

          // 🆕 MARQUEUR SPECIAL pour indiquer qu'il ne faut PAS utiliser le streaming
          const responseWithSuggestion = suggestion
            ? cleanedResponse + '\n\n' + suggestion.text + '[[NO_STREAMING]]'
            : cleanedResponse;

          // Stocker les questions de suggestion pour utilisation avec les numéros (1, 2, 3...)
          if (suggestion) {
            this.lastSuggestionQuestions = suggestion.questions;
          } else {
            this.lastSuggestionQuestions = null;
          }

          // Supprimer tous les ** du texte
          return responseWithSuggestion.replace(/\*\*/g, '');
        }

        break;
      }

      // Plus d'informations dans le message d'erreur
      console.error('❌ Échec de la génération de réponse après', MAX_ITERATIONS, 'tentatives');
      const errorMsg = '❌ Je n\'ai pas pu traiter votre demande.\n\n💡 Essayez de reformuler votre question ou d\'être plus précis.\n\nExemples :\n• "montant total payé à Foster"\n• "factures impayées"\n• "solde bancaire"';

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

  /**
   * Retourne les dernières suggestions contextuelles (tableau de questions)
   * Utilisé pour les réponses numériques de l'utilisateur (1, 2, 3...)
   */
  public getLastSuggestion(): string[] | null {
    return this.lastSuggestionQuestions;
  }

  /**
   * Nettoie les dernières suggestions (après utilisation ou nouvelle question)
   */
  public clearLastSuggestion(): void {
    this.lastSuggestionQuestions = null;
  }

  isConfigured(): boolean {
    return !!config.groq.apiKey && config.groq.apiKey.length > 0;
  }
}
