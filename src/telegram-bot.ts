import TelegramBot from 'node-telegram-bot-api';
import { config } from './config';
import { isUserAuthorized, getAllAuthorizedUsers } from './database';
import { CommandHandler } from './command-handler';
import { VoiceService } from './voice-service';
import { IntentService } from './intent-service';
import { AIConversationService } from './ai-conversation-service';
import { AIAgentService } from './ai-agent-service';
import { AIAgentServiceV2 } from './ai-agent-service-v2';
import { InvoiceMonitoringService } from './invoice-monitoring-service';
import { sanitizeError, logUnauthorizedAccess, logSuspiciousActivity, sanitizeUrl } from './utils/security';
import { validateUserInput, sanitizeArgs } from './utils/validation';
import { RateLimiterManager, RateLimiterFactory } from './utils/rate-limiter';
import { StreamingResponseFactory } from './utils/streaming-response';
import { ProgressMessages } from './utils/progress-messages';
import { DataValidator, AIResponseGuard } from './utils/data-validator';
import { TelegramPaginationFactory } from './utils/telegram-pagination';
import { logInfo, logDebug, logError as logErrorUtil } from './utils/logger';
import { globalMetrics } from './monitoring/bot-metrics';
import fs from 'fs';
import path from 'path';

export class TelegramBotInteractive {
  private bot: TelegramBot;
  private commandHandler: CommandHandler;
  private chatId: string;
  private currentChatId: string | number; // Chat ID de l'utilisateur actuel
  private waitingForInput: string | null = null; // Pour mémoriser l'état de la conversation
  private lastInvoiceNumber: string | null = null; // Mémoriser la dernière facture consultée
  private voiceService: VoiceService;
  private intentService: IntentService;
  private aiConversationService: AIConversationService;
  private aiAgentService: AIAgentServiceV2; // Version V2 améliorée
  private invoiceMonitoringService: InvoiceMonitoringService;
  private rateLimitManager: RateLimiterManager;

  constructor(commandHandler: CommandHandler) {
    this.bot = new TelegramBot(config.telegram.botToken, { 
      polling: {
        interval: 300,
        autoStart: true,
        params: {
          timeout: 10
        }
      }
    });
    this.commandHandler = commandHandler;
    this.chatId = config.telegram.chatId;
    this.currentChatId = this.chatId; // Par défaut, utilise le chatId du propriétaire
    this.voiceService = new VoiceService();
    this.intentService = new IntentService();
    this.aiConversationService = new AIConversationService(commandHandler);
    this.aiAgentService = new AIAgentServiceV2(commandHandler, this.bot); // V2 avec synthèse améliorée + bot Telegram

    // Initialiser le service de monitoring des factures
    this.invoiceMonitoringService = new InvoiceMonitoringService(
      this,
      commandHandler.getBillitClient(),
      {
        enabled: process.env.INVOICE_MONITORING_ENABLED === 'true',
        intervalMinutes: parseInt(process.env.INVOICE_MONITORING_INTERVAL || '5', 10),
        checkPaid: process.env.INVOICE_MONITORING_CHECK_PAID !== 'false', // true par défaut
        checkUnpaid: process.env.INVOICE_MONITORING_CHECK_UNPAID !== 'false', // true par défaut
        storageFile: process.env.INVOICE_MONITORING_STORAGE || './data/processed-invoices.json',
      }
    );

    // Initialiser le rate limiter
    this.rateLimitManager = new RateLimiterManager();
    this.setupRateLimiters();

    console.log('🔧 Configuration du bot Telegram...');
    console.log('   Chat ID:', this.chatId);
    console.log('   Reconnaissance vocale:', this.voiceService.isConfigured() ? '✅ Activée' : '❌ Désactivée');
    console.log('   Compréhension IA (vocaux):', this.intentService.isConfigured() ? '✅ Activée' : '❌ Désactivée');
    console.log('   Conversation IA (ancien):', this.aiConversationService.isConfigured() ? '✅ Activée' : '❌ Désactivée');
    console.log('   🆕 Agent IA autonome V2:', this.aiAgentService.isConfigured() ? '✅ Activé (synthèse améliorée)' : '❌ Désactivé');
    console.log('   Monitoring factures:', this.invoiceMonitoringService['config'].enabled ? '✅ Activé' : '❌ Désactivé');
    console.log('   Rate limiting:', '✅ Activé');

    this.setupHandlers();
  }

  /**
   * Configure les rate limiters pour différentes catégories
   */
  private setupRateLimiters(): void {
    this.rateLimitManager.register('general', RateLimiterFactory.createDefault());
    this.rateLimitManager.register('ai', RateLimiterFactory.createForAI());
    this.rateLimitManager.register('voice', RateLimiterFactory.createForVoice());
  }

