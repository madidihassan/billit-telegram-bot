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
import {
  analyzeSupplierTrends,
  getSupplierRanking,
  detectSupplierPatterns
} from './ai-agent/implementations/supplier-analytics';
import {
  getYearSummary,
  comparePeriods,
  getQuarterlyReport
} from './ai-agent/implementations/aggregation-analytics';
import {
  predictNextMonth,
  detectAnomalies,
  analyzeTrends,
  exportToCSV
} from './ai-agent/implementations/predictive-analytics';
import { aiMatchSupplier, aiMatchEmployee, aiParsePeriod } from './services/ai-helpers';

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
  public lastToolsCalled: string[] = []; // Outils appelés lors de la dernière requête (pour benchmark)

  // NIVEAU 2: Nouveau système de conversation intelligent
  private conversationManager: ConversationManager;
  private contextDetector: ContextDetector;
  private semanticCache: SemanticCache;
  private alertService: AlertService; // 🚀 OUTIL 10: Système d'alertes

  // ANCIEN SYSTÈME (conservé temporairement pour compatibilité)
  private conversationHistory: Array<{ role: string; content: string }> = [];
  private readonly MAX_HISTORY = 20;
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
      let aiClient: any;
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
  private normalizeToolArguments(functionName: string, args: any, question: string): any {
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
   * 💡 OPTIMISATION: Génère des hints dynamiques selon le contexte de la question
   * Améliore la précision en guidant l'IA avec des instructions contextuelles
   */
  private generateDynamicHints(question: string): string {
    const q = question.toLowerCase();
    const hints: string[] = [];

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
  private async executeFunction(functionName: string, args: any): Promise<string> {
    console.log(`🔧 Exécution: ${functionName}`, args);

    try {
      let result: any;

      switch (functionName) {
        case 'get_unpaid_invoices': {
          const invoices = await this.billitClient.getUnpaidInvoices();
          const total = invoices.reduce((sum, inv) => sum + inv.total_amount, 0);

          // Calculer les jours de retard pour chaque facture
          const now = new Date();
          const invoicesWithDetails = invoices.map(inv => {
            const dueDate = inv.due_date ? new Date(inv.due_date) : null;

            // Comparer UNIQUEMENT les dates (sans les heures)
            // Une facture échéance 23 janvier n'est en retard que le 24 janvier
            let daysOverdue = 0;
            let isOverdue = false;

            if (dueDate) {
              const nowDateOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());
              const dueDateOnly = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
              daysOverdue = Math.floor((nowDateOnly.getTime() - dueDateOnly.getTime()) / (1000 * 60 * 60 * 24));
              isOverdue = daysOverdue >= 1; // En retard seulement si au moins 1 jour complet écoulé
            }

            // Traduire le statut
            let statusLabel = 'A payer';
            if (inv.status === 'Paid' || inv.status === 'paid') {
              statusLabel = 'Payée';
            } else if (inv.status === 'DirectDebit' || inv.status === 'domiciliation') {
              statusLabel = 'Domiciliation';
            }

            return {
              supplier: inv.supplier_name,
              amount: inv.total_amount,
              invoice_number: inv.invoice_number,
              invoice_date: inv.invoice_date,
              due_date: inv.due_date,
              communication: inv.communication || 'N/A',
              status: statusLabel,
              days_overdue: daysOverdue > 0 ? daysOverdue : 0,
              is_overdue: isOverdue,
            };
          });

          result = {
            count: invoices.length,
            total_amount: total,
            currency: 'EUR',
            invoices: invoicesWithDetails,
          };
          break;
        }

        case 'get_paid_invoices': {
          // 🔧 FIX: Pagination complète
          console.log('🔄 Récupération de TOUTES les factures (pagination)...');
          let allInvoices: any[] = [];
          let skip = 0;
          const pageSize = 120;

          while (true) {
            const batch = await this.billitClient.getInvoices({
              limit: pageSize,
              skip: skip
            });
            allInvoices = allInvoices.concat(batch);
            if (batch.length < pageSize) break;
            skip += pageSize;
          }
          console.log(`✓ ${allInvoices.length} facture(s) récupérées`);
          const invoices = allInvoices.filter(inv =>
            inv.status.toLowerCase().includes('paid') || inv.status.toLowerCase().includes('payé')
          );
          const total = invoices.reduce((sum, inv) => sum + inv.total_amount, 0);

          // Pagination : 5 factures par page
          const page = (args.page as number) || 1;
          const perPage = 5;
          const startIndex = (page - 1) * perPage;
          const endIndex = startIndex + perPage;
          const totalPages = Math.ceil(invoices.length / perPage);

          // Enrichir avec tous les détails (comme pour impayées)
          const invoicesWithDetails = invoices.slice(startIndex, endIndex).map(inv => ({
            supplier: inv.supplier_name,
            amount: inv.total_amount,
            invoice_number: inv.invoice_number,
            invoice_date: inv.invoice_date,
            due_date: inv.due_date,
            communication: inv.communication || 'N/A',
            status: 'Payée',
          }));

          result = {
            count: invoices.length,
            total_amount: total,
            currency: 'EUR',
            invoices: invoicesWithDetails,
            page: page,
            total_pages: totalPages,
            has_more: page < totalPages,
          };
          break;
        }

        case 'get_latest_invoice': {
          try {
            // 🔧 FIX: Pagination complète
            console.log('🔄 Récupération de TOUTES les factures (pagination)...');
            let allInvoices: any[] = [];
            let skip = 0;
            const pageSize = 120;
            
            while (true) {
              const batch = await this.billitClient.getInvoices({ 
                limit: pageSize,
                skip: skip
              });
              allInvoices = allInvoices.concat(batch);
              if (batch.length < pageSize) break;
              skip += pageSize;
            }
            console.log(`✓ ${allInvoices.length} facture(s) récupérées`);

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
            const supplierName = args.supplier_name as string | undefined;

            // 🔧 FIX BUG #23: Pagination complète pour récupérer toutes les factures
            let allInvoices: any[] = [];
            let skip = 0;
            const pageSize = 120; // Limite API Billit
            
            // Activer la pagination si :
            // 1. limit > 120 (on demande beaucoup de factures)
            // 2. limit >= 50 (seuil pour activer la pagination systématique)
            const needPagination = limit >= 50;

            if (needPagination) {
              console.log(`🔄 Pagination complète activée (limit: ${limit})${supplierName ? ` avec filtrage par "${supplierName}"` : ''}`);
              let hasMore = true;
              // Si filtrage fournisseur : récupérer BEAUCOUP plus de factures pour avoir assez après filtrage
              // Sinon : récupérer juste le nombre demandé
              const maxPages = supplierName ? 20 : Math.ceil(limit / pageSize) + 1;
              let pageCount = 0;
              
              while (hasMore && pageCount < maxPages) {
                const page = await this.billitClient.getInvoices({ limit: pageSize, skip });
                if (page.length === 0) break;
                allInvoices.push(...page);
                skip += pageSize;
                hasMore = page.length === pageSize;
                pageCount++;
                
                // Si filtrage fournisseur : continuer jusqu'à avoir assez de résultats
                if (supplierName) {
                  const { matchesSupplier: tempMatch } = await import('./supplier-aliases');
                  const currentFiltered = allInvoices.filter(inv => tempMatch(inv.supplier_name, supplierName));
                  if (currentFiltered.length >= limit) {
                    console.log(`✅ Assez de factures pour "${supplierName}" après ${pageCount} pages`);
                    break;
                  }
                }
              }
              console.log(`📊 ${allInvoices.length} factures récupérées via pagination (${pageCount} pages)`);
            } else {
              // Cas simple : limit < 50
              allInvoices = await this.billitClient.getInvoices({ limit: pageSize });
            }

            if (!allInvoices || allInvoices.length === 0) {
              result = {
                success: false,
                message: 'Aucune facture trouvée',
              };
              break;
            }

            console.log(`📊 get_recent_invoices: ${allInvoices.length} factures récupérées, demande de ${limit}${supplierName ? ` pour ${supplierName}` : ''}`);

            // Filtrer par fournisseur si spécifié
            let filteredInvoices = allInvoices;
            if (supplierName) {
              const { matchesSupplier } = await import('./supplier-aliases');
              filteredInvoices = allInvoices.filter(inv => matchesSupplier(inv.supplier_name, supplierName));
              console.log(`🔍 Filtrage par fournisseur "${supplierName}": ${filteredInvoices.length} factures trouvées`);
            }

            // Filtrer les factures avec une date valide et trier par date (la plus récente en premier)
            const sortedInvoices = filteredInvoices
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

          // Enrichir avec dates et jours de retard
          const now = new Date();
          const invoicesWithDetails = invoices.map(inv => {
            const dueDate = new Date(inv.due_date);

            // Comparer UNIQUEMENT les dates (sans les heures)
            const nowDateOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const dueDateOnly = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
            const daysOverdue = Math.floor((nowDateOnly.getTime() - dueDateOnly.getTime()) / (1000 * 60 * 60 * 24));

            // Traduire le statut
            let statusLabel = 'A payer (EN RETARD)';
            if (inv.status === 'Paid' || inv.status === 'paid') {
              statusLabel = 'Payée';
            } else if (inv.status === 'DirectDebit' || inv.status === 'domiciliation') {
              statusLabel = 'Domiciliation (EN RETARD)';
            }

            return {
              supplier: inv.supplier_name,
              amount: inv.total_amount,
              invoice_number: inv.invoice_number,
              invoice_date: inv.invoice_date,
              due_date: inv.due_date,
              communication: inv.communication || 'N/A',
              status: statusLabel,
              days_overdue: daysOverdue,
            };
          });

          result = {
            count: invoices.length,
            total_amount: total,
            currency: 'EUR',
            invoices: invoicesWithDetails,
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
          const monthMap: { [key: string]: number } = {
            'janvier': 0, 'fevrier': 1, 'février': 1, 'mars': 2, 'avril': 3,
            'mai': 4, 'juin': 5, 'juillet': 6, 'aout': 7, 'août': 7,
            'septembre': 8, 'octobre': 9, 'novembre': 10, 'decembre': 11, 'décembre': 11,
          };

          let targetMonth: number;
          let targetYear: number;

          if (args.month) {
            const monthInput = args.month.toLowerCase();
            if (monthMap[monthInput] !== undefined) {
              targetMonth = monthMap[monthInput];
            } else if (!isNaN(parseInt(monthInput))) {
              targetMonth = parseInt(monthInput) - 1;
            } else {
              return JSON.stringify({ error: `Mois invalide: ${args.month}` });
            }

            // Si aucune année spécifiée, déduire intelligemment l'année
            if (args.year) {
              targetYear = parseInt(args.year);
            } else {
              const now = new Date();
              const currentYear = now.getFullYear();
              const currentMonth = now.getMonth();

              // Si le mois demandé est dans le futur, utiliser l'année précédente
              if (targetMonth > currentMonth) {
                targetYear = currentYear - 1;
              } else {
                targetYear = currentYear;
              }
            }
          } else {
            const now = new Date();
            targetMonth = now.getMonth();
            targetYear = now.getFullYear();
          }

          const startDate = new Date(targetYear, targetMonth, 1);
          const endDate = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59);

          const transactions = await this.bankClient.getTransactionsByPeriod(startDate, endDate);
          const credits = transactions.filter(tx => tx.type === 'Credit');
          const debits = transactions.filter(tx => tx.type === 'Debit');
          const totalCredits = credits.reduce((sum, tx) => sum + tx.amount, 0);
          const totalDebits = debits.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
          const balance = totalCredits - totalDebits;

          result = {
            month: startDate.toLocaleDateString('fr-BE', { month: 'long', year: 'numeric' }),
            credits: totalCredits,
            debits: totalDebits,
            balance: balance,
            credit_count: credits.length,
            debit_count: debits.length,
            currency: 'EUR',
          };
          break;
        }

        case 'get_monthly_credits': {
          // ✅ CORRECTION: Utiliser les paramètres month/year transmis par l'IA
          const monthMap: { [key: string]: number } = {
            'janvier': 0, 'fevrier': 1, 'février': 1, 'mars': 2, 'avril': 3,
            'mai': 4, 'juin': 5, 'juillet': 6, 'aout': 7, 'août': 7,
            'septembre': 8, 'octobre': 9, 'novembre': 10, 'decembre': 11, 'décembre': 11,
          };

          let targetMonth: number;
          let targetYear: number;

          if (args.month) {
            const monthInput = args.month.toLowerCase();
            if (monthMap[monthInput] !== undefined) {
              targetMonth = monthMap[monthInput];
            } else if (!isNaN(parseInt(monthInput))) {
              targetMonth = parseInt(monthInput) - 1;
            } else {
              return JSON.stringify({ error: `Mois invalide: ${args.month}` });
            }

            targetYear = args.year ? parseInt(args.year) : new Date().getFullYear();
          } else {
            const now = new Date();
            targetMonth = now.getMonth();
            targetYear = now.getFullYear();
          }

          const startDate = new Date(targetYear, targetMonth, 1);
          const endDate = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59);

          const monthCredits = await this.bankClient.getCredits(startDate, endDate);
          const total = monthCredits.reduce((sum, tx) => sum + tx.amount, 0);

          result = {
            month: startDate.toLocaleDateString('fr-BE', { month: 'long', year: 'numeric' }),
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
          // ✅ CORRECTION: Utiliser les paramètres month/year transmis par l'IA
          const monthMap: { [key: string]: number } = {
            'janvier': 0, 'fevrier': 1, 'février': 1, 'mars': 2, 'avril': 3,
            'mai': 4, 'juin': 5, 'juillet': 6, 'aout': 7, 'août': 7,
            'septembre': 8, 'octobre': 9, 'novembre': 10, 'decembre': 11, 'décembre': 11,
          };

          let targetMonth: number;
          let targetYear: number;

          if (args.month) {
            const monthInput = args.month.toLowerCase();
            if (monthMap[monthInput] !== undefined) {
              targetMonth = monthMap[monthInput];
            } else if (!isNaN(parseInt(monthInput))) {
              targetMonth = parseInt(monthInput) - 1;
            } else {
              return JSON.stringify({ error: `Mois invalide: ${args.month}` });
            }

            targetYear = args.year ? parseInt(args.year) : new Date().getFullYear();
          } else {
            const now = new Date();
            targetMonth = now.getMonth();
            targetYear = now.getFullYear();
          }

          const startDate = new Date(targetYear, targetMonth, 1);
          const endDate = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59);

          const monthDebits = await this.bankClient.getDebits(startDate, endDate);
          const total = monthDebits.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

          result = {
            month: startDate.toLocaleDateString('fr-BE', { month: 'long', year: 'numeric' }),
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

          const accounts = [];
          let total = 0;

          // Récupérer le solde réel pour chaque compte depuis l'API Billit
          for (const account of Object.values(balances.accounts)) {
            // Essayer de récupérer le solde réel depuis l'API Billit
            const realTimeBalance = await this.bankClient.getRealTimeBalance(account.iban);
            const finalBalance = realTimeBalance !== null ? realTimeBalance : account.balance;

            accounts.push({
              name: account.name,
              iban: account.iban,
              balance: finalBalance,
              last_update: account.lastUpdate,
              source: realTimeBalance !== null ? 'API Billit (temps réel)' : 'Cache local'
            });

            total += finalBalance;
          }

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

        case 'get_last_transaction': {
          // Récupérer toutes les transactions des 30 derniers jours
          const endDate = new Date();
          const startDate = new Date();
          startDate.setDate(startDate.getDate() - 30);

          const transactions = await this.bankClient.getTransactionsByPeriod(startDate, endDate);

          if (transactions.length === 0) {
            return JSON.stringify({
              error: 'Aucune transaction trouvée dans les 30 derniers jours',
              direct_response: '❌ Aucune transaction trouvée dans les 30 derniers jours.'
            });
          }

          // Trier par date décroissante et prendre la première
          const sortedTransactions = transactions.sort((a, b) =>
            new Date(b.date).getTime() - new Date(a.date).getTime()
          );

          const lastTx = sortedTransactions[0];
          const date = new Date(lastTx.date).toLocaleDateString('fr-BE');
          const time = new Date(lastTx.date).toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' });
          const type = lastTx.type === 'Credit' ? '💰 Crédit' : '💸 Débit';
          const amount = lastTx.type === 'Credit'
            ? `+${lastTx.amount.toFixed(2)}€`
            : `-${Math.abs(lastTx.amount).toFixed(2)}€`;
          const desc = lastTx.description || 'Sans description';

          const directResponse = `🔍 Dernière transaction bancaire\n\n` +
            `📅 Date: ${date} à ${time}\n` +
            `${type}\n` +
            `💵 Montant: ${amount}\n` +
            `📝 Description: ${desc}`;

          result = {
            transaction: lastTx,
            direct_response: directResponse
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

          // Pagination : si offset > 1, on affiche toujours la liste détaillée
          const isPaginated = args.offset && args.offset > 1;

          let directResponse: string;

          if (wantsDetailedList || transactions.length <= 10 || isPaginated) {
            // Afficher la liste détaillée si demandée OU si peu de transactions (<=10)
            const sortedTransactions = transactions
              .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

            // Pagination
            const page = args.offset || 1;
            const limit = args.limit || 30;
            const startIndex = (page - 1) * limit;
            const transactionsToShow = sortedTransactions.slice(startIndex, startIndex + limit);
            const hasMore = startIndex + limit < transactions.length;
            const totalPages = Math.ceil(transactions.length / limit);

            const transactionsList = transactionsToShow
              .map((tx, index) => {
                const num = String(startIndex + index + 1).padStart(3, ' ');
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
              ? `\n\n📄 Page ${page}/${totalPages} — Transactions ${startIndex + 1}-${startIndex + transactionsToShow.length} sur ${transactions.length}\n💡 Tapez "suivantes" ou "page suivante" pour voir la suite`
              : totalPages > 1
              ? `\n\n📄 Page ${page}/${totalPages} — Fin de la liste`
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
            // Détecter si c'est une année complète
            const isFullYear = startDate.getMonth() === 0 && startDate.getDate() === 1 &&
                               endDate.getMonth() === 11 && endDate.getDate() === 31 &&
                               startDate.getFullYear() === endDate.getFullYear();
            const periodTitle = isFullYear
              ? `l'année ${startDate.getFullYear()}`
              : startDate.toLocaleDateString('fr-BE', { month: 'long', year: 'numeric' });

            directResponse = `📊 Balance de ${periodTitle}\n\n` +
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
          // 🤖 Matching IA de l'employé si spécifié
          if (args.employee_name) {
            const matchedEmployee = await this.matchEmployeeWithAI(args.employee_name);
            args.employee_name = matchedEmployee; // Remplacer par le nom exact
          }

          // 🆕 Gérer period_text (parsing IA) - PRIORITÉ sur month/start_month/end_month
          let startDate: Date | undefined;
          let endDate: Date | undefined;
          let periodDescription: string | undefined;
          let periodParsed = false; // Flag pour savoir si period_text a été parsé avec succès

          if (args.period_text) {
            // 🔧 Fallback direct pour "année XXXX" au lieu de parsing IA
            const yearMatch = args.period_text.match(/année\s+(\d{4})/i);
            if (yearMatch) {
              const year = parseInt(yearMatch[1]);
              startDate = new Date(year, 0, 1); // 1er janvier
              endDate = new Date(year, 11, 31, 23, 59, 59); // 31 décembre
              periodDescription = `année ${year}`;
              periodParsed = true;
              console.log(`✅ Période directe (année ${year}): ${startDate.toISOString().split('T')[0]} à ${endDate.toISOString().split('T')[0]}`);
            } else {
              // Pour les autres cas, utiliser le parsing IA
              try {
                const period = await this.parsePeriodWithAI(args.period_text);
                if (period) {
                  startDate = period.start;
                  endDate = period.end;
                  periodDescription = period.description;
                  periodParsed = true;
                  console.log(`✅ Période IA utilisée: ${period.description}`);
                } else {
                  // ⚠️ Parsing IA échoué, continuer avec start_month/end_month si disponibles
                  console.log(`⚠️ Parsing IA échoué pour "${args.period_text}", tentative avec start_month/end_month`);
                  // Ne PAS retourner d'erreur ici - continuer avec les autres paramètres
                }
              } catch (error) {
                console.log(`⚠️ Erreur parsing IA pour "${args.period_text}": ${error}, tentative avec start_month/end_month`);
                // Ne PAS retourner d'erreur ici - continuer avec les autres paramètres
              }
            }
          }

          // 🔵 Si period_text n'a pas été parsé, essayer month/start_month/end_month
          if (!periodParsed) {
            // Logique existante pour month/start_month/end_month/start_date/end_date
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

            // Si aucune année spécifiée, déduire intelligemment l'année
            let targetYear: number;
            if (args.year) {
              targetYear = parseInt(args.year);
            } else {
              const now = new Date();
              const currentYear = now.getFullYear();
              const currentMonth = now.getMonth();

              // Si le mois demandé est dans le futur, utiliser l'année précédente
              // Exemple: janvier 2026, demande "décembre" → décembre 2025
              if (targetMonth > currentMonth) {
                targetYear = currentYear - 1;
              } else {
                targetYear = currentYear;
              }
            }

            startDate = new Date(targetYear, targetMonth, 1);
            endDate = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59);
          } else if (args.start_month && args.end_month) {
            // Période multi-mois (ex: octobre à décembre)
            const startMonth = parseMonth(args.start_month);
            const endMonth = parseMonth(args.end_month);

            if (startMonth === -1 || endMonth === -1) {
              return JSON.stringify({ error: `Mois invalide: ${args.start_month} ou ${args.end_month}` });
            }

            // Si aucune année spécifiée, déduire intelligemment l'année
            let targetYear: number;
            if (args.year) {
              targetYear = parseInt(args.year);
            } else {
              const now = new Date();
              const currentYear = now.getFullYear();
              const currentMonth = now.getMonth();

              // Si le mois de FIN est dans le futur, utiliser l'année précédente
              // Exemple: janvier 2026, demande "octobre à décembre" → 2025
              if (endMonth > currentMonth) {
                targetYear = currentYear - 1;
              } else {
                targetYear = currentYear;
              }
            }

            startDate = new Date(targetYear, startMonth, 1);
            endDate = new Date(targetYear, endMonth + 1, 0, 23, 59, 59);
          } else if (args.start_date && args.end_date) {
            startDate = BankClient.parseDate(args.start_date) || new Date();
            endDate = BankClient.parseDate(args.end_date) || new Date();
          } else {
            // Par défaut: toutes les transactions disponibles (pour "dernier paiement", "total", etc.)
            startDate = new Date(2020, 0, 1);  // Date arbitraire dans le passé
            endDate = new Date();
          }
          }  // Fin du else pour logique existante (month/start_month/end_date)

          if (!startDate || !endDate) {
            return JSON.stringify({ error: 'Format de date invalide' });
          }

          let transactions = await this.bankClient.getTransactionsByPeriod(startDate, endDate);

          // Filtrer par employé (si spécifié)
          const { getAllEmployees } = await import('./database');
          let employees = getAllEmployees();
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
              // Format: "VIREMENT EN FAVEUR DE [NOM] BE12..."
              const match = desc.match(/VIREMENT EN FAVEUR DE\s+(.+?)\s+BE\d{2}/i);
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

          // ✅ Recharger les employés depuis la BD après auto-apprentissage
          if (newEmployeesAdded.length > 0) {
            employees = getAllEmployees();
            console.log(`✅ ${employees.length} employés rechargés depuis la BD`);
          }

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
          // 🔧 CORRECTION: Utiliser periodDescription si disponible (résultat du parsing IA)
          if (periodDescription) {
            periodTitle = periodDescription;
          } else if (args.month) {
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
          // 3. SAUF si la question demande une analyse/statistique/résumé (dans ce cas, juste l'analyse suffit)
          // 4. SAUF si mois unique avec beaucoup de transactions (> 10) sans demande explicite

          // 🔍 DÉTECTION: Question demande une liste explicite
          const userAsksForList = questionLower.includes('liste') ||
                                 questionLower.includes('détail') ||
                                 questionLower.includes('à qui') ||
                                 questionLower.includes('qui a') ||
                                 questionLower.includes('noms') ||
                                 questionLower.includes('qui j\'ai payé') ||
                                 questionLower.includes('montre-moi les');

          // 🔍 DÉTECTION: Question demande une analyse/statistique/résumé (PAS de liste détaillée)
          const userAsksForSummaryOnly =
            questionLower.includes('top') ||  // "Top 10 employés"
            questionLower.includes('analyse') ||  // "Analyse des salaires"
            questionLower.includes('stat') ||  // "Statistiques"
            /mois.*plus.*payé|plus.*mois/.test(questionLower) ||  // "Mois où j'ai le plus payé"
            /combien.*payé|total.*salaire/.test(questionLower) ||  // "Combien j'ai payé", "Total des salaires"
            questionLower.includes('résumé') ||
            questionLower.includes('répartition') ||
            questionLower.includes('évolution') ||
            questionLower.includes('classement') ||
            questionLower.includes('meilleur') ||
            questionLower.includes('le plus') && !questionLower.includes('liste');  // "Le plus payé" mais PAS "montre la liste"

          const userWantsDetails = args.include_details === true || userAsksForList;
          const isSpecificEmployeeSearch = args.employee_name && salaryTransactions.length <= 10;
          const isSingleMonthManyTransactions = args.month && salaryTransactions.length > 10;
          const isMultiMonthManyTransactions = (args.start_month && args.end_month) && salaryTransactions.length > 10;
          // 🔵 MASQUER la liste pour les requêtes annuelles avec beaucoup de transactions
          const isAnnualManyTransactions = args.period_text && /année\s+\d{4}/i.test(args.period_text) && salaryTransactions.length > 10;
          // Si l'utilisateur demande une analyse statistique, PAS de liste détaillée
          const includeDetailedList = !userAsksForSummaryOnly && !isMultiMonthManyTransactions && !isAnnualManyTransactions && (
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
          // 🤖 Matching IA de tous les employés
          if (args.employee_names && args.employee_names.length > 0) {
            const matchedNames = await Promise.all(
              args.employee_names.map((name: string) => this.matchEmployeeWithAI(name))
            );
            args.employee_names = matchedNames;
          }

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

          // 🆕 Gérer period_text (parsing IA) - PRIORITÉ sur month/year
          if (args.period_text) {
            // 🔧 Fallback direct pour "année XXXX" au lieu de parsing IA
            const yearMatch = args.period_text.match(/année\s+(\d{4})/i);
            if (yearMatch) {
              const year = parseInt(yearMatch[1]);
              startDate = new Date(year, 0, 1); // 1er janvier
              endDate = new Date(year, 11, 31, 23, 59, 59); // 31 décembre
              console.log(`✅ Période directe pour comparaison (année ${year}): ${startDate.toISOString().split('T')[0]} à ${endDate.toISOString().split('T')[0]}`);
            } else {
              // Pour les autres cas, utiliser le parsing IA
              const period = await this.parsePeriodWithAI(args.period_text);
              if (period) {
                startDate = period.start;
                endDate = period.end;
                console.log(`✅ Période IA utilisée pour comparaison employés: ${period.description}`);
              } else {
                return JSON.stringify({ error: `Impossible de parser la période: ${args.period_text}` });
              }
            }
          } else {
            // Logique existante pour month/year
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
              // Par défaut: année intelligente
              let targetYear: number;
              if (args.year) {
                targetYear = parseInt(args.year);
              } else {
                const now = new Date();
                const currentYear = now.getFullYear();
                const currentMonth = now.getMonth();

                // Si on est en janvier (mois 0), utiliser l'année précédente par défaut
                if (currentMonth === 0) {
                  targetYear = currentYear - 1;
                } else {
                  targetYear = currentYear;
                }
              }
              startDate = new Date(targetYear, 0, 1);
              endDate = new Date(targetYear, 11, 31, 23, 59, 59);
            }
            }  // Fin du else pour logique existante (month/year)

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
          // 🔍 DÉTECTION AUTOMATIQUE DE PLUSIEURS FOURNISSEURS
          // Si supplier_name contient " et ", extraire tous les fournisseurs
          let suppliersToProcess: string[] = [];
          let isMultiSupplier = false;

          if (args.supplier_name && args.supplier_name.includes(' et ')) {
            // Extraire tous les fournisseurs séparés par " et ", ",", "&"
            const parts = args.supplier_name.split(/\s+(?:et|,|&)\s+/i);
            suppliersToProcess = parts.map((p: string) => p.trim()).filter((p: string) => p.length > 0);
            isMultiSupplier = suppliersToProcess.length > 1;
            console.log(`🔍 Détection: ${suppliersToProcess.length} fournisseurs à traiter:`, suppliersToProcess);
          } else if (args.supplier_name) {
            suppliersToProcess = [args.supplier_name];
          }

          // 🤖 Matching IA de tous les fournisseurs
          if (suppliersToProcess.length > 0) {
            const matchedNames = await Promise.all(
              suppliersToProcess.map(name => this.matchSupplierWithAI(name))
            );
            suppliersToProcess = matchedNames;
            console.log(`🤖 Matching IA: ${matchedNames.join(', ')}`);
          }

          // Gérer month/year ou start_month/end_month
          let startDate: Date;
          let endDate: Date;

          // 🆕 Gérer period_text (parsing IA) - PRIORITÉ sur month/start_month/end_month
          if (args.period_text) {
            const period = await this.parsePeriodWithAI(args.period_text);
            if (period) {
              startDate = period.start;
              endDate = period.end;
              console.log(`✅ Période IA utilisée pour analyse fournisseurs: ${period.description}`);
            } else {
              return JSON.stringify({ error: `Impossible de parser la période: ${args.period_text}` });
            }
          } else {
            // Logique existante pour month/start_month/end_month
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

            // Si aucune année spécifiée, déduire intelligemment l'année
            let targetYear: number;
            if (args.year) {
              targetYear = parseInt(args.year);
            } else {
              const now = new Date();
              const currentYear = now.getFullYear();
              const currentMonth = now.getMonth();

              // Si le mois demandé est dans le futur, utiliser l'année précédente
              // Exemple: janvier 2026, demande "décembre" → 2025
              if (targetMonth > currentMonth) {
                targetYear = currentYear - 1;
              } else {
                targetYear = currentYear;
              }
            }

            startDate = new Date(targetYear, targetMonth, 1);
            endDate = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59);
          } else if (args.start_month && args.end_month) {
            // Période multi-mois (ex: octobre à décembre)
            const startMonth = parseMonth(args.start_month);
            const endMonth = parseMonth(args.end_month);

            if (startMonth === -1 || endMonth === -1) {
              return JSON.stringify({ error: `Mois invalide: ${args.start_month} ou ${args.end_month}` });
            }

            // Si aucune année spécifiée, déduire intelligemment l'année
            let targetYear: number;
            if (args.year) {
              targetYear = parseInt(args.year);
            } else {
              const now = new Date();
              const currentYear = now.getFullYear();
              const currentMonth = now.getMonth();

              // Si le mois de FIN est dans le futur, utiliser l'année précédente
              // Exemple: janvier 2026, demande "octobre à décembre" → 2025
              if (endMonth > currentMonth) {
                targetYear = currentYear - 1;
              } else {
                targetYear = currentYear;
              }
            }

            startDate = new Date(targetYear, startMonth, 1);
            endDate = new Date(targetYear, endMonth + 1, 0, 23, 59, 59);
          } else {
            // Par défaut: année intelligente
            let targetYear: number;
            if (args.year) {
              targetYear = parseInt(args.year);
            } else {
              const now = new Date();
              const currentYear = now.getFullYear();
              const currentMonth = now.getMonth();

              // Si on est en janvier (mois 0), utiliser l'année précédente par défaut
              // Exemple: janvier 2026, demande "top 10 dépenses" → 2025
              if (currentMonth === 0) {
                targetYear = currentYear - 1;
              } else {
                targetYear = currentYear;
              }
            }
            startDate = new Date(targetYear, 0, 1);
            endDate = new Date(targetYear, 11, 31, 23, 59, 59);
          }
          }  // Fin du else pour logique existante (month/start_month/end_month)

          if (!startDate || !endDate) {
            return JSON.stringify({ error: 'Format de date invalide' });
          }

          // Récupérer les transactions
          let transactions = await this.bankClient.getTransactionsByPeriod(startDate, endDate);

          // Importer les fonctions de fournisseur
          const { matchesSupplier, SUPPLIER_ALIASES } = await import('./supplier-aliases');
          let suppliers = Object.keys(SUPPLIER_ALIASES);

          // 🏷️ FILTRAGE PAR CATÉGORIE (si args.category est spécifié)
          if (args.category) {
            const categoryMap: { [key: string]: string[] } = {
              'alimentation': ['foster', 'coca-cola', 'cocacola', 'colruyt', 'sligro', 'makro', 'metro', 'transgourmet', 'alkhoomsy', 'turbatu'],
              'utilities': ['engie', 'vivaqua', 'fluxys', 'electrabel'],
              'telecom': ['proximus', 'orange', 'telenet', 'mobile', 'vodafone'],
              'transport': ['uber', 'takeaway', 'deliveroo', 'just eat', 'justeat'],
              'services': ['kbc', 'bnp', 'ing', 'beobank', 'babel'],
              'assurance': ['ag insurance', 'allianz', 'axa', 'bnpparf', 'p&v'],
              'loyers': ['loyer', 'location', 'immobilier']
            };

            const categorySuppliers = categoryMap[args.category.toLowerCase()];
            if (categorySuppliers) {
              const categoryLower = args.category.toLowerCase();
              suppliers = suppliers.filter((sup: string) => {
                const supLower = sup.toLowerCase();
                return categorySuppliers.some((keyword: string) => supLower.includes(keyword));
              });
              console.log(`🏷️ Filtrage par catégorie "${args.category}": ${suppliers.length} fournisseur(s) trouvé(s)`);
            }
          }

          // 🔄 NOUVEAU: Pour un fournisseur spécifique, chercher aussi dans les factures Billit si pas de dépenses bancaires
          const getSupplierExpensesFromInvoices = async (supplierName: string): Promise<any[]> => {
            try {
              console.log(`🔍 Recherche de factures Billit pour "${supplierName}"...`);
              const allInvoices = await this.billitClient.getInvoices({ limit: 120 });

              // Filtrer par fournisseur
              const supplierInvoices = allInvoices.filter(inv => {
                const invDate = new Date(inv.invoice_date);
                return invDate >= startDate && invDate <= endDate && matchesSupplier(inv.supplier_name, supplierName);
              });

              console.log(`📄 ${supplierInvoices.length} facture(s) trouvée(s) pour "${supplierName}"`);

              // Convertir les factures au format des transactions (pour compatibilité avec le code d'analyse)
              return supplierInvoices.map(inv => ({
                date: inv.invoice_date,
                amount: -inv.total_amount,  // Négatif car c'est une dépense
                type: 'Debit',
                description: `Facture ${inv.invoice_number} - ${inv.supplier_name}`,
                communication: inv.communication || '',
                invoice_number: inv.invoice_number,
                supplier_name: inv.supplier_name,
              }));
            } catch (error) {
              console.error(`❌ Erreur lors de la récupération des factures:`, error);
              return [];
            }
          };

          // 🔍 Vérifier d'abord s'il y a des factures Billit pour décider quoi afficher
          const hasInvoicesForSupplier = async (supplierName: string): Promise<boolean> => {
            try {
              const allInvoices = await this.billitClient.getInvoices({ limit: 120 });
              const supplierInvoices = allInvoices.filter(inv => {
                const invDate = new Date(inv.invoice_date);
                return invDate >= startDate && invDate <= endDate && matchesSupplier(inv.supplier_name, supplierName);
              });
              return supplierInvoices.length > 0;
            } catch {
              return false;
            }
          };

          // 🔍 Fonction pour analyser UN fournisseur spécifique
          const analyzeSingleSupplier = async (supplierName: string): Promise<any[]> => {
            // 🔧 FIX BUG #18-19: Ne PAS utiliser matchesSupplier pour trouver les fournisseurs dans SUPPLIER_ALIASES
            // car il est trop permissif (ex: "Colruyt" matche "Foster" via "food")
            // À la place, filtrer directement les transactions par le nom exact du fournisseur (après AI matching)
            
            console.log(`🔍 Analyse fournisseur "${supplierName}"...`);

            // Filtrer les transactions qui correspondent au fournisseur spécifique
            let supplierTransactions = transactions.filter(tx =>
              matchesSupplier(tx.description || '', supplierName)
            );

            console.log(`📊 ${supplierTransactions.length} transaction(s) trouvée(s) pour "${supplierName}"`);

            // 🔄 NOUVEAU: Si pas de débits bancaires, chercher dans les factures Billit
            const debits = supplierTransactions.filter((tx: any) => tx.type === 'Debit');
            if (debits.length === 0) {
              console.log(`⚠️ Aucun débit bancaire pour "${supplierName}", recherche dans les factures Billit...`);
              const invoiceExpenses = await getSupplierExpensesFromInvoices(supplierName);
              if (invoiceExpenses.length > 0) {
                console.log(`✅ ${invoiceExpenses.length} facture(s) trouvée(s) dans Billit`);
                // Combiner avec les crédits existants (revenus)
                const credits = supplierTransactions.filter((tx: any) => tx.type === 'Credit');
                return [...invoiceExpenses, ...credits];
              }
            }

            return supplierTransactions;
          };

          // Filtrer les transactions du fournisseur (TOUS types : crédit ET débit)
          let supplierTransactions: any[];

          if (isMultiSupplier && suppliersToProcess.length > 0) {
            // Plusieurs fournisseurs : combiner tous les résultats
            let allTransactions: any[] = [];
            for (const supplier of suppliersToProcess) {
              const txs = await analyzeSingleSupplier(supplier);
              allTransactions = allTransactions.concat(txs);
            }
            supplierTransactions = allTransactions;
          } else if (args.supplier_name) {
            // Filtrer pour un fournisseur spécifique
            supplierTransactions = await analyzeSingleSupplier(args.supplier_name);
          } else {
            // Obtenir TOUTES les transactions vers fournisseurs connus (débits uniquement pour le top global)
            supplierTransactions = transactions.filter(tx => {
              if (tx.type !== 'Debit') return false;
              // Vérifier si correspond à un fournisseur connu
              return suppliers.some((sup: string) => matchesSupplier(tx.description || '', sup));
            });
          }

          // ✨ DÉTECTION: Afficher Dépenses SEULEMENT, Revenus SEULEMENT, ou les DEUX ?
          const debits = supplierTransactions.filter(tx => tx.type === 'Debit');
          const credits = supplierTransactions.filter(tx => tx.type === 'Credit');
          const totalDebits = debits.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
          const totalCredits = credits.reduce((sum, tx) => sum + tx.amount, 0);

          // 📋 MOTS-CLÉS: Déterminer quoi afficher
          const questionLower = this.currentQuestion.toLowerCase();
          const userWantsRevenue = questionLower.includes('revenu') || questionLower.includes('recette') ||
                                   questionLower.includes('gain') || questionLower.includes('encaissé') ||
                                   questionLower.includes('chiffre d\'affaires') || questionLower.includes('ca ');
          const userWantsExpenses = questionLower.includes('dépense') || questionLower.includes('depense') ||
                                    questionLower.includes('paiement') || questionLower.includes('facture');
          const userAsksForAnalysis = questionLower.includes('analyse') || questionLower.includes('top');

          // 🔍 Vérifier si des factures existent dans Billit (pour les fournisseurs comme Uber)
          const hasBillitInvoices = args.supplier_name ? await hasInvoicesForSupplier(args.supplier_name) : false;
          console.log(`📊 hasBillitInvoices pour "${args.supplier_name || 'multi'}": ${hasBillitInvoices}`);

          // 🎯 LOGIQUE D'AFFICHAGE:
          // - "analyse Uber" → Afficher les DEUX (Dépenses + Revenus)
          // - "revenus Uber" → Afficher les Revenus SEULEMENT
          // - "dépenses Uber" → Afficher les Dépenses SEULEMENT (même si totalDebits = 0 mais factures existent)
          // - Par défaut → Afficher les Dépenses (sauf si pas de dépenses mais des revenus)
          const hasExpenseData = totalDebits > 0 || hasBillitInvoices;
          const showBothSections = userAsksForAnalysis && hasExpenseData && totalCredits > 0;
          const showRevenueOnly = userWantsRevenue && !userWantsExpenses && totalCredits > 0;
          const showExpensesOnly = userWantsExpenses || (!showBothSections && !showRevenueOnly);

          let sectionsToDisplay: any[] = [];
          if (showBothSections || (!userWantsRevenue && !userWantsExpenses)) {
            // Afficher les Dépenses (par défaut ou analyse complète)
            sectionsToDisplay.push({ type: 'expenses', data: debits, total: totalDebits, icon: '💸', label: 'Dépenses' });
          }
          if (showBothSections || showRevenueOnly) {
            // Afficher les Revenus (si analyse complète ou demande explicite)
            sectionsToDisplay.push({ type: 'revenues', data: credits, total: totalCredits, icon: '💰', label: 'Revenus' });
          }

          // Pour la compatibilité avec le code existant, utiliser les dépenses par défaut
          const supplierExpenses = debits;
          const totalSpent = totalDebits;
          const isRevenuePartner = showRevenueOnly;

          // Trier par date décroissante
          supplierExpenses.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

          // 📊 ANALYSE PAR FOURNISSEUR
          const isMultiSupplierQuery = !args.supplier_name && supplierExpenses.length > 0;
          const isSpecificSupplierAnalysis = args.supplier_name;  // Changé pour vérifier aussi le cas 0 transaction

          let analysisText = '';
          const showSupplierAnalysis = !args.supplier_name && isMultiSupplierQuery;

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

          if (isSpecificSupplierAnalysis) {
            // ✅ Vérifier s'il y a des données avant de faire l'analyse
            if (debits.length === 0 && credits.length === 0) {
              // Aucune donnée trouvée (ni transactions, ni factures)
              const supplierName = args.supplier_name || 'Ce fournisseur';
              result = {
                supplier_name: supplierName,
                period: `${startDate.toLocaleDateString('fr-BE')} - ${endDate.toLocaleDateString('fr-BE')}`,
                total_spent: 0,
                transaction_count: 0,
                type: 'dépenses',
                direct_response: `🔍 ${supplierName}

❌ Aucune donnée trouvée pour ce fournisseur (ni transactions bancaires, ni factures).

Vérifiez:
• Le nom du fournisseur est correct
• Des factures existent dans Billit pour ce fournisseur`
              };
              break;
            }

            // 🎯 Afficher une ou deux sections selon le cas
            const supplierName = args.supplier_name || 'Ce fournisseur';
            let directResponse = `📊 Analyse: ${supplierName}\n${periodTitle}\n\n`;

            for (const section of sectionsToDisplay) {
              const sectionData = section.data;
              const sectionTotal = section.total;
              const sectionIcon = section.icon;
              const sectionLabel = section.label;

              if (sectionData.length === 0) continue;

              // Calculer les statistiques
              const amounts = sectionData.map((tx: any) => Math.abs(tx.amount));
              const avgAmount = sectionTotal / sectionData.length;
              const minAmount = Math.min(...amounts);
              const maxAmount = Math.max(...amounts);

              directResponse += `${sectionIcon} **${sectionLabel}**\n`;
              directResponse += `Total: ${sectionTotal.toFixed(2)}€ • ${sectionData.length} transaction${sectionData.length > 1 ? 's' : ''}\n`;
              directResponse += `Moyenne: ${avgAmount.toFixed(2)}€\n`;
              directResponse += `Min: ${minAmount.toFixed(2)}€\n`;
              directResponse += `Max: ${maxAmount.toFixed(2)}€\n`;

              // Évolution mensuelle (compacte)
              const monthlyBreakdown: { [key: string]: { total: number; count: number; fullDate: Date } } = {};
              sectionData.forEach((tx: any) => {
                const txDate = new Date(tx.date);
                const monthKey = txDate.toLocaleDateString('fr-BE', { month: 'short', year: 'numeric' });
                if (!monthlyBreakdown[monthKey]) {
                  monthlyBreakdown[monthKey] = { total: 0, count: 0, fullDate: txDate };
                }
                monthlyBreakdown[monthKey].total += Math.abs(tx.amount);
                monthlyBreakdown[monthKey].count++;
              });

              const sortedMonths = Object.entries(monthlyBreakdown)
                .map(([month, data]) => ({ month, ...data }))
                .sort((a: any, b: any) => b.fullDate.getTime() - a.fullDate.getTime());

              if (sortedMonths.length > 0) {
                directResponse += `📅 Évolution mensuelle:\n`;
                sortedMonths.forEach((m: any) => {
                  directResponse += `  ${m.month}: ${m.total.toFixed(0)}€\n`;
                });
              }

              // Dernières transactions (format compact)
              const maxToShow = Math.min(5, sectionData.length);
              const recentPayments = sectionData.slice(0, maxToShow);
              directResponse += `💳 Derniers:\n`;
              recentPayments.forEach((tx: any, i: number) => {
                const date = new Date(tx.date).toLocaleDateString('fr-BE', { day: '2-digit', month: '2-digit' });
                const amount = Math.abs(tx.amount).toFixed(2);
                // Raccourcir la description
                let desc = tx.description || tx.supplier_name || '-';
                if (desc.length > 50) {
                  desc = desc.substring(0, 47) + '...';
                }
                // Pour les revenus Uber, simplifier
                if (desc.includes('STICHTING CUSTODIAN UBER PAYMENTS')) {
                  desc = 'Uber Payments';
                }
                directResponse += `  ${date}: ${amount}€ - ${desc}\n`;
              });

              if (sectionData.length > 5) {
                directResponse += `  ... et ${sectionData.length - 5} autres\n`;
              }

              // Séparateur entre sections
              if (sectionsToDisplay.length > 1 && sectionsToDisplay.indexOf(section) < sectionsToDisplay.length - 1) {
                directResponse += `\n`;
              }
            }

            // Calculer le solde net (revenus - dépenses)
            if (showBothSections) {
              const netBalance = totalCredits - totalDebits;
              const marginPercent = totalDebits > 0 ? ((netBalance / totalDebits) * 100).toFixed(1) : '0.0';
              directResponse += `\n💰 **Solde net**: ${netBalance >= 0 ? '+' : ''}${netBalance.toFixed(2)}€`;
              directResponse += ` (Marge: ${marginPercent}%)\n`;
            }

            result = {
              supplier_name: supplierName,
              period: `${startDate.toLocaleDateString('fr-BE')} - ${endDate.toLocaleDateString('fr-BE')}`,
              total_spent: totalDebits,
              transaction_count: debits.length,
              total_revenue: totalCredits,
              revenue_count: credits.length,
              net_balance: totalCredits - totalDebits,
              direct_response: directResponse.trimStart()
            };
            break;
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

          // Décider si on inclut la liste détaillée
          const userAsksForList = questionLower.includes('liste') || questionLower.includes('détail');
          const userWantsDetails = args.include_details === true || userAsksForList;
          const userAsksForTopOnly = /top\s*\d+/.test(questionLower) && !userAsksForList;
          const isSpecificSupplierSearch = args.supplier_name && supplierExpenses.length <= 10;
          const isSingleMonthManyExpenses = args.month && supplierExpenses.length > 10;
          const includeDetailedList = !userAsksForTopOnly && !isSingleMonthManyExpenses && (userWantsDetails || isSpecificSupplierSearch);

          let directResponse = '';

          // 🔍 CAS: PLUSIEURS FOURNISSEURS → Générer une section par fournisseur
          if (isMultiSupplier && suppliersToProcess.length > 0) {
            directResponse = `📊 Analyse de ${suppliersToProcess.length} fournisseurs - ${periodTitle}\n\n`;

            for (const supplierName of suppliersToProcess) {
              // Analyser ce fournisseur spécifique
              const singleSupplierTxs = await analyzeSingleSupplier(supplierName);
              const singleDebits = singleSupplierTxs.filter((tx: any) => tx.type === 'Debit');
              const singleCredits = singleSupplierTxs.filter((tx: any) => tx.type === 'Credit');
              const singleTotalDebits = singleDebits.reduce((sum: number, tx: any) => sum + Math.abs(tx.amount), 0);
              const singleTotalCredits = singleCredits.reduce((sum: number, tx: any) => sum + tx.amount, 0);

              const singleIsRevenue = singleTotalCredits > singleTotalDebits;
              const singleExpenses = singleIsRevenue ? singleCredits : singleDebits;
              const singleTotal = singleExpenses.reduce((sum: number, tx: any) => sum + Math.abs(tx.amount), 0);
              const singleCount = singleExpenses.length;

              if (singleCount === 0) {
                directResponse += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
                directResponse += `🔍 ${supplierName}\n`;
                directResponse += `❌ Aucune donnée trouvée pour ce fournisseur (ni transactions bancaires, ni factures).\n`;
                continue;
              }

              // Trier par date
              singleExpenses.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());

              const icon = singleIsRevenue ? '💰' : '💸';
              const typeLabel = singleIsRevenue ? 'Revenus' : 'Dépenses';
              const countLabel = singleIsRevenue ? 'versements' : 'paiements';

              directResponse += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
              directResponse += `${icon} ${supplierName} - ${typeLabel} de ${periodTitle}\n\n`;
              directResponse += `Total: ${singleTotal.toFixed(2)}€ (${singleCount} ${countLabel})\n`;

              // Ajouter quelques statistiques
              const amounts = singleExpenses.map(tx => Math.abs(tx.amount));
              const avgAmount = singleTotal / singleCount;
              directResponse += `   • Moyenne: ${avgAmount.toFixed(2)}€\n`;
              directResponse += `   • Min: ${Math.min(...amounts).toFixed(2)}€ | Max: ${Math.max(...amounts).toFixed(2)}€\n`;

              // Afficher les 5 dernières transactions
              const recentTxs = singleExpenses.slice(0, 5);
              directResponse += `\n💳 Derniers ${countLabel}:\n`;
              recentTxs.forEach((tx, i) => {
                const date = new Date(tx.date).toLocaleDateString('fr-BE');
                const amount = Math.abs(tx.amount).toFixed(2);
                directResponse += `   ${i + 1}. ${date}: ${amount}€\n`;
              });
              if (singleCount > 5) {
                directResponse += `   ... et ${singleCount - 5} autres\n`;
              }
            }
          } else {
            // CAS: FOURNISSEUR UNIQUE OU TOUS
            // Adapter le titre selon le type (dépenses ou revenus)
            const titleIcon = isRevenuePartner ? '💰' : '💸';
            const titleType = isRevenuePartner ? 'Revenus' : 'Dépenses fournisseurs';
            const countLabel = isRevenuePartner ? 'versements' : 'paiements';

            // 📝 Construire le titre avec le nom du fournisseur si spécifié
            let titleWithSupplier = `${titleIcon} ${titleType} de ${periodTitle}`;
            if (args.supplier_name && !isMultiSupplier) {
              titleWithSupplier = `${titleIcon} ${args.supplier_name} - ${titleType} de ${periodTitle}`;
            }

            directResponse = `${titleWithSupplier}\n\n` +
              `Total: ${totalSpent.toFixed(2)}€ (${supplierExpenses.length} ${countLabel})` +
              analysisText;

            if (includeDetailedList) {
              directResponse += `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` + expenseList;
            }
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
          // 🤖 Matching IA de tous les fournisseurs
          if (args.supplier_names && args.supplier_names.length > 0) {
            const matchedNames = await Promise.all(
              args.supplier_names.map((name: string) => this.matchSupplierWithAI(name))
            );
            args.supplier_names = matchedNames;
          }

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

          // 🆕 Gérer period_text (parsing IA) - PRIORITÉ sur month/year
          if (args.period_text) {
            const period = await this.parsePeriodWithAI(args.period_text);
            if (period) {
              startDate = period.start;
              endDate = period.end;
              console.log(`✅ Période IA utilisée pour comparaison fournisseurs: ${period.description}`);
            } else {
              return JSON.stringify({ error: `Impossible de parser la période: ${args.period_text}` });
            }
          } else {
            // Logique existante pour month/year
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

              // Si aucune année spécifiée, déduire intelligemment l'année
              let targetYear: number;
              if (args.year) {
                targetYear = parseInt(args.year);
              } else {
                const now = new Date();
                const currentYear = now.getFullYear();
                const currentMonth = now.getMonth();

                // Si le mois demandé est dans le futur, utiliser l'année précédente
                if (targetMonth > currentMonth) {
                  targetYear = currentYear - 1;
                } else {
                  targetYear = currentYear;
                }
              }

              startDate = new Date(targetYear, targetMonth, 1);
              endDate = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59);
            } else {
              // Par défaut: année intelligente
              let targetYear: number;
              if (args.year) {
                targetYear = parseInt(args.year);
              } else {
                const now = new Date();
                const currentYear = now.getFullYear();
                const currentMonth = now.getMonth();

                // Si on est en janvier (mois 0), utiliser l'année précédente par défaut
                if (currentMonth === 0) {
                  targetYear = currentYear - 1;
                } else {
                  targetYear = currentYear;
                }
              }
              startDate = new Date(targetYear, 0, 1);
              endDate = new Date(targetYear, 11, 31, 23, 59, 59);
            }
            }  // Fin du else pour logique existante (month/year)

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

        case 'analyze_supplier_trends': {
          console.log('🔧 Exécution: analyze_supplier_trends', args);
          // 🤖 Matching IA du fournisseur
          const matchedSupplier = await this.matchSupplierWithAI(args.supplier_name);
          const trendsResult = await analyzeSupplierTrends(
            this.bankClient,
            matchedSupplier,
            args.period_months || 6,
            args.year
          );
          // 🔧 FIX BUG #25: Parser le JSON si c'est une string
          result = typeof trendsResult === 'string' ? JSON.parse(trendsResult) : trendsResult;
          break;
        }

        case 'get_supplier_ranking': {
          console.log('🔧 Exécution: get_supplier_ranking', args);
          const rankingResult = await getSupplierRanking(
            this.bankClient,
            args.limit || 10,
            args.month,
            args.year,
            args.show_evolution !== false
          );
          // 🔧 FIX BUG #24: Parser le JSON si c'est une string
          result = typeof rankingResult === 'string' ? JSON.parse(rankingResult) : rankingResult;
          break;
        }

        case 'detect_supplier_patterns': {
          console.log('🔧 Exécution: detect_supplier_patterns', args);
          // 🤖 Matching IA du fournisseur
          const matchedSupplier = await this.matchSupplierWithAI(args.supplier_name);
          const patternsResult = await detectSupplierPatterns(
            this.bankClient,
            matchedSupplier,
            args.period_months || 6
          );
          // Parser le JSON si c'est une string
          result = typeof patternsResult === 'string' ? JSON.parse(patternsResult) : patternsResult;
          break;
        }

        case 'get_year_summary': {
          console.log('🔧 Exécution: get_year_summary', args);
          const yearSummary = await getYearSummary(
            this.bankClient,
            this.billitClient,
            args.year,
            args.include_comparison !== false
          );
          result = typeof yearSummary === 'string' ? JSON.parse(yearSummary) : yearSummary;
          break;
        }

        case 'compare_periods': {
          console.log('🔧 Exécution: compare_periods', args);
          const periodsComp = await comparePeriods(
            this.bankClient,
            args.period1_start,
            args.period1_end,
            args.period2_start,
            args.period2_end
          );
          result = typeof periodsComp === 'string' ? JSON.parse(periodsComp) : periodsComp;
          break;
        }

        case 'get_quarterly_report': {
          console.log('🔧 Exécution: get_quarterly_report', args);
          const quarterly = await getQuarterlyReport(
            this.bankClient,
            this.billitClient,
            args.quarter,
            args.year,
            args.compare_previous !== false
          );
          result = typeof quarterly === 'string' ? JSON.parse(quarterly) : quarterly;
          break;
        }

        case 'predict_next_month': {
          console.log('🔧 Exécution: predict_next_month', args);
          const prediction = await predictNextMonth(
            this.bankClient,
            args.category,
            args.history_months
          );
          result = typeof prediction === 'string' ? JSON.parse(prediction) : prediction;
          break;
        }

        case 'detect_anomalies': {
          console.log('🔧 Exécution: detect_anomalies', args);
          const anomalies = await detectAnomalies(
            this.bankClient,
            args.period_days,
            args.threshold_percent
          );
          result = typeof anomalies === 'string' ? JSON.parse(anomalies) : anomalies;
          break;
        }

        case 'analyze_trends': {
          console.log('🔧 Exécution: analyze_trends', args);
          const trends = await analyzeTrends(
            this.bankClient,
            args.period_months,
            args.include_forecast
          );
          result = typeof trends === 'string' ? JSON.parse(trends) : trends;
          break;
        }

        case 'export_to_csv': {
          console.log('🔧 Exécution: export_to_csv', args);
          const exportResult = await exportToCSV(
            this.bankClient,
            this.billitClient,
            args.data_type,
            args.start_date,
            args.end_date
          );
          result = typeof exportResult === 'string' ? JSON.parse(exportResult) : exportResult;
          break;
        }

        case 'get_supplier_payments': {
          // 🤖 Matching IA du fournisseur
          const matchedSupplier = await this.matchSupplierWithAI(args.supplier_name);
          args.supplier_name = matchedSupplier; // Remplacer par le nom exact

          // 🆕 Gérer period_text (parsing IA) - PRIORITÉ sur month/year
          let startDate: Date;
          let endDate: Date;

          if (args.period_text) {
            const period = await this.parsePeriodWithAI(args.period_text);
            if (period) {
              startDate = period.start;
              endDate = period.end;
              console.log(`✅ Période IA utilisée pour ${args.supplier_name}: ${period.description}`);
            } else {
              return JSON.stringify({ error: `Impossible de parser la période: ${args.period_text}` });
            }
          } else {
            // Logique existante pour month/year
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

            // Si aucune année spécifiée, déduire intelligemment l'année
            let targetYear: number;
            if (args.year) {
              targetYear = parseInt(args.year);
            } else {
              const now = new Date();
              const currentYear = now.getFullYear();
              const currentMonth = now.getMonth();

              // Si le mois demandé est dans le futur, utiliser l'année précédente
              if (targetMonth > currentMonth) {
                targetYear = currentYear - 1;
              } else {
                targetYear = currentYear;
              }
            }

            startDate = new Date(targetYear, targetMonth, 1);
            endDate = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59);
          } else if (args.year) {
            // Année spécifique uniquement
            const targetYear = parseInt(args.year);
            startDate = new Date(targetYear, 0, 1);
            endDate = new Date(targetYear, 11, 31, 23, 59, 59);
          } else {
            // Par défaut: toutes les transactions disponibles (pour "dernier paiement", "total", etc.)
            startDate = new Date(2020, 0, 1);  // Date arbitraire dans le passé
            endDate = new Date();
          }
          }  // Fin du else pour logique existante (month/year)

          let transactions = await this.bankClient.getTransactionsByPeriod(startDate, endDate);

          // Filtrer par fournisseur SEULEMENT les débits (paiements VERS le fournisseur)
          const { matchesSupplier } = await import('./supplier-aliases');
          const supplierPayments = transactions.filter(tx =>
            tx.type === 'Debit' &&
            matchesSupplier(tx.description || '', args.supplier_name)
          );

          // Calculer le total (débits sont négatifs, on prend la valeur absolue)
          const totalPaid = supplierPayments.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

          // 🔍 DÉTECTION: Si 0 paiements VERS le fournisseur, vérifier d'abord les factures Billit (ex: Uber)
          if (totalPaid === 0 && supplierPayments.length === 0) {
            // 📄 Vérifier d'abord s'il y a des factures dans Billit
            try {
              const allInvoices = await this.billitClient.getInvoices({ limit: 120 });
              const supplierInvoices = allInvoices.filter(inv => {
                const invDate = new Date(inv.invoice_date);
                return invDate >= startDate && invDate <= endDate && matchesSupplier(inv.supplier_name, args.supplier_name);
              });

              if (supplierInvoices.length > 0) {
                // 💡 Des factures existent dans Billit - les afficher comme dépenses
                const totalInvoices = supplierInvoices.reduce((sum, inv) => sum + inv.total_amount, 0);
                const invoiceList = supplierInvoices.map(inv => ({
                  date: inv.invoice_date,
                  amount: inv.total_amount,
                  description: `Facture ${inv.invoice_number} - ${inv.supplier_name}`,
                  invoice_number: inv.invoice_number,
                  supplier_name: inv.supplier_name,
                })).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

                result = {
                  supplier_name: args.supplier_name,
                  period: `${startDate.toLocaleDateString('fr-BE')} - ${endDate.toLocaleDateString('fr-BE')}`,
                  total_paid: totalInvoices,
                  payment_count: supplierInvoices.length,
                  payments: invoiceList,
                  currency: 'EUR',
                  // 💡 INFORMATION: Les dépenses viennent des factures Billit (pas de débits bancaires)
                  is_invoice_based_expenses: true,
                  direct_response: `💸 Dépenses: ${args.supplier_name}\n${startDate.toLocaleDateString('fr-BE')} - ${endDate.toLocaleDateString('fr-BE')}\n\nTotal: **${totalInvoices.toFixed(2)}€** (${supplierInvoices.length} facture${supplierInvoices.length > 1 ? 's' : ''})\n\n📄 Factures${supplierInvoices.length > 5 ? ' (5 premières)' : ''}:\n${invoiceList.slice(0, 5).map(inv => {
                    const d = new Date(inv.date);
                    return `  ${d.toLocaleDateString('fr-BE', { day: '2-digit', month: '2-digit', year: '2-digit' })}: ${inv.amount.toFixed(2)}€ - ${inv.description}`;
                  }).join('\n')}${supplierInvoices.length > 5 ? `\n  ... et ${supplierInvoices.length - 5} autres` : ''}\n\n💡 Note: Ces dépenses proviennent des factures Billit (commissions déduites à la source).`
                };
                break;
              }
            } catch (error) {
              console.error('❌ Erreur lors de la vérification des factures Billit:', error);
            }

            // 📊 Si aucune facture Billit, vérifier s'il y a des paiements DE sa part (revenus)
            const supplierReceived = transactions.filter(tx =>
              tx.type === 'Credit' &&
              matchesSupplier(tx.description || '', args.supplier_name)
            );

            if (supplierReceived.length > 0) {
              const totalReceived = supplierReceived.reduce((sum, tx) => sum + tx.amount, 0);
              result = {
                supplier_name: args.supplier_name,
                period: `${startDate.toLocaleDateString('fr-BE')} - ${endDate.toLocaleDateString('fr-BE')}`,
                total_paid: 0,
                payment_count: 0,
                payments: [],
                currency: 'EUR',
                // 💡 INFORMATION CLÉ: C'est un partenaire de revenus (pas un fournisseur de dépenses)
                is_revenue_partner: true,
                total_received: totalReceived,
                received_count: supplierReceived.length,
                direct_response: `💰 ${args.supplier_name} est un **partenaire de revenus** (pas une dépense).\n\nVous avez reçu **${totalReceived.toFixed(2)}€** de ${args.supplier_name} sur cette période (${supplierReceived.length} versements).\n\nC'est un revenu, pas une dépense.`
              };
              break;
            }
          }

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
          // 🤖 Matching IA du fournisseur
          const matchedSupplier = await this.matchSupplierWithAI(args.supplier_name);
          args.supplier_name = matchedSupplier; // Remplacer par le nom exact

          // 🆕 Gérer period_text (parsing IA) - PRIORITÉ sur month/year
          let startDate: Date;
          let endDate: Date;

          if (args.period_text) {
            const period = await this.parsePeriodWithAI(args.period_text);
            if (period) {
              startDate = period.start;
              endDate = period.end;
              console.log(`✅ Période IA utilisée pour ${args.supplier_name} (reçus): ${period.description}`);
            } else {
              return JSON.stringify({ error: `Impossible de parser la période: ${args.period_text}` });
            }
          } else {
            // Logique existante pour month/year
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
          } else if (args.year) {
            // Année spécifique uniquement
            const targetYear = parseInt(args.year);
            startDate = new Date(targetYear, 0, 1);
            endDate = new Date(targetYear, 11, 31, 23, 59, 59);
          } else {
            // Par défaut: toutes les transactions disponibles (pour "dernier paiement", "total", etc.)
            startDate = new Date(2020, 0, 1);  // Date arbitraire dans le passé
            endDate = new Date();
          }
          }  // Fin du else pour logique existante (month/year)

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
          // 🎯 Gérer les filtres par montant
          const hasAmountFilter = args.min_amount !== undefined || args.max_amount !== undefined;

          if (hasAmountFilter) {
            // Récupérer toutes les factures et filtrer par montant
            const allInvoices = await this.billitClient.getInvoices({ limit: 120 });

            // Pagination pour récupérer toutes les factures si nécessaire
            let invoices = [...allInvoices];
            let page = 2;
            while (allInvoices.length === 120) {
              const nextPage = await this.billitClient.getInvoices({ limit: 120, page });
              if (nextPage.length === 0) break;
              invoices.push(...nextPage);
              page++;
              if (page > 10) break; // Sécurité
            }

            // Filtrer par montant ET par search_term (fournisseur) si fourni
            const { matchesSupplier } = await import('./supplier-aliases');
            const filteredInvoices = invoices.filter(inv => {
              const amount = inv.total_amount;
              if (args.min_amount !== undefined && amount < args.min_amount) return false;
              if (args.max_amount !== undefined && amount > args.max_amount) return false;
              // 🔧 FIX BUG #21: Filtrer aussi par fournisseur si search_term fourni
              if (args.search_term && !matchesSupplier(inv.supplier_name, args.search_term)) return false;
              return true;
            });

            result = {
              search_term: args.search_term || `montant ${args.min_amount || 0}+`,
              min_amount: args.min_amount,
              max_amount: args.max_amount,
              count: filteredInvoices.length,
              invoices: filteredInvoices.map(inv => ({
                supplier: inv.supplier_name,
                invoice_number: inv.invoice_number,
                amount: inv.total_amount,
                status: inv.status,
                date: inv.invoice_date,
              })),
              direct_response: filteredInvoices.length === 0
                ? `📋 Il n'y a pas de factures avec un montant ${args.min_amount ? `supérieur à ${args.min_amount} €` : args.max_amount ? `inférieur à ${args.max_amount} €` : ''}.`
                : `📋 **${filteredInvoices.length} facture${filteredInvoices.length > 1 ? 's' : ''} trouvée${filteredInvoices.length > 1 ? 's' : ''}**\n\n` +
                  filteredInvoices.map((inv, i) =>
                    `${i + 1}. ${inv.supplier_name} - ${inv.total_amount.toFixed(2).replace('.', ',')} € (${inv.invoice_number}) - ${new Date(inv.invoice_date).toLocaleDateString('fr-BE')}`
                  ).join('\n')
            };
          } else {
            // Recherche classique par terme
            const invoices = await this.billitClient.searchInvoices(args.search_term || '');
            result = {
              search_term: args.search_term || '',
              count: invoices.length,
              invoices: invoices.slice(0, 10).map(inv => ({
                supplier: inv.supplier_name,
                invoice_number: inv.invoice_number,
                amount: inv.total_amount,
                status: inv.status,
                date: inv.invoice_date,
              })),
            };
          }
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

        case 'get_user_guide': {
          // Envoyer le guide utilisateur complet en plusieurs parties
          const guideParts = [
            `📖 <b>GUIDE UTILISATEUR - PARTIE 1</b>

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

<b>📋 FACTURES</b>

<b>👤 Impayées et en retard</b>
• "Quelles factures sont impayées ?"
• "Donne-moi les factures en retard"
• "Combien de factures en retard ?"
• "Montre-moi les factures impayées"

<b>🔍 Recherche de factures</b>
• "Cherche les factures de Foster"
• "Trouve la facture 12345"
• "Factures de Coca-Cola"
• "Recherche facture SLG-2024-001"

<b>💰 Par montant</b>
• "Factures de plus de 3000€"
• "Factures moins de 500€"
• "Factures entre 1000 et 5000€"
• "Montre les factures supérieures à 10000€"

<b>📅 Par période</b>
• "Factures de novembre"
• "Factures de décembre 2025"
• "Factures entre octobre et décembre"

<b>📦 Plusieurs fournisseurs</b>
• "Factures de Colruyt et Sligro"
• "Donne-moi les factures Uber et Takeaway"
• "Factures Foster, Coca-Cola et Engie"`,

            `📖 <b>GUIDE UTILISATEUR - PARTIE 2</b>

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

<b>🏢 FOURNISSEURS</b>

<b>📊 Analyse des dépenses</b>
• "Analyse les dépenses chez Sligro"
• "Combien j'ai dépensé chez Colruyt ?"
• "Dépenses Foster pour l'année 2025"
• "Analyse Uber Eats en novembre"

<b>🏆 Classement</b>
• "Top 10 fournisseurs"
• "Top 5 des dépenses fournisseurs"
• "Les 10 fournisseurs les plus chers"
• "Classement des fournisseurs par dépenses"

<b>⚖️ Comparaison</b>
• "Compare Colruyt et Sligro"
• "Différence entre Makro et Metro"
• "Comparaison des dépenses chez Uber et Takeaway"

<b>📋 Liste</b>
• "Liste tous les fournisseurs"
• "Quels fournisseurs dans la base ?"
• "Montre-moi tous les fournisseurs"

<b>➕ Gestion</b>
• "Ajoute le fournisseur Delhaize"
• "Ajoute Colruyt avec l'alias Colryt, Colruyt SA"
• "Supprime le fournisseur Coca-Cola"`,

            `📖 <b>GUIDE UTILISATEUR - PARTIE 3</b>

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

<b>💵 SALAIRES</b>

<b>💰 Salaires d'un employé</b>
• "Salaire de Mokhlis Jamhoun"
• "Combien je paie à Soufiane ?"
• "Salaires de Lina"
• "Combien j'ai payé en salaire à Kalide Chami en 2025"

<b>📊 Analyse</b>
• "Analyse les salaires de décembre"
• "Salaires de novembre 2025"
• "Top 10 des salaires"
• "Les 5 employés les mieux payés"

<b>⚖️ Comparaison</b>
• "Compare les salaires de Mokhlis et Soufiane"
• "Différence entre Lina et Tag Lina"
• "Compare Kalide, Mokhlis et Soufiane"

<b>📍 Classement</b>
• "Où se situe Mokhlis par rapport aux autres ?"
• "Quel est le classement de Soufiane ?"
• "Position de Lina parmi les employés"

<b>📅 Par période</b>
• "Salaires entre octobre et décembre"
• "Salaires du premier trimestre 2025"
• "Analyse des salaires de 2025"`,

            `📖 <b>GUIDE UTILISATEUR - PARTIE 4</b>

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

<b>📊 ANALYSE PAR CATÉGORIE</b>

<b>🏷️ Toutes les catégories</b>
• "Analyse mes dépenses par catégorie"
• "Montre-moi mes dépenses par catégorie"
• "Répartition de mes dépenses"
• "Aperçu de toutes mes dépenses"

<b>⚡ Utilities (Électricité, Gaz, Eau)</b>
• "Combien j'ai dépensé en utilities ?"
• "Analyse mes utilities le mois dernier"
• "Dépenses d'électricité sur 3 mois"
• "Consommation gaz et eau"

<b>🏠 Loyers et charges fixes</b>
• "Montre-moi mes loyers"
• "Analyse mes loyers et charges fixes"
• "Dépenses de loyer cette année"

<b>🍔 Alimentation</b>
• "Dépenses d'alimentation"
• "Combien je dépense en alimentation par mois ?"
• "Analyse des achats alimentaires"

<b>📱 Télécom et Internet</b>
• "Dépenses télécom"
• "Factures internet et téléphone"

<b>🔒 Assurances</b>
• "Dépenses d'assurances"
• "Combien coûtent mes assurances"

<b>💼 Salaires</b>
• "Analyse des salaires par catégorie"
• "Total des salaires du mois"

<b>📈 Évolution et comparaisons</b>
• "Compare mes dépenses avec l'an dernier"
• "Évolution des dépenses sur 6 mois"
• "Tendance de mes utilities"`,

            `📖 <b>GUIDE UTILISATEUR - PARTIE 5</b>

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

<b>🏦 BANQUE</b>

<b>💳 Transactions</b>
• "Montre les dernières transactions"
• "Derniers paiements bancaires"
• "Transactions d'hier"
• "Paiements de cette semaine"

<b>🏦 Soldes</b>
• "Balance du mois de décembre"
• "Solde actuel du compte Europabank"
• "Soldes de tous les comptes"
• "Balance de novembre 2025"

<b>📊 Analyse</b>
• "Total des dépenses du mois"
• "Résumé des dépenses de 2025"
• "Analyse des transactions bancaires"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

<b>💡 CONSEILS</b>
• Utilisez "et" pour plusieurs fournisseurs
• Précisez l'année si nécessaire
• Vous pouvez envoyer des messages vocaux !`
          ];

          result = {
            guide_parts: guideParts,
            total_parts: guideParts.length,
            direct_response: `📖 Envoi du guide utilisateur en ${guideParts.length} parties...`
          };
          break;
        }

        case 'analyze_expenses_by_category': {
          try {
            console.log('📊 analyze_expenses_by_category: Analyse des dépenses par catégorie');

            const category = args.category as ExpenseCategoryType | 'tout' | undefined;
            const months = (args.months as number) || 6;
            const compareWithPrevious = args.compare_with_previous as boolean || false;

            // Initialiser le catégoriseur
            const categorizer = new ExpenseCategorizer();

            // Calculer la période d'analyse
            const now = new Date();
            const startDate = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
            const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

            console.log(`📅 Période d'analyse: ${startDate.toLocaleDateString('fr-BE')} au ${endDate.toLocaleDateString('fr-BE')}`);

            // Récupérer toutes les factures
            const allInvoices = await this.billitClient.getInvoices({ limit: 120 });
            const invoicesInPeriod = allInvoices.filter(inv => {
              const invDate = new Date(inv.invoice_date);
              return invDate >= startDate && invDate <= endDate;
            });

            console.log(`📄 ${invoicesInPeriod.length} factures dans la période`);

            // Catégoriser chaque facture
            const categoryData: { [key: string]: { total: number; count: number; suppliers: Set<string>; monthly: { [key: string]: number } } } = {};

            for (const invoice of invoicesInPeriod) {
              const categorization = categorizer.categorizeSupplier(invoice.supplier_name);
              const catKey = categorization.category;

              if (!categoryData[catKey]) {
                categoryData[catKey] = {
                  total: 0,
                  count: 0,
                  suppliers: new Set(),
                  monthly: {},
                };
              }

              categoryData[catKey].total += invoice.total_amount;
              categoryData[catKey].count += 1;
              categoryData[catKey].suppliers.add(invoice.supplier_name);

              // Par mois
              const monthKey = `${new Date(invoice.invoice_date).getFullYear()}-${String(new Date(invoice.invoice_date).getMonth() + 1).padStart(2, '0')}`;
              categoryData[catKey].monthly[monthKey] = (categoryData[catKey].monthly[monthKey] || 0) + invoice.total_amount;
            }

            // Filtrer par catégorie si demandé
            const categoriesToShow = category && category !== 'tout' ? [category] : Object.keys(categoryData);

            // Préparer le résultat
            const analysis: any = {
              period: {
                start: startDate.toISOString().split('T')[0],
                end: endDate.toISOString().split('T')[0],
                months: months,
              },
              categories: [],
              total_expenses: 0,
            };

            for (const catKey of categoriesToShow) {
              const cat = categoryData[catKey];
              const categoryInfo = categorizer.getCategory(catKey as ExpenseCategoryType);

              if (!cat || cat.count === 0) continue;

              // Calculer la tendance
              const monthKeys = Object.keys(cat.monthly).sort();
              const trend = monthKeys.length >= 2
                ? (cat.monthly[monthKeys[monthKeys.length - 1]] || 0) > (cat.monthly[monthKeys[0]] || 0)
                  ? 'up'
                  : (cat.monthly[monthKeys[monthKeys.length - 1]] || 0) < (cat.monthly[monthKeys[0]] || 0)
                    ? 'down'
                    : 'stable'
                : 'stable';

              const categoryResult: any = {
                id: catKey,
                name: categoryInfo?.name || catKey,
                description: categoryInfo?.description || '',
                total: Math.round(cat.total * 100) / 100,
                count: cat.count,
                average: Math.round((cat.total / cat.count) * 100) / 100,
                type: categoryInfo?.type || 'variable',
                frequency: categoryInfo?.frequency || 'ponctuel',
                suppliers: Array.from(cat.suppliers).slice(0, 10),
                monthly_breakdown: cat.monthly,
                trend: trend,
              };

              // Calculer l'évolution en %
              if (monthKeys.length >= 2) {
                const firstMonth = cat.monthly[monthKeys[0]] || 0;
                const lastMonth = cat.monthly[monthKeys[monthKeys.length - 1]] || 0;
                if (firstMonth > 0) {
                  categoryResult.evolution_percent = Math.round(((lastMonth - firstMonth) / firstMonth) * 100);
                }
              }

              analysis.categories.push(categoryResult);
              analysis.total_expenses += cat.total;
            }

            // Trier par montant décroissant
            analysis.categories.sort((a: any, b: any) => b.total - a.total);

            // Comparaison avec période précédente si demandé
            if (compareWithPrevious && months <= 12) {
              const prevStartDate = new Date(startDate.getFullYear() - 1, startDate.getMonth(), 1);
              const prevEndDate = new Date(endDate.getFullYear() - 1, endDate.getMonth(), endDate.getDate());

              const prevInvoices = allInvoices.filter(inv => {
                const invDate = new Date(inv.invoice_date);
                return invDate >= prevStartDate && invDate <= prevEndDate;
              });

              const prevCategoryData: { [key: string]: number } = {};
              for (const invoice of prevInvoices) {
                const categorization = categorizer.categorizeSupplier(invoice.supplier_name);
                prevCategoryData[categorization.category] = (prevCategoryData[categorization.category] || 0) + invoice.total_amount;
              }

              analysis.comparison = {
                previous_period: {
                  start: prevStartDate.toISOString().split('T')[0],
                  end: prevEndDate.toISOString().split('T')[0],
                },
                categories: analysis.categories.map((cat: any) => ({
                  id: cat.id,
                  name: cat.name,
                  current: cat.total,
                  previous: Math.round((prevCategoryData[cat.id] || 0) * 100) / 100,
                  difference: Math.round((cat.total - (prevCategoryData[cat.id] || 0)) * 100) / 100,
                  percent: prevCategoryData[cat.id] > 0
                    ? Math.round(((cat.total - prevCategoryData[cat.id]) / prevCategoryData[cat.id]) * 100)
                    : null,
                })),
              };
            }

            result = {
              success: true,
              analysis: analysis,
            };
          } catch (error: any) {
            console.error('❌ Erreur analyze_expenses_by_category:', error);
            result = {
              success: false,
              error: 'analysis_error',
              message: `Erreur lors de l'analyse des dépenses: ${error.message}`,
            };
          }
          break;
        }

        case 'get_all_invoices': {
          // Récupérer TOUTES les factures (toutes périodes confondues)
          console.log('🔄 Récupération de TOUTES les factures (pagination complète)...');
          
          const allInvoices: any[] = [];
          let skip = 0;
          const pageSize = 120;
          let hasMore = true;

          while (hasMore) {
            const page = await this.billitClient.getInvoices({ limit: pageSize, skip });
            if (page.length === 0) {
              hasMore = false;
              break;
            }
            allInvoices.push(...page);
            if (page.length < pageSize) {
              hasMore = false;
            } else {
              skip += pageSize;
            }
          }

          console.log(`✅ ${allInvoices.length} facture(s) récupérée(s) (toutes périodes)`);

          const paid = allInvoices.filter(inv =>
            inv.status.toLowerCase().includes('paid') || inv.status.toLowerCase().includes('payé')
          );
          const unpaid = allInvoices.filter(inv =>
            !inv.status.toLowerCase().includes('paid') && !inv.status.toLowerCase().includes('payé')
          );

          result = {
            period: 'Toutes périodes',
            total_invoices: allInvoices.length,
            paid_count: paid.length,
            paid_amount: paid.reduce((sum, inv) => sum + inv.total_amount, 0),
            unpaid_count: unpaid.length,
            unpaid_amount: unpaid.reduce((sum, inv) => sum + inv.total_amount, 0),
            total_amount: allInvoices.reduce((sum, inv) => sum + inv.total_amount, 0),
            paid_invoices: paid.map(inv => ({
              supplier: inv.supplier_name,
              amount: inv.total_amount,
              invoice_number: inv.invoice_number,
              date: inv.invoice_date,
            })),
            unpaid_invoices: unpaid.map(inv => ({
              supplier: inv.supplier_name,
              amount: inv.total_amount,
              invoice_number: inv.invoice_number,
              date: inv.invoice_date,
            })),
            currency: 'EUR',
          };
          break;
        }

        case 'get_supplier_invoices': {
          // 🔧 NOUVEAU: Récupérer les factures d'un fournisseur spécifique (avec filtrage mois/année optionnel)
          console.log('🔧 Exécution: get_supplier_invoices', args);
          
          // 🤖 Matching IA du fournisseur
          const matchedSupplier = await this.matchSupplierWithAI(args.supplier_name);
          console.log(`🤖 Fournisseur matché: "${args.supplier_name}" → "${matchedSupplier}"`);
          
          // Pagination complète
          console.log('🔄 Récupération de TOUTES les factures (pagination complète)...');
          let allInvoices: any[] = [];
          let skip = 0;
          const pageSize = 120;
          
          while (true) {
            const batch = await this.billitClient.getInvoices({ 
              limit: pageSize,
              skip: skip
            });
            allInvoices = allInvoices.concat(batch);
            if (batch.length < pageSize) break;
            skip += pageSize;
          }
          console.log(`✓ ${allInvoices.length} facture(s) récupérées`);
          
          // Filtrer par fournisseur (fuzzy matching avec matchesSupplier)
          const { matchesSupplier } = await import('./supplier-aliases');
          const supplierInvoices = allInvoices.filter(inv => 
            matchesSupplier(inv.supplier_name || '', matchedSupplier)
          );
          
          console.log(`✓ ${supplierInvoices.length} facture(s) pour "${matchedSupplier}"`);
          
          // Filtrer par mois/année si demandé
          let filteredInvoices = supplierInvoices;
          let periodLabel = 'Toutes périodes';

          if (args.month) {
            const monthMap: { [key: string]: number } = {
              'janvier': 0, 'fevrier': 1, 'février': 1, 'mars': 2, 'avril': 3,
              'mai': 4, 'juin': 5, 'juillet': 6, 'aout': 7, 'août': 7,
              'septembre': 8, 'octobre': 9, 'novembre': 10, 'decembre': 11, 'décembre': 11,
            };

            const targetMonth = monthMap[args.month.toLowerCase()] ?? parseInt(args.month) - 1;
            const targetYear = args.year ? parseInt(args.year) : new Date().getFullYear();

            filteredInvoices = supplierInvoices.filter(inv => {
              const invDate = new Date(inv.invoice_date);
              return invDate.getFullYear() === targetYear && invDate.getMonth() === targetMonth;
            });

            periodLabel = `${args.month} ${targetYear}`;
            console.log(`✓ Filtrage période: ${supplierInvoices.length} → ${filteredInvoices.length} factures pour ${periodLabel}`);
          } else if (args.year) {
            // 🔧 FIX: Filtrage par ANNÉE seule (ex: "factures de foster pour 2025")
            const targetYear = parseInt(args.year);

            filteredInvoices = supplierInvoices.filter(inv => {
              const invDate = new Date(inv.invoice_date);
              return invDate.getFullYear() === targetYear;
            });

            periodLabel = `année ${targetYear}`;
            console.log(`✓ Filtrage période: ${supplierInvoices.length} → ${filteredInvoices.length} factures pour ${periodLabel}`);
          }
          
          // Séparer payées / impayées
          const paid = filteredInvoices.filter(inv =>
            inv.status.toLowerCase().includes('paid') || inv.status.toLowerCase().includes('payé')
          );
          const unpaid = filteredInvoices.filter(inv =>
            !inv.status.toLowerCase().includes('paid') && !inv.status.toLowerCase().includes('payé')
          );
          
          result = {
            supplier: matchedSupplier,
            period: periodLabel,
            total_invoices: filteredInvoices.length,
            paid_count: paid.length,
            paid_amount: paid.reduce((sum, inv) => sum + inv.total_amount, 0),
            unpaid_count: unpaid.length,
            unpaid_amount: unpaid.reduce((sum, inv) => sum + inv.total_amount, 0),
            total_amount: filteredInvoices.reduce((sum, inv) => sum + inv.total_amount, 0),
            paid_invoices: paid.map(inv => ({
              supplier: inv.supplier_name,
              amount: inv.total_amount,
              invoice_number: inv.invoice_number,
              date: inv.invoice_date,
            })),
            unpaid_invoices: unpaid.map(inv => ({
              supplier: inv.supplier_name,
              amount: inv.total_amount,
              invoice_number: inv.invoice_number,
              date: inv.invoice_date,
            })),
            currency: 'EUR',
          };
          break;
        }

        case 'get_monthly_invoices': {
          // 🔧 FIX: Pagination complète
          console.log('🔄 Récupération de TOUTES les factures (pagination)...');
          let allInvoices: any[] = [];
          let skip = 0;
          const pageSize = 120;
          
          while (true) {
            const batch = await this.billitClient.getInvoices({ 
              limit: pageSize,
              skip: skip
            });
            allInvoices = allInvoices.concat(batch);
            if (batch.length < pageSize) break;
            skip += pageSize;
          }
          console.log(`✓ ${allInvoices.length} facture(s) récupérées`);
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
            paid_invoices: paid.map(inv => ({
              supplier: inv.supplier_name,
              amount: inv.total_amount,
              invoice_number: inv.invoice_number,
              date: inv.invoice_date,
            })),
            unpaid_invoices: unpaid.map(inv => ({
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

          // Construire les dates de début et fin du mois
          const startDate = new Date(targetYear, targetMonth, 1);
          const endDate = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59); // Dernier jour du mois

          // 🔧 FIX BUG #26: Pagination complète pour récupérer toutes les factures
          console.log('🔄 Récupération de TOUTES les factures (pagination complète)...');
          
          let allInvoices: any[] = [];
          let skip = 0;
          const pageSize = 120;
          
          while (true) {
            const batch = await this.billitClient.getInvoices({ 
              limit: pageSize,
              skip: skip
            });
            
            console.log(`  ↳ Page ${Math.floor(skip/pageSize) + 1}: ${batch.length} facture(s)`);
            allInvoices = allInvoices.concat(batch);
            
            if (batch.length < pageSize) break;
            skip += pageSize;
          }
          
          console.log(`✓ ${allInvoices.length} facture(s) TOTALES récupérées via pagination`);
          
          const monthInvoices = allInvoices.filter(inv => {
            const invDate = new Date(inv.invoice_date);
            return invDate.getFullYear() === targetYear && 
                   invDate.getMonth() === targetMonth;
          });
          
          console.log(`✓ Filtrage mois: ${allInvoices.length} → ${monthInvoices.length} factures pour ${new Date(targetYear, targetMonth).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}`);

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
            paid_invoices: paid.map(inv => ({
              supplier: inv.supplier_name,
              amount: inv.total_amount,
              invoice_number: inv.invoice_number,
              date: inv.invoice_date,
            })),
            unpaid_invoices: unpaid.map(inv => ({
              supplier: inv.supplier_name,
              amount: inv.total_amount,
              invoice_number: inv.invoice_number,
              date: inv.invoice_date,
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

        // 🚀 OUTIL 10: Système d'alertes personnalisées
        case 'create_alert': {
          // Créer une alerte personnalisée
          try {
            const userId = this.chatId || '0';
            const { type, threshold, description } = args;

            // Validation
            if (!type || !threshold) {
              result = {
                success: false,
                error: 'missing_params',
                message: '❌ Paramètres manquants. Type et seuil requis.',
              };
              break;
            }

            const validTypes = ['unpaid_threshold', 'overdue_count', 'balance_below', 'large_expense'];
            if (!validTypes.includes(type)) {
              result = {
                success: false,
                error: 'invalid_type',
                message: `❌ Type invalide. Types acceptés : ${validTypes.join(', ')}`,
              };
              break;
            }

            const alert = this.alertService.createAlert(userId, type, threshold, description);

            const typeLabels = {
              unpaid_threshold: '💰 Factures impayées',
              overdue_count: '⏰ Factures en retard',
              balance_below: '📊 Balance bancaire',
              large_expense: '💸 Dépense importante'
            };

            const formattedMessage = `✅ Alerte créée avec succès !\n\n` +
              `🔔 Type : ${typeLabels[type as keyof typeof typeLabels]}\n` +
              `📈 Seuil : ${threshold}${type.includes('count') ? ' factures' : '€'}\n` +
              `📝 Description : ${alert.description}\n` +
              `🆔 ID : <code>${alert.id}</code>\n\n` +
              `💡 L'alerte est maintenant active et vous préviendra automatiquement.`;

            result = {
              success: true,
              alert_id: alert.id,
              direct_response: formattedMessage,
              message: formattedMessage,
            };
          } catch (error: any) {
            result = {
              success: false,
              error: 'creation_failed',
              message: `❌ Erreur lors de la création de l'alerte : ${error.message}`,
            };
          }
          break;
        }

        case 'list_alerts': {
          // Lister les alertes de l'utilisateur
          try {
            const userId = this.chatId || '0';
            const activeOnly = args.active_only !== false; // Par défaut: true

            const alerts = activeOnly
              ? this.alertService.listActiveAlerts(userId)
              : this.alertService.listAlerts(userId);

            if (alerts.length === 0) {
              result = {
                success: false,
                error: 'no_alerts',
                message: activeOnly
                  ? '❌ Vous n\'avez aucune alerte active.'
                  : '❌ Vous n\'avez aucune alerte configurée.',
              };
              break;
            }

            const typeLabels = {
              unpaid_threshold: '💰 Factures impayées',
              overdue_count: '⏰ Factures en retard',
              balance_below: '📊 Balance bancaire',
              large_expense: '💸 Dépense importante'
            };

            const alertsList = alerts.map((alert, index) => {
              const status = alert.enabled ? '🟢' : '🔴';
              const type = typeLabels[alert.type as keyof typeof typeLabels];
              const threshold = `${alert.threshold}${alert.type.includes('count') ? ' factures' : '€'}`;
              return `${index + 1}. ${status} ${type}\n   Seuil : ${threshold}\n   ID : <code>${alert.id}</code>`;
            }).join('\n\n');

            const formattedMessage = `🔔 Vos alertes ${activeOnly ? 'actives' : ''} (${alerts.length})\n\n${alertsList}`;

            result = {
              success: true,
              alerts_count: alerts.length,
              direct_response: formattedMessage,
              message: formattedMessage,
            };
          } catch (error: any) {
            result = {
              success: false,
              error: 'list_failed',
              message: `❌ Erreur lors de la récupération des alertes : ${error.message}`,
            };
          }
          break;
        }

        case 'delete_alert': {
          // Supprimer une alerte
          try {
            const userId = this.chatId || '0';
            const { alert_id } = args;

            if (!alert_id) {
              result = {
                success: false,
                error: 'missing_alert_id',
                message: '❌ Veuillez spécifier l\'ID de l\'alerte à supprimer.',
              };
              break;
            }

            const deleted = this.alertService.deleteAlert(userId, alert_id);

            if (!deleted) {
              result = {
                success: false,
                error: 'not_found',
                message: `❌ Alerte introuvable avec l'ID : ${alert_id}`,
              };
              break;
            }

            const formattedMessage = `✅ Alerte supprimée avec succès !\n\n🆔 ID : <code>${alert_id}</code>`;

            result = {
              success: true,
              direct_response: formattedMessage,
              message: formattedMessage,
            };
          } catch (error: any) {
            result = {
              success: false,
              error: 'deletion_failed',
              message: `❌ Erreur lors de la suppression de l'alerte : ${error.message}`,
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

      // 🔍 DÉTECTION SIMPLIFIÉE: Ajouter des hints pour guider l'IA
      const questionLower = question.toLowerCase();

      // 🔍 DÉTECTION CRITIQUE: "toutes les factures" SANS mention de période
      const allInvoicesPattern = /(?:toutes?\s+les?\s+factures?|liste\s+(?:complète|toutes?\s+les?\s+)?factures?)/i;
      const hasPeriodMention = /(?:janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre|mois|année|trimestre|semaine)/i;
      
      if (allInvoicesPattern.test(question) && !hasPeriodMention.test(question)) {
        console.log('🔍 Détection: Toutes les factures sans période - ajout hint pour get_all_invoices');
        question = `[HINT: CRITIQUE - L'utilisateur demande TOUTES les factures SANS spécifier de période. Tu DOIS utiliser get_all_invoices (PAS get_monthly_invoices qui limite au mois courant). Retourne TOUTES les factures de toutes les périodes.] ${question}`;
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
            question = `[HINT: CRITIQUE - L'utilisateur demande les factures d'un FOURNISSEUR SPÉCIFIQUE pour un MOIS. Tu DOIS utiliser get_supplier_invoices avec supplier_name="${supplier}" et month="${period}". Cet outil retourne TOUTES les factures du fournisseur (payées ET impayées) pour la période demandée.] ${question}`;
          } else {
            console.log(`🔍 Détection: Factures fournisseur ("${supplier}") - ajout hint pour get_supplier_invoices`);
            question = `[HINT: CRITIQUE - L'utilisateur demande les factures d'un FOURNISSEUR SPÉCIFIQUE. Tu DOIS utiliser get_supplier_invoices avec supplier_name="${supplier}". Cet outil retourne TOUTES les factures du fournisseur (toutes périodes).] ${question}`;
          }
        }
      }
      
      // 🔍 DÉTECTION CRITIQUE: "factures [statut] [fournisseur] [période]"
      // Ex: "factures impayées de Ciers de décembre"
      else {
        const invoicesSupplierPeriodPattern = /factures?\s+(?:payées?|impayées?)\s+(?:de|d'|du|chez)\s+[a-zàâäéèêëïîôùûüç\s-]+\s+(?:de|du|d')\s*(?:mois\s+de\s+)?(\w+)/i;
        if (invoicesSupplierPeriodPattern.test(question)) {
          console.log('🔍 Détection: Factures [statut] [fournisseur] [période] - ajout hint pour get_supplier_invoices');
          question = `[HINT: CRITIQUE - L'utilisateur demande une LISTE de factures (pas une analyse) d'un fournisseur spécifique pour un mois donné. Tu DOIS utiliser get_supplier_invoices avec supplier_name et month. NE PAS utiliser analyze_supplier_expenses qui est pour les ANALYSES globales.] ${question}`;
        } else {
          // Fallback: "factures du mois de X" (sans fournisseur spécifique)
          const invoicesByPeriodPattern = /factures?\s+(?:(?:payées?|impayées?)\s+)?(?:du|de|d')\s*(?:mois\s+de\s+)?(\w+)/i;
          if (invoicesByPeriodPattern.test(question) && hasPeriodMention.test(question)) {
            console.log('🔍 Détection: Factures d\'un mois spécifique - ajout hint pour get_invoices_by_month');
            question = `[HINT: CRITIQUE - L'utilisateur demande les factures d'un MOIS SPÉCIFIQUE (payées, impayées, ou les deux). Tu DOIS utiliser get_invoices_by_month avec le mois demandé (PAS get_recent_invoices, PAS get_unpaid_invoices). L'outil get_invoices_by_month retourne les factures payées ET impayées du mois demandé.] ${question}`;
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
        question = `[HINT: Cette question nécessite compare_employee_salaries, pas get_employee_salaries] ${question}`;
      }

      // 🔍 DÉTECTION CRITIQUE: "analyse du salaire" ou "analyse des salaires"
      // L'IA peut confondre avec analyze_expenses_by_category
      const salaryAnalysisPattern = /analyse\s+(?:du\s+|des\s+)?salaire/i;
      if (salaryAnalysisPattern.test(question)) {
        console.log('🔍 Détection: Analyse des salaires - redirection vers get_employee_salaries');
        question = `[HINT: CRITIQUE - L'utilisateur demande une analyse des SALAIRES EMPLOYÉS. Tu DOIS utiliser get_employee_salaries (pas analyze_expenses_by_category). Retourner l'analyse détaillée avec total, nombre de paiements, et répartition par employé/mois.] ${question}`;
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
          question = `[HINT: CRITIQUE - L'utilisateur demande des informations sur PLUSIEURS fournisseurs: "${supplier1}" et "${supplier2}". Tu DOIS utiliser analyze_supplier_expenses avec supplier_name contenant TOUS les fournisseurs en une seule fois, séparés par " et ". Exemple: {supplier_name: "${supplier1} et ${supplier2}"}. NE PAS faire d'appels séparés.] ${question}`;
        }
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
        question = `[HINT: L'utilisateur demande le top ${topNumber} des fournisseurs par dépenses. Utiliser get_supplier_ranking avec limit=${topNumber} pour obtenir le classement. NE PAS utiliser analyze_supplier_expenses ni get_period_transactions.] ${question}`;
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
          question = `[HINT: CRITIQUE - Catégorie "${categoryName}" détectée. L'utilisateur veut voir TOUS les fournisseurs de cette catégorie (pas un seul fournisseur).
APPEL EXACT: analyze_supplier_expenses avec {category: "${categoryName}"} - NE PAS mettre supplier_name!
Exemple JSON: {"category": "${categoryName}", "include_details": true}
Cela affichera tous les fournisseurs de cette catégorie (Foster, Colruyt, Sligro, etc. pour alimentation).] ${question}`;
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
        question = `[HINT: CRITIQUE - L'utilisateur demande les ${limit} DERNIÈRES FACTURES (pas une analyse). Tu DOIS utiliser get_last_n_invoices avec limit=${limit}. NE PAS utiliser analyze_supplier_expenses ni get_period_transactions. Si un fournisseur est mentionné, l'ajouter au paramètre supplier_name.] ${question}`;
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
        question = `[HINT: L'utilisateur demande les balances de ${mentionedMonths.length} mois (${mentionedMonths.join(', ')}). Utiliser get_monthly_summaries avec la liste des mois mentionnés (format YYYY-MM). NE PAS utiliser get_period_transactions car l'utilisateur veut un résumé par mois sans liste détaillée des transactions.] ${question}`;
      }

      // Détection de recettes multi-mois (ex: "recettes des 3 derniers mois", "recettes d'octobre et novembre")
      if (hasRevenuesKeyword && (hasMultipleMonths || questionLower.match(/\d+\s*(derniers?|précédents?)\s*mois/))) {
        console.log(`🔍 Détection: Recettes multi-mois - ajout d'un hint pour l'IA`);
        question = `[HINT: L'utilisateur demande les recettes de PLUSIEURS mois. Utiliser get_multi_month_revenues avec la liste des mois concernés (format YYYY-MM). NE PAS utiliser get_period_transactions.] ${question}`;
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
        question = `[HINT: CRITIQUE - L'utilisateur demande le BÉNÉFICE/RÉSULTAT pour l'année ${year}.
⚠️⚠️⚠️ Tu DOIS utiliser get_year_summary avec:
- year: "${year}"
- include_comparison: true (comparer avec ${parseInt(year) - 1})
⚠️⚠️⚠️ NE PAS utiliser get_period_transactions (trop basique, pas pédagogique)
⚠️⚠️⚠️ La réponse doit être en format NOVICE-FRIENDLY avec:
- Explications claires: "Recettes (argent reçu)", "Dépenses (argent dépensé)"
- Calcul visible: "BÉNÉFICE NET = Recettes - Dépenses"
- Top 10 fournisseurs avec %
- Répartition par catégorie
- Message pédagogique: "Vous avez gagné X € sur l'année"
] ${question}`;
      }

      // ========== DÉTECTION DE LA DERNIÈRE TRANSACTION ==========
      // Détection de demande de la dernière transaction ou dernières transactions bancaires
      const lastTransactionPattern = /(?:dernière|dernier|le? derni[eè]re?|plus?[ -]r[eé]cente?).*?(?:transaction|paiement|op[eé]ration)|transaction.*?(?:derni[eè]re?|r[eé]cente?|effectu[ée]e?)/i;
      if (lastTransactionPattern.test(question) && !questionLower.includes('facture')) {
        console.log('🔍 Détection: Dernière transaction bancaire demandée - ajout d\'un hint pour l\'IA');
        question = `[HINT: CRITIQUE - L'utilisateur demande la dernièRE transaction bancaire (pas une facture, pas une balance).
Tu DOIS utiliser get_period_transactions avec:
- start_date: Utilise la date d'hier ou une date récente (ex: 2026-01-03)
- end_date: Utilise la date d'aujourd'hui (ex: 2026-01-04)
- limit: 10 (pour récupérer les 10 dernières transactions)
- offset: 1 (première page)
- NE PAS utiliser de filtre_type
- Affiche SEULEMENT la première transaction (la plus récente) avec sa date, montant, description et type.
] ${question}`;
      }

      // ========== DÉTECTION DE LA PAGINATION ==========
      // Détecte quand l'utilisateur demande la page suivante des transactions
      const paginationPattern = /(suivantes|suite|continue|page suivante|autre page|ensuite|suivante)/i;
      if (paginationPattern.test(question)) {
        console.log('🔍 Détection: Demande de pagination');
        question = `[HINT: PAGINATION - L'utilisateur veut la page SUIVANTE.
Cherche EXACTEMENT le pattern "📄 Page X/Y" dans ta dernière réponse (X est le numéro de page actuel).
Utilise get_period_transactions avec offset: X+1.
Exemples: "📄 Page 1/11" → offset: 2 | "📄 Page 5/11" → offset: 6
IMPORTANT: Garde les mêmes start_date et end_date.] ${question}`;
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
- Format naturel`,
        },
        // NIVEAU 2: Utiliser l'historique par utilisateur (avec résumé intelligent si disponible)
        ...this.conversationManager.getFormattedHistory(userId),
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
              await this.telegramBot.sendMessage(guideParts[i]);
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

            // Supprimer tous les ** du texte
            return directResponse.replace(/\*\*/g, '');
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

          // Supprimer tous les ** du texte
          return message.content.replace(/\*\*/g, '');
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

  isConfigured(): boolean {
    return !!config.groq.apiKey && config.groq.apiKey.length > 0;
  }
}