  /**
   * Configure les gestionnaires d'événements
   */
  private setupHandlers(): void {
    // IMPORTANT: Gérer les callbacks des boutons EN PREMIER
    this.bot.on('callback_query', async (callbackQuery) => {
      console.log('🔘 Callback reçu:', callbackQuery.data);

      const msg = callbackQuery.message;
      const data = callbackQuery.data;

      // SÉCURITÉ: Vérifier que le message vient d'un chat autorisé (base de données)
      if (msg && !isUserAuthorized(String(msg.chat.id))) {
        console.log(`⚠️  Callback ignoré d'un chat non autorisé: ${msg.chat.id}`);
        logUnauthorizedAccess(msg.chat.id, callbackQuery.from.username);
        return;
      }

      // Mettre à jour le Chat ID actuel pour les réponses
      if (msg) {
        this.currentChatId = msg.chat.id;
      }

      // Répondre au callback avec feedback immédiat
      try {
        await this.bot.answerCallbackQuery(callbackQuery.id, {
          text: '⏳ Chargement en cours...',
          show_alert: false // Affiche un toast, pas une popup bloquante
        });
      } catch (error: any) {
        console.error('Erreur answerCallbackQuery:', error.message);
      }

      if (!data) return;

      try {
        // Parser le callback data
        const [command, ...args] = data.split(':');

        console.log(`📨 Callback commande: ${command} ${args.join(' ')}`);

        // Liste des commandes qui ouvrent juste des sous-menus (pas besoin de loading)
        const quickCommands = ['submenu_invoices', 'submenu_finances', 'search_prompt', 'supplier_prompt', 'lastinvoice_prompt', 'show_guide'];
        const isQuickCommand = quickCommands.includes(command) || command.startsWith('guide_');

        // Envoyer message de chargement pour toutes les commandes sauf les menus rapides
        let loadingMsg: any = null;
        if (!isQuickCommand) {
          loadingMsg = await this.bot.sendMessage(this.currentChatId, '⏳ <b>Chargement...</b>', {
            parse_mode: 'HTML'
          });
        } else {
          // Pour les menus rapides, juste afficher "typing"
          await this.bot.sendChatAction(this.currentChatId, 'typing');
        }

        let response: string;

        // Gérer les commandes spéciales
        if (command === 'menu') {
          this.waitingForInput = null;
          // Envoyer le menu principal unifié
          await this.sendWelcomeMessage();
          return;
        } else if (command === 'show_guide') {
          this.waitingForInput = null;
          await this.showUserGuide();
          return;
        } else if (command.startsWith('guide_')) {
          // Handler pour les catégories du guide (guide_invoices, guide_suppliers, etc.)
          this.waitingForInput = null;
          const category = command.replace('guide_', '');
          await this.showCategoryGuide(category);
          return;
        } else if (command === 'submenu_invoices') {
          this.waitingForInput = null;
          await this.bot.sendMessage(this.currentChatId, '📋 <b>Gestion des factures</b>\n\nSélectionnez une option ci-dessous :', {
            parse_mode: 'HTML',
            reply_markup: this.getInvoicesSubmenuKeyboard()
          });
          return;
        } else if (command === 'submenu_finances') {
          this.waitingForInput = null;
          await this.bot.sendMessage(this.currentChatId, '💰 <b>Finances</b>\n\nChoisissez une catégorie :', {
            parse_mode: 'HTML',
            reply_markup: this.getFinancesSubmenuKeyboard()
          });
          return;
        } else if (command === 'salaries_menu') {
          this.waitingForInput = null;
          response = '💵 <b>Salaires</b>\n\nExemples de questions :\n• "salaires de décembre"\n• "top 10 des employés"\n• "compare kalide et mokhlis"\n• "où se situe hassan par rapport aux autres"';
        } else if (command === 'suppliers_menu') {
          this.waitingForInput = null;
          response = '🏢 <b>Fournisseurs</b>\n\nExemples de questions :\n• "top 10 fournisseurs"\n• "dépenses chez Sligro"\n• "compare Colruyt et Sligro"\n• "tendances Sligro sur 6 mois"';
        } else if (command === 'balance') {
          // 🔧 FIX: Utiliser l'IA pour le solde (format avec soldes des comptes)
          this.waitingForInput = null;
          response = await this.aiAgentService.processQuestion('Donne-moi le solde des comptes', String(this.currentChatId));
        } else if (command === 'ai_tools') {
          this.waitingForInput = null;
          response = await this.getAIToolsList();
        } else if (command === 'clear' || command === 'clear_history') {
          this.waitingForInput = null;
          // Vider l'historique de conversation pour l'utilisateur actuel
          const userId = String(this.currentChatId);
          this.aiAgentService['conversationManager'].clearHistory(userId);
          response = '🗑️ <b>Historique vidé</b>\n\nVotre historique de conversation a été supprimé. Le bot n\'a plus de mémoire des questions précédentes.';
        } else if (command === 'search_prompt') {
          this.waitingForInput = 'search';
          response = '🔍 <b>Recherche</b>\n\nTapez votre terme de recherche (nom de fournisseur, numéro de facture, etc.)';
        } else if (command === 'supplier_prompt') {
          this.waitingForInput = 'supplier';
          response = '📋 <b>Fournisseur</b>\n\nTapez le nom du fournisseur pour voir toutes ses factures.';
        } else if (command === 'lastinvoice_prompt') {
          this.waitingForInput = 'lastinvoice';
          response = '🧾 <b>Dernière facture</b>\n\nTapez le nom du fournisseur pour voir sa dernière facture.';
        } else if (command === 'unpaid' || command === 'overdue' || command === 'due') {
          // 🔧 FIX: Utiliser l'IA pour factures impayées/retard/échéance (format détaillé)
          this.waitingForInput = null;

          let question: string;
          if (command === 'unpaid') {
            question = 'donne moi les factures impayées';
          } else if (command === 'overdue') {
            question = 'donne moi les factures en retard';
          } else {
            question = 'donne moi les factures à échéance dans les 15 prochains jours';
          }

          response = await this.aiAgentService.processQuestion(question, String(this.currentChatId));
        } else if (command === 'stats') {
          // 🔧 FIX: Utiliser l'IA pour les stats (format simplifié avec bénéfice)
          this.waitingForInput = null;
          response = await this.aiAgentService.processQuestion('Donne-moi les statistiques du mois', String(this.currentChatId));
        } else {
          // Commandes normales
          this.waitingForInput = null;
          response = await this.commandHandler.handleCommand(command, args);
          
          // Capturer le contexte
          this.captureInvoiceContext(command, args, response);
        }

        // Envoyer ou éditer la réponse selon si on a un message de loading
        if (loadingMsg && response) {
          try {
            // Si le message est trop long (>4096 chars), l'édition échouera
            if (response.length <= 4000) {
              await this.bot.editMessageText(response, {
                chat_id: this.currentChatId,
                message_id: loadingMsg.message_id,
                parse_mode: 'HTML',
                disable_web_page_preview: true
              });

              // Ajouter les boutons de navigation
              await this.bot.editMessageReplyMarkup(this.getNavigationKeyboard(), {
                chat_id: this.currentChatId,
                message_id: loadingMsg.message_id
              });
            } else {
              // Message trop long : supprimer le message de chargement et envoyer normalement
              await this.bot.deleteMessage(this.currentChatId, loadingMsg.message_id);
              await this.sendMessageWithButtons(response);
            }
          } catch (error: any) {
            console.error('Erreur lors de l\'édition du message:', error.message);
            // En cas d'erreur, supprimer et envoyer normalement
            try {
              await this.bot.deleteMessage(this.currentChatId, loadingMsg.message_id);
            } catch (e) {}
            await this.sendMessageWithButtons(response);
          }
        } else if (response) {
          // Pas de loading message, envoyer normalement
          await this.sendMessageWithButtons(response);
        }
      } catch (error: any) {
        console.error('Erreur lors du traitement du callback:', error);
        const safeMessage = sanitizeError(error, 'Une erreur est survenue lors du traitement de votre demande');
        await this.sendMessage(`❌ ${safeMessage}`);
      }
    });

    // Gérer les commandes
    this.bot.onText(/^\/(\w+)(.*)/, async (msg, match) => {
      // SÉCURITÉ: Vérifier que le message vient d'un chat autorisé (base de données)
      if (!isUserAuthorized(String(msg.chat.id))) {
        console.log(`⚠️  Message ignoré d'un chat non autorisé: ${msg.chat.id}`);
        logUnauthorizedAccess(msg.chat.id, msg.from?.username);
        return;
      }

      // Mettre à jour le Chat ID actuel pour les réponses
      this.currentChatId = msg.chat.id;

      if (!match) return;

      const command = match[1];
      const argsString = match[2].trim();
      const rawArgs = argsString ? argsString.split(/\s+/) : [];

      // SÉCURITÉ: Valider et sanitiser les arguments
      const args = sanitizeArgs(rawArgs);

      // RATE LIMITING: Vérifier la limite de requêtes
      const rateLimit = this.rateLimitManager.check('general', msg.chat.id);
      if (!rateLimit.allowed) {
        await this.sendMessage(`⏱️ ${rateLimit.message}\n\n<i>Réessayez dans ${Math.ceil(rateLimit.resetIn / 1000)} secondes.</i>`);
        return;
      }

      try {
        // Afficher l'action "typing" pendant le traitement
        await this.bot.sendChatAction(this.currentChatId, 'typing');

        const response = await this.commandHandler.handleCommand(command, args);

        // Capturer le contexte
        this.captureInvoiceContext(command, args, response);

        // Cas spécial pour /help : envoyer avec le clavier personnalisé
        if (command === 'help') {
          await this.sendHelpMessage();
        } else {
          await this.sendMessageWithButtons(response);
        }
      } catch (error: any) {
        console.error('Erreur lors du traitement de la commande:', error);
        const safeMessage = sanitizeError(error, 'Une erreur est survenue lors de l\'exécution de la commande');
        await this.sendMessage(`❌ ${safeMessage}`);
      }
    });

    // Gérer les messages texte normaux (sans commande)
    this.bot.on('message', async (msg) => {
      console.log('📩 Event message:', msg.text || msg.voice ? '🎤 Voice' : msg.caption || '[media]', 'from chat:', msg.chat.id);

      // SÉCURITÉ: Vérifier que le message vient d'un chat autorisé (base de données)
      if (!isUserAuthorized(String(msg.chat.id))) {
        logUnauthorizedAccess(msg.chat.id, msg.from?.username);
        return;
      }

      // Mettre à jour le Chat ID actuel pour les réponses
      this.currentChatId = msg.chat.id;

      // Gérer les messages vocaux
      if (msg.voice) {
        await this.handleVoiceMessage(msg);
        return;
      }

      // Ignorer si c'est une commande (déjà gérée ci-dessus)
      if (msg.text && msg.text.startsWith('/')) {
        return;
      }

      // Traiter les réponses en fonction de l'état
      if (msg.text && this.waitingForInput) {
        // SÉCURITÉ: Valider l'input utilisateur
        const validation = validateUserInput(msg.text, {
          maxLength: config.security.maxInputLength,
          allowEmpty: false,
          fieldName: 'Votre saisie',
        });

        if (!validation.valid) {
          await this.sendMessage(`❌ ${validation.error}`);
          return;
        }

        console.log('📨 Réponse reçue pour:', this.waitingForInput, '- Valeur:', validation.sanitized);

        try {
          // Afficher l'action "typing" pendant le traitement
          await this.bot.sendChatAction(this.currentChatId, 'typing');

          let response: string;

          const command = this.waitingForInput;
          const args = [validation.sanitized!];

          switch (command) {
            case 'search':
              response = await this.commandHandler.handleCommand('search', args);
              break;
            case 'supplier':
              response = await this.commandHandler.handleCommand('supplier', args);
              break;
            case 'lastinvoice':
              response = await this.commandHandler.handleCommand('lastinvoice', args);
              break;
            default:
              response = '❌ Erreur interne';
          }
          
          // Capturer le contexte
          this.captureInvoiceContext(command, args, response);
          
          this.waitingForInput = null;
          await this.sendMessageWithButtons(response);
        } catch (error: any) {
          console.error('Erreur lors du traitement de la réponse:', error);
          const safeMessage = sanitizeError(error, 'Une erreur est survenue lors du traitement de votre réponse');
          await this.sendMessage(`❌ ${safeMessage}`);
        }
        
        return;
      }

      // Répondre aux messages non-commandes avec l'IA ou le menu
      if (msg.text) {
        // SÉCURITÉ: Valider le message avant traitement
        const validation = validateUserInput(msg.text, {
          maxLength: config.security.maxInputLength,
          allowEmpty: false,
          fieldName: 'Message',
        });

        if (!validation.valid) {
          await this.sendMessage(`❌ ${validation.error}`);
          return;
        }

        // Vérifier si c'est une question qui nécessite une réponse IA
        const intentResult = this.detectQuestionIntent(validation.sanitized!);

        if (intentResult === 'quick_response') {
          // Réponse rapide déjà envoyée, ne pas continuer
          return;
        } else if (intentResult) {
          // RATE LIMITING: Limiter les questions IA (plus coûteuses)
          const aiRateLimit = this.rateLimitManager.check('ai', msg.chat.id);
          if (!aiRateLimit.allowed) {
            await this.sendMessage(`⏱️ ${aiRateLimit.message}\n\n<i>Réessayez dans ${Math.ceil(aiRateLimit.resetIn / 1000)} secondes.</i>`);
            return;
          }

          console.log('🤖 Question détectée, traitement par IA conversationnelle');
          // Afficher l'action "typing" pendant le traitement IA
          await this.bot.sendChatAction(this.currentChatId, 'typing');
          await this.handleAIQuestion(validation.sanitized!);
        } else {
          console.log('📨 Message texte reçu, envoi du menu');
          await this.sendWelcomeMessage();
        }
      }
    });

    // Gérer les erreurs de polling
    this.bot.on('polling_error', (error) => {
      console.error('❌ Erreur de polling Telegram:', error.message);
    });

    console.log('✓ Bot Telegram en mode interactif activé');
  }

  /**
   * Envoie le message de bienvenue avec le menu principal
   */
  private async sendWelcomeMessage(): Promise<void> {
    const text = `👋 <b>Bienvenue sur Billit Bot !</b>

Je vous aide à gérer vos factures, finances et bien plus avec <b>50 outils IA</b>.

💡 <i>Commencez par le Guide complet pour découvrir tout ce que je peux faire !</i>`;

    console.log('🎹 Envoi du menu principal');

    try {
      const result = await this.bot.sendMessage(this.currentChatId, text, {
        parse_mode: 'HTML',
        reply_markup: this.getMainMenuKeyboard()
      });
      console.log('✅ Menu principal envoyé avec succès, message_id:', result.message_id);
    } catch (error: any) {
      console.error('❌ Erreur lors de l\'envoi du menu:', error.message);
      throw error;
    }
  }

  /**
   * 🏠 Menu PRINCIPAL UNIFIÉ
   * Utilisé pour: /start, /help, navigation après réponses
   * UN SEUL MENU pour éviter les doublons et la confusion
   */
  private getUnifiedMenuKeyboard(): any {
    return {
      inline_keyboard: [
        [
          { text: '📋 Factures', callback_data: 'submenu_invoices' },
          { text: '💰 Finances', callback_data: 'submenu_finances' },
          { text: '📖 Guide', callback_data: 'show_guide' }
        ],
        [
          { text: '🔍 Rechercher', callback_data: 'search_prompt' },
          { text: '📊 Stats', callback_data: 'stats' },
          { text: '🗑️ Vider l\'historique', callback_data: 'clear_history' }
        ]
      ]
    };
  }

  /**
   * @deprecated Utiliser getUnifiedMenuKeyboard() à la place
   * Gardé pour compatibilité, mais redirige vers le menu unifié
   */
  private getMainMenuKeyboard(): any {
    return this.getUnifiedMenuKeyboard();
  }

  /**
   * @deprecated Utiliser getUnifiedMenuKeyboard() à la place
   * Gardé pour compatibilité, mais redirige vers le menu unifié
   */
  private getNavigationKeyboard(): any {
    return this.getUnifiedMenuKeyboard();
  }

  /**
   * Menu principal unifié (pour /start et /help)
   * @deprecated Utiliser getUnifiedMenuKeyboard() à la place
   */
  private getMainMenuKeyboard_OLD(): any {
    return {
      inline_keyboard: [
        [
          { text: '📖 Guide complet', callback_data: 'show_guide' },
          { text: '🤖 Outils IA', callback_data: 'ai_tools' }
        ],
        [
          { text: '📋 Factures', callback_data: 'submenu_invoices' },
          { text: '💰 Finances', callback_data: 'submenu_finances' }
        ],
        [
          { text: '🔍 Rechercher', callback_data: 'search_prompt' },
          { text: '🗑️ Vider l\'historique', callback_data: 'clear_history' }
        ]
      ]
    };
  }

  /**
   * 📋 Sous-menu Factures
   * 3 boutons par ligne pour optimiser l'affichage mobile
   */
  private getInvoicesSubmenuKeyboard(): any {
    return {
      inline_keyboard: [
        [
          { text: '📋 Impayées', callback_data: 'unpaid' },
          { text: '⚠️ En retard', callback_data: 'overdue' },
          { text: '📅 À échéance', callback_data: 'due' }
        ],
        [
          { text: '🧾 Dernière', callback_data: 'lastinvoice_prompt' },
          { text: '📁 Par fournisseur', callback_data: 'supplier_prompt' },
          { text: '🔙 Retour', callback_data: 'menu' }
        ]
      ]
    };
  }

  /**
   * Sous-menu Finances
   */
  private getFinancesSubmenuKeyboard(): any {
    return {
      inline_keyboard: [
        [
          { text: '📊 Statistiques', callback_data: 'stats' },
          { text: '🏦 Soldes', callback_data: 'balance' },
          { text: '🔮 Analytics', callback_data: 'guide_analytics' }
        ],
        [
          { text: '💵 Salaires', callback_data: 'salaries_menu' },
          { text: '🏢 Fournisseurs', callback_data: 'suppliers_menu' },
          { text: '🔙 Retour', callback_data: 'menu' }
        ]
      ]
    };
  }

  /**
   * Envoie le message d'aide avec le menu principal
   */
  private async sendHelpMessage(): Promise<void> {
    const response = await this.commandHandler.handleCommand('help', []);

    await this.bot.sendMessage(this.currentChatId, response, {
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: this.getMainMenuKeyboard()
    });
  }

  /**
   * 📖 GUIDE UTILISATEUR - VERSION APLATIE
   * Tous les exemples sont visibles en une seule fois
   * Plus besoin de cliquer sur chaque catégorie
   */
  private async showUserGuide(): Promise<void> {
    try {
      const guideText = `📖 <b>GUIDE - Exemples de questions</b>

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 <b>Factures</b>
• "Quelles factures sont impayées ?"
• "Factures en retard"
• "Dernière facture de Foster"
• "Les 20 dernières factures"

🏢 <b>Fournisseurs</b>
• "Top 10 des fournisseurs"
• "Combien j'ai payé à Foster ?"
• "Dépenses chez Sligro en décembre"
• "Compare Colruyt et Sligro"

💵 <b>Salaires</b>
• "Salaires de décembre"
• "Top 10 employés les mieux payés"
• "Salaire de Mokhlis Jamhoun"
• "Compare Hassan et Soufiane"

🏦 <b>Banque & Transactions</b>
• "Solde actuel"
• "Transactions du mois"
• "Balance de décembre"
• "Recettes et dépenses"

📊 <b>Agrégation & Rapports</b>
• "Résumé de l'année 2025"
• "Bilan annuel avec top fournisseurs"
• "Compare janvier et février"
• "Rapport trimestriel Q1"

🔮 <b>Analytics & Prédictions</b>
• "Prévision des dépenses du mois prochain"
• "Détection d'anomalies"
• "Analyse les tendances"
• "Exporte en CSV"

💡 <i>Utilisez simplement ces questions en langage naturel, l'IA comprend automatiquement !</i>`;

      await this.bot.sendMessage(this.currentChatId, guideText, {
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🔙 Retour au menu', callback_data: 'menu' }
            ]
          ]
        }
      });
    } catch (error: any) {
      console.error('Erreur lors de l\'affichage du guide:', error);
      await this.sendMessage('❌ Erreur lors de l\'affichage du guide.');
    }
  }

  /**
   * Affiche le guide pour une catégorie spécifique
   */
  private async showCategoryGuide(category: string): Promise<void> {
    let guideText = '';

    switch (category) {
      case 'invoices':
        guideText = `📋 <b>GUIDE - FACTURES (11 outils)</b>

<b>🔍 Consulter les factures</b>
• "Quelles factures sont impayées ?"
• "Montre les factures en retard"
• "Factures payées de ce mois"
• "Dernière facture de Foster"
• "Les 20 dernières factures"

<b>💰 Filtrer par montant</b>
• "Factures de plus de 3000€"
• "Factures entre 500€ et 2000€"

<b>📅 Filtrer par période</b>
• "Factures du mois de novembre"
• "Factures de Sligro en décembre 2025"
• "Factures entre le 1er et le 15 décembre"

<b>🔎 Recherche</b>
• "Cherche les factures de Foster"
• "Recherche facture numéro 2025-1234"
• "Factures de Colruyt et Makro"`;
        break;

      case 'suppliers':
        guideText = `🏢 <b>GUIDE - FOURNISSEURS (15 outils)</b>

<b>💳 Paiements fournisseurs</b>
• "Combien j'ai payé à Foster ?"
• "Paiements à Sligro en décembre"
• "Total payé à Colruyt cette année"

<b>📊 Analyse des dépenses</b>
• "Analyse les dépenses chez Uber Eats"
• "Évolution dépenses Foster sur 6 mois"
• "Top 10 des fournisseurs"

<b>🔄 Comparaisons</b>
• "Compare Colruyt et Sligro"
• "Compare Foster et Makro ce mois"

<b>📈 Tendances & Patterns (NOUVEAU)</b>
• "Analyse l'évolution chez Sligro"
• "Top 5 fournisseurs avec évolution"
• "Détecte les paiements récurrents"

<b>📋 Gestion</b>
• "Liste tous les fournisseurs"
• "Ajoute le fournisseur X"`;
        break;

      case 'salaries':
        guideText = `💵 <b>GUIDE - SALAIRES (5 outils)</b>

<b>👤 Salaire individuel</b>
• "Salaire de Mokhlis Jamhoun"
• "Salaire de Hassan en décembre"
• "Combien gagne Soufiane ?"

<b>📊 Classements</b>
• "Top 10 des employés les mieux payés"
• "Les 5 employés les mieux payés"
• "Où se situe Mokhlis parmi les autres ?"

<b>📅 Périodes</b>
• "Analyse les salaires de décembre"
• "Salaires entre octobre et décembre"
• "Tous les salaires de l'année"

<b>🔄 Comparaisons</b>
• "Compare les salaires de Mokhlis et Soufiane"
• "Compare Hassan, Mokhlis et Soufiane"`;
        break;

      case 'bank':
        guideText = `🏦 <b>GUIDE - BANQUE & TRANSACTIONS (9 outils)</b>

<b>💰 Soldes</b>
• "Balance du mois de décembre"
• "Solde du compte Europabank"
• "Quel est mon solde actuel ?"

<b>📊 Transactions</b>
• "Montre les dernières transactions"
• "Transactions de ce mois"
• "Total des dépenses du mois"
• "Combien j'ai gagné ce mois ?"

<b>📅 Bilans mensuels</b>
• "Bilan du mois de novembre"
• "Balance de décembre 2025"
• "Recettes et dépenses de janvier"

<b>📈 Tendances</b>
• "Analyse les 3 derniers mois"
• "Évolution des dépenses"`;
        break;

      case 'aggregation':
        guideText = `📊 <b>GUIDE - AGRÉGATION (3 outils) 🆕</b>

<b>📅 Résumé annuel</b>
• "Résumé de l'année 2025"
• "Bilan annuel avec top fournisseurs"
• "Rapport annuel 2025"

<b>🔄 Comparaison de périodes</b>
• "Compare janvier et février"
• "Compare Q1 2025 vs Q4 2024"
• "Compare octobre 2024 et octobre 2025"

<b>📆 Rapports trimestriels</b>
• "Rapport du trimestre Q1"
• "Analyse du Q3 2025"
• "Résumé trimestriel avec top 5 fournisseurs"

💡 <i>Ces outils agrègent automatiquement toutes vos données pour vous donner une vue d'ensemble claire !</i>`;
        break;

      case 'analytics':
        guideText = `🔮 <b>GUIDE - ANALYTICS & PRÉDICTIONS (4 outils) 🆕</b>

<b>📈 Prévisions</b>
• "Prévision des dépenses pour le mois prochain"
• "Prédis mes dépenses de février"
• "Estimation du mois suivant"

<b>🚨 Détection d'anomalies</b>
• "Détecte les anomalies"
• "Y a-t-il des dépenses inhabituelles ?"
• "Alertes sur les transactions suspectes"

<b>📊 Analyse de tendances</b>
• "Analyse les tendances"
• "Évolution de mes finances"
• "Mes dépenses augmentent ou baissent ?"

<b>💾 Export de données</b>
• "Exporte en CSV"
• "Export des transactions de décembre"
• "Télécharge les données en CSV"

💡 <i>Le bot utilise des algorithmes avancés (régression linéaire, détection statistique) pour vous aider à anticiper et optimiser vos finances !</i>`;
        break;

      case 'users':
        guideText = `👥 <b>GUIDE - UTILISATEURS (3 outils)</b>

<b>📋 Liste des utilisateurs</b>
• "Liste les utilisateurs"
• "Qui est autorisé ?"
• "Montre tous les utilisateurs"

<b>➕ Ajouter un utilisateur</b>
• "Ajoute l'utilisateur 123456789"
• "Autorise le chat ID 987654321"

<b>➖ Retirer un utilisateur</b>
• "Retire l'utilisateur 123456789"
• "Supprime l'accès de 987654321"

💡 <i>Seul le propriétaire peut gérer les utilisateurs autorisés.</i>`;
        break;

      case 'tips':
        guideText = `💡 <b>CONSEILS D'UTILISATION</b>

<b>✅ Bonnes pratiques</b>
• Soyez précis dans vos questions
• Utilisez "et" pour plusieurs fournisseurs/employés
• Précisez l'année si nécessaire (ex: "décembre 2024")
• Vous pouvez envoyer des messages vocaux !

<b>📅 Formats de dates acceptés</b>
• "décembre 2025"
• "2025-12-01"
• "entre octobre et décembre"
• "ce mois", "le mois dernier"

<b>🎯 Exemples de formulations</b>
✅ "Analyse les dépenses chez Foster en décembre"
✅ "Compare les salaires de Hassan et Mokhlis"
✅ "Top 10 fournisseurs avec évolution"
❌ "Foster" (trop vague)
❌ "Salaires" (précisez le mois ou l'employé)

<b>🎤 Messages vocaux</b>
• Parlez naturellement
• Le bot comprend le français
• Même précision que les messages texte

<b>⚡ Réponses rapides</b>
• Cache intelligent pour questions fréquentes
• Réponses en moins de 1 seconde

<b>🔒 Sécurité</b>
• Seuls les utilisateurs autorisés peuvent utiliser le bot
• Toutes les données sont chiffrées`;
        break;

      default:
        guideText = 'Guide non trouvé.';
    }

    await this.bot.sendMessage(this.currentChatId, guideText, {
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔙 Retour au guide', callback_data: 'show_guide' }],
          [{ text: '🏠 Menu principal', callback_data: 'menu' }]
        ]
      }
    });
  }

  /**
   * Génère la liste des outils IA disponibles
   */
  private async getAIToolsList(): Promise<string> {
    let response = '🤖 <b>Outils IA disponibles (36 outils)</b>\n\n';

    response += '<b>📋 FACTURES (11 outils)</b>\n';
    response += '  🔍 Factures impayées\n';
    response += '  💳 Factures payées\n';
    response += '  📄 Dernière facture\n';
    response += '  📋 Factures récentes (N dernières)\n';
    response += '  ⚠️ Factures en retard\n';
    response += '  📊 Statistiques factures\n';
    response += '  🔎 Recherche facture\n';
    response += '  📝 Rechercher factures\n';
    response += '  📆 Factures mensuelles\n';
    response += '  🏪 Factures par fournisseur\n';
    response += '  📧 Envoyer PDF facture\n\n';

    response += '<b>💰 TRANSACTIONS (7 outils)</b>\n';
    response += '  💰 Balance mensuelle\n';
    response += '  📈 Recettes mensuelles\n';
    response += '  📉 Dépenses mensuelles\n';
    response += '  📅 Transactions période\n';
    response += '  💼 Salaires employés\n';
    response += '  🏢 Paiements fournisseur\n';
    response += '  💸 Versements reçus\n\n';

    response += '<b>👥 EMPLOYÉS (5 outils)</b>\n';
    response += '  👥 Lister employés\n';
    response += '  ➕ Ajouter employé\n';
    response += '  🗑️ Supprimer employé\n';
    response += '  📊 Analyse salaires\n';
    response += '  🔄 Comparaison salaires\n\n';

    response += '<b>🏢 FOURNISSEURS (9 outils)</b>\n';
    response += '  🏷️ Lister fournisseurs\n';
    response += '  ➕ Ajouter fournisseur\n';
    response += '  🗑️ Supprimer fournisseur\n';
    response += '  📊 Analyse fournisseur\n';
    response += '  🏆 Top fournisseurs\n';
    response += '  🔄 Comparaison fournisseurs\n';
    response += '  💸 Dépenses fournisseur\n';
    response += '  💳 Paiements fournisseur\n';
    response += '  🔍 Détecter nouveaux fournisseurs\n\n';

    response += '<b>👥 UTILISATEURS (3 outils)</b>\n';
    response += '  📱 Lister utilisateurs\n';
    response += '  ➕ Ajouter utilisateur\n';
    response += '  ❌ Retirer utilisateur\n\n';

    response += '<b>🔧 SYSTÈME (1 outil)</b>\n';
    response += '  🔧 Redémarrer le bot\n';

    response += '\n💡 <i>Posez simplement votre question en langage naturel, l\'IA utilisera automatiquement les bons outils!</i>';

    return response;
  }

  /**
   * Envoie un message avec les boutons de navigation
   * Découpe automatiquement si > 4096 caractères (limite Telegram)
   */
  async sendMessageWithButtons(text: string): Promise<void> {
    try {
      const MAX_LENGTH = 4096;

      // Déterminer le clavier à utiliser
      let keyboard = this.getNavigationKeyboard();

      // Si c'est la commande /help, utiliser le menu principal
      const isHelpMessage = text.includes("Billit Bot - Guide d'utilisation") || text.includes('MODE CONVERSATIONNEL');
      if (isHelpMessage) {
        console.log('🎨 Détection message /help - utilisation du clavier personnalisé avec bouton Guide');
        keyboard = this.getMainMenuKeyboard();
      }

      // Si le message est court, l'envoyer tel quel
      if (text.length <= MAX_LENGTH) {
        await this.bot.sendMessage(this.currentChatId, text, {
          parse_mode: 'HTML',
          disable_web_page_preview: true,
          reply_markup: keyboard
        });
        return;
      }

      // Découper le message en plusieurs parties
      console.log(`📝 Message trop long (${text.length} caractères), découpage en plusieurs messages...`);

      const parts: string[] = [];
      let currentPart = '';
      const lines = text.split('\n');

      for (const line of lines) {
        // Si ajouter cette ligne dépasse la limite
        if ((currentPart + line + '\n').length > MAX_LENGTH) {
          // Sauvegarder la partie actuelle
          if (currentPart) {
            parts.push(currentPart.trim());
          }
          // Commencer une nouvelle partie avec cette ligne
          currentPart = line + '\n';
        } else {
          currentPart += line + '\n';
        }
      }

      // Ajouter la dernière partie
      if (currentPart.trim()) {
        parts.push(currentPart.trim());
      }

      console.log(`📨 Envoi de ${parts.length} messages...`);

      // Envoyer toutes les parties
      for (let i = 0; i < parts.length; i++) {
        const isLast = i === parts.length - 1;
        const partText = parts.length > 1 ? `${parts[i]}\n\n📄 (${i + 1}/${parts.length})` : parts[i];

        await this.bot.sendMessage(this.currentChatId, partText, {
          parse_mode: 'HTML',
          disable_web_page_preview: true,
          // N'afficher les boutons que sur le dernier message
          reply_markup: isLast ? keyboard : undefined
        });

        // Petite pause entre les messages pour éviter le rate limiting
        if (!isLast) {
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      }
    } catch (error: any) {
      console.error('Erreur lors de l\'envoi du message:', error);
      throw error;
    }
  }

  /**
   * Envoie un message simple (sans boutons)
   */
  async sendMessage(text: string): Promise<void> {
    try {
      await this.bot.sendMessage(this.currentChatId, text, {
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      });
    } catch (error: any) {
      console.error('Erreur lors de l\'envoi du message:', error);
      throw error;
    }
  }

  /**
   * Gère les messages vocaux
   */
  private async handleVoiceMessage(msg: TelegramBot.Message): Promise<void> {
    if (!msg.voice) return;

    // Vérifier si la reconnaissance vocale est configurée
    if (!this.voiceService.isConfigured()) {
      await this.sendMessage('❌ La reconnaissance vocale n\'est pas configurée.\n\nVeuillez ajouter GROQ_API_KEY dans votre fichier .env');
      return;
    }

    // RATE LIMITING: Limiter les messages vocaux
    const voiceRateLimit = this.rateLimitManager.check('voice', msg.chat.id);
    if (!voiceRateLimit.allowed) {
      await this.sendMessage(`⏱️ ${voiceRateLimit.message}\n\n<i>Réessayez dans ${Math.ceil(voiceRateLimit.resetIn / 1000)} secondes.</i>`);
      return;
    }

    try {
      // Envoyer un message de traitement
      await this.sendMessage('🎤 Transcription en cours...');

      // Télécharger le fichier vocal
      const fileId = msg.voice.file_id;
      const file = await this.bot.getFile(fileId);
      
      if (!file.file_path) {
        throw new Error('Impossible de récupérer le fichier vocal');
      }

      // Créer un dossier temporaire si nécessaire
      const tempDir = path.join(__dirname, '../temp');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      // Télécharger le fichier (ne PAS logger l'URL avec le token)
      const tempFilePath = path.join(tempDir, `voice_${Date.now()}.ogg`);
      
      console.log('📥 Téléchargement du fichier vocal...');
      const fileStream = await this.bot.downloadFile(fileId, tempDir);
      
      // Le fichier est maintenant téléchargé, renommer si nécessaire
      const downloadedPath = path.join(tempDir, path.basename(file.file_path));
      if (fs.existsSync(downloadedPath) && downloadedPath !== tempFilePath) {
        fs.renameSync(downloadedPath, tempFilePath);
      }

      // Transcrire l'audio
      const transcription = await this.voiceService.transcribeAudio(tempFilePath);

      // Supprimer le fichier temporaire
      fs.unlinkSync(tempFilePath);

      console.log('📝 Transcription:', transcription);

      // Envoyer la transcription à l'utilisateur
      await this.sendMessage(`📝 <i>Vous avez dit:</i> "${transcription}"`);

      // Traiter la transcription comme une commande
      await this.processVoiceCommand(transcription);

    } catch (error: any) {
      console.error('❌ Erreur lors du traitement du message vocal:', error);
      const safeMessage = sanitizeError(error, 'Erreur lors du traitement du message vocal');
      await this.sendMessage(`❌ ${safeMessage}`);
    }
  }

  /**
   * Capture le numéro de facture depuis la réponse pour le contexte
   */
  private captureInvoiceContext(command: string, args: string[], response: string): void {
    // Si c'est une commande lastinvoice et que la réponse contient un numéro de facture
    if (command === 'lastinvoice' && response.includes('📄')) {
      // Matcher avec ou sans balises HTML
      const match = response.match(/📄\s*(?:<b>)?Facture:?(?:<\/b>)?\s*([A-Z0-9\-]+)/i);
      if (match) {
        this.lastInvoiceNumber = match[1];
        console.log('💾 Facture mémorisée (lastinvoice):', this.lastInvoiceNumber);
      }
    }
    
    // Si c'est une commande supplier, search, unpaid, overdue, paid - capturer la première facture de la liste
    if (['supplier', 'search', 'unpaid', 'overdue', 'paid'].includes(command)) {
      // Chercher un pattern comme "1. SI2500003745 -" ou "SI2500003745 -"
      const match = response.match(/(?:^\d+\.\s+)?([A-Z]{2}\d{10,})/m);
      if (match) {
        this.lastInvoiceNumber = match[1];
        console.log('💾 Facture mémorisée (liste):', this.lastInvoiceNumber);
      }
    }
    
    // Si c'est une commande invoice/details avec un argument
    if ((command === 'invoice' || command === 'details') && args.length > 0) {
      this.lastInvoiceNumber = args[0];
      console.log('💾 Facture mémorisée (details):', this.lastInvoiceNumber);
    }
  }

  /**
   * Traite une commande vocale transcrite avec l'agent IA autonome
   * NOUVEAU: Avec streaming ChatGPT-like pour UX améliorée
   */
  private async processVoiceCommand(text: string): Promise<void> {
    const startTime = Date.now();

    try {
      logDebug(`Commande vocale transcrite: "${text}"`, 'telegram-bot', { userId: this.currentChatId });

      // 🎬 Indicateurs visuels avec streaming
      const streamer = StreamingResponseFactory.create(this.bot, Number(this.currentChatId));
      await streamer.sendTyping();

      const progressMsg = await streamer.sendProgressMessage('🎤 Analyse de votre commande vocale...');

      // 🧠 Traiter avec l'AGENT IA (DONNÉES RÉELLES)
      const response = await this.aiAgentService.processQuestion(text, String(this.currentChatId));

      // 🔒 Validation de la réponse
      const validation = DataValidator.validateAIResponse(response);

      if (!validation.isValid) {
        logErrorUtil('Réponse vocale contient des estimations', { errors: validation.errors }, 'telegram-bot');

        // Réessayer avec validation stricte
        const strictResponse = await this.aiAgentService.processQuestion(
          `[HINT: Utilise UNIQUEMENT les données EXACTES des outils. ZERO estimation.] ${text}`,
          String(this.currentChatId)
        );

        // ✅ PAGINATION ou STREAMING selon la longueur
        if (strictResponse.length > 4000) {
          const paginator = TelegramPaginationFactory.create(this.bot, Number(this.currentChatId));
          await paginator.sendLongMessage(strictResponse, progressMsg.message_id);
        } else {
          await streamer.streamText(strictResponse, progressMsg.message_id);
        }
      } else {
        // 📺 PAGINATION ou STREAMING selon la longueur
        if (response.length > 4000) {
          logInfo(`Réponse vocale longue (${response.length} chars), pagination`, 'telegram-bot');
          const paginator = TelegramPaginationFactory.create(this.bot, Number(this.currentChatId));
          await paginator.sendLongMessage(response, progressMsg.message_id);
        } else {
          await streamer.streamText(response, progressMsg.message_id);
        }
      }

      // 📊 Métriques
      const duration = Date.now() - startTime;
      globalMetrics.trackRequest(String(this.currentChatId), duration);
      globalMetrics.trackAICall('voice_command');

      logInfo('Commande vocale traitée', 'telegram-bot', {
        userId: this.currentChatId,
        duration: `${duration}ms`,
      });

    } catch (error: any) {
      const duration = Date.now() - startTime;
      globalMetrics.trackRequest(String(this.currentChatId), duration);
      globalMetrics.trackError('voice_command', error.message, String(this.currentChatId));

      logErrorUtil('Erreur commande vocale', error, 'telegram-bot');

      const safeMessage = sanitizeError(error, 'Erreur lors du traitement de votre commande vocale');
      await this.sendMessage(`❌ ${safeMessage}`);
    }
  }

  /**
   * Détecte si un message est une question qui nécessite une réponse IA
   * 🚀 OPTIM 6: Détection locale des commandes simples (gain +20% vitesse)
   *
   * @returns 'quick_response' si une réponse rapide a été envoyée, true si question IA, false si menu de bienvenue
   */
  private detectQuestionIntent(text: string): boolean | 'quick_response' {
    const t = text.toLowerCase().trim();

    // 🎯 OPTIM 6.1: Détection locale des salutations (réponse directe)
    const greetings = [
      'bonjour', 'salut', 'hello', 'hi', 'hey', 'bonsoir', 'bonne nuit',
      'bon matin', 'good morning', 'good night', 'coucou', 'yo'
    ];
    if (greetings.some(g => t === g || t.startsWith(g + ' ') || t.endsWith(' ' + g))) {
      // Réponse directe sans IA
      this.sendQuickResponse('👋 Bonjour ! Comment puis-je vous aider ?');
      return 'quick_response'; // Réponse déjà envoyée, ne pas continuer
    }

    // 🎯 OPTIM 6.2: Détection locale des remerciements (réponse directe)
    const thanks = [
      'merci', 'thanks', 'thank you', 'thx', 'ok merci', 'merci beaucoup',
      'thank u', 'tysm', 'ty', 'merciii'
    ];
    if (thanks.some(t => text.toLowerCase().trim().startsWith(t))) {
      this.sendQuickResponse('✅ De rien ! N\'hésitez pas si vous avez d\'autres questions.');
      return 'quick_response'; // Réponse déjà envoyée, ne pas continuer
    }

    // 🎯 OPTIM 6.3: Détection locale des confirmations simples (réponse directe)
    const confirmations = ['ok', 'd\'accord', 'okay', 'cool', 'parfait', 'bien', 'super', 'nice', 'top', 'oui'];
    if (confirmations.includes(t)) {
      this.sendQuickResponse('👍 Parfait ! Autre chose ?');
      return 'quick_response'; // Réponse déjà envoyée, ne pas continuer
    }

    // 🎯 OPTIM 6.4: Détection locale des demandes d'aide (réponse directe)
    const helpKeywords = ['aide', 'help', 'comment ça marche', 'quoi faire', 'comment faire'];
    if (helpKeywords.some(k => t === k || t.includes(k))) {
      this.sendWelcomeMessage(); // Menu principal
      return 'quick_response'; // Réponse déjà envoyée, ne pas continuer
    }

    // Mots-clés qui indiquent une question explicite nécessitant l'IA
    const questionWords = [
      'combien', 'quel', 'quelle', 'quels', 'quelles',
      'montre', 'montrez', 'show', 'voir',
      'liste', 'list', 'lister',
      'calcule', 'calculer',
      'total', 'somme', 'moyenne',
      'analyse', 'analyser',
      'compare', 'comparer',
      'cherche', 'recherche', 'rechercher', 'search',
      'où', 'quand', 'pourquoi',
      'est-ce que', 'est ce que',
      '?', '¿', '？',
      // Pagination
      'page', 'suivant', 'suivante', 'suivantes', 'précédent', 'précédente',
      'next', 'previous', 'suite'
    ];

    // Vérifier si le texte contient un mot-clé de question
    const hasQuestionWord = questionWords.some(word => t.includes(word));

    // 🔧 FIX: Ajouter des mots-clés métier qui indiquent une vraie question
    const businessKeywords = [
      'facture', 'invoice', 'impayé', 'retard', 'paiement', 'paid', 'unpaid',
      'salaire', 'salary', 'employé', 'employee', 'fournisseur', 'supplier',
      'transaction', 'dépense', 'expense', 'balance', 'solde', 'compte',
      'foster', 'sligro', 'coca', 'colruyt', // Fournisseurs courants
      'prévision', 'forecast', 'alerte', 'alert', 'top', 'dernier'
    ];
    const hasBusinessKeyword = businessKeywords.some(word => t.includes(word));

    // Vérifier si c'est une phrase courte (moins de 100 caractères)
    const isShortMessage = text.length < 100;

    // AMÉLIORATION: Traiter les messages courts avec mots-clés de question OU métier comme requêtes IA
    return isShortMessage && (hasQuestionWord || hasBusinessKeyword);
  }

  /**
   * 🚀 OPTIM 6: Envoie une réponse rapide sans passer par l'IA
   */
  private async sendQuickResponse(message: string): Promise<void> {
    try {
      await this.bot.sendMessage(this.currentChatId, message, {
        reply_markup: this.getNavigationKeyboard()
      });
    } catch (error: any) {
      console.error('Erreur sendQuickResponse:', error.message);
    }
  }

  /**
   * Traite une question avec l'IA autonome (function calling)
   * NOUVEAU: Avec streaming ChatGPT-like pour UX améliorée
   */
  private async handleAIQuestion(question: string): Promise<void> {
    const startTime = Date.now();

    try {
      // ⏱️ TRACKING: Démarrer le suivi de la requête
      logDebug(`Question IA reçue: "${question}"`, 'telegram-bot', { userId: this.currentChatId });

      // 🎬 ÉTAPE 1: Indicateurs visuels de progression
      const streamer = StreamingResponseFactory.create(this.bot, Number(this.currentChatId));

      // Envoyer typing indicator
      await streamer.sendTyping();

      // Message de progression initial
      const progressMsg = await streamer.sendProgressMessage(ProgressMessages.AI_WORKING);

      // 🧠 ÉTAPE 2: Traiter avec l'AGENT IA (DONNÉES RÉELLES)
      // ⚠️ CRITIQUE: Toutes les données viennent des outils IA - ZERO invention
      const response = await this.aiAgentService.processQuestion(question, String(this.currentChatId));

      // 🔒 ÉTAPE 3: VALIDATION - Garantir précision des données
      const validation = DataValidator.validateAIResponse(response);

      if (!validation.isValid) {
        logErrorUtil('Réponse IA contient des estimations/inventions', { errors: validation.errors }, 'telegram-bot');

        // Bloquer les réponses avec estimations
        await this.bot.editMessageText(
          `❌ Erreur: La réponse générée contient des estimations non fiables.\n\n💡 Je vais reformuler avec les données exactes.`,
          { chat_id: Number(this.currentChatId), message_id: progressMsg.message_id }
        );

        // Réessayer avec un hint plus strict
        const strictResponse = await this.aiAgentService.processQuestion(
          `[HINT: Utilise UNIQUEMENT les données EXACTES des outils. ZERO estimation.] ${question}`,
          String(this.currentChatId)
        );

        // ✅ PAGINATION : Si réponse trop longue (>4000 chars), découper automatiquement
        if (strictResponse.length > 4000) {
          const paginator = TelegramPaginationFactory.create(this.bot, Number(this.currentChatId));
          await paginator.sendLongMessage(strictResponse, progressMsg.message_id);
        } else {
          // ✅ STREAMING : Éditer le message existant
          await streamer.streamText(strictResponse, progressMsg.message_id);
        }

      } else {
        // 📺 ÉTAPE 4: STREAMING de la réponse (UX ChatGPT-like)
        // ⚡ NOUVEAU: Détection automatique pagination pour réponses longues

        if (response.length > 4000) {
          // 📄 PAGINATION : Réponse trop longue, découper en plusieurs messages
          logInfo(`Réponse longue (${response.length} chars), pagination automatique`, 'telegram-bot');

          const paginator = TelegramPaginationFactory.create(this.bot, Number(this.currentChatId));
          await paginator.sendLongMessage(response, progressMsg.message_id);

        } else {
          // 📺 STREAMING : Réponse courte, streaming normal
          await streamer.streamText(response, progressMsg.message_id);
        }
      }

      // 📊 ÉTAPE 5: Métriques et logging
      const duration = Date.now() - startTime;
      globalMetrics.trackRequest(String(this.currentChatId), duration);
      globalMetrics.trackAICall();

      logInfo('Question IA traitée avec succès', 'telegram-bot', {
        userId: this.currentChatId,
        duration: `${duration}ms`,
        responseLength: response.length,
        validationStatus: validation.isValid ? 'OK' : 'WARNINGS',
      });

    } catch (error: any) {
      // 📊 Tracker l'erreur
      const duration = Date.now() - startTime;
      globalMetrics.trackRequest(String(this.currentChatId), duration);
      globalMetrics.trackError('ai_question', error.message, String(this.currentChatId));

      logErrorUtil('Erreur lors du traitement IA', error, 'telegram-bot', { question });

      const safeMessage = sanitizeError(error, 'Erreur lors du traitement de votre question');
      await this.sendMessage(`❌ ${safeMessage}\n\n💡 Essayez de reformuler ou utilisez /help`);
    }
  }

  /**
   * Arrête le bot
   */
  stop(): void {
    this.bot.stopPolling();
    this.invoiceMonitoringService.stop();
    this.rateLimitManager.stopAll();
    console.log('👋 Bot Telegram arrêté');
  }

  /**
   * Démarre le monitoring des factures (à appeler après le démarrage du bot)
   */
  async startMonitoring(): Promise<void> {
    await this.invoiceMonitoringService.start();
  }

  /**
   * Envoie un message à tous les chats autorisés (pour les notifications de monitoring)
   */
  async broadcastMessage(message: string): Promise<void> {
    const authorizedUsers = getAllAuthorizedUsers();

    for (const user of authorizedUsers) {
      try {
        await this.bot.sendMessage(user.chat_id, message, {
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        });
        console.log(`📤 Notification envoyée au chat ${user.chat_id} (${user.username || 'Inconnu'})`);
      } catch (error) {
        console.error(`❌ Erreur lors de l'envoi au chat ${user.chat_id}:`, error);
      }
    }
  }

  /**
   * Envoie un document (PDF) avec un message à tous les chats autorisés
   */
  async broadcastDocument(
    document: Buffer,
    filename: string,
    caption?: string
  ): Promise<void> {
    const authorizedUsers = getAllAuthorizedUsers();

    for (const user of authorizedUsers) {
      try {
        await this.bot.sendDocument(user.chat_id, document, {
          caption: caption,
          parse_mode: 'HTML',
        }, {
          filename: filename,
          contentType: 'application/pdf',
        });
        console.log(`📤 Document envoyé au chat ${user.chat_id} (${user.username || 'Inconnu'}) - ${filename}`);
      } catch (error) {
        console.error(`❌ Erreur lors de l'envoi du document au chat ${user.chat_id}:`, error);
      }
    }
  }

  /**
   * Retourne les stats de monitoring
   */
  getMonitoringStats() {
    return this.invoiceMonitoringService.getStats();
  }
}
