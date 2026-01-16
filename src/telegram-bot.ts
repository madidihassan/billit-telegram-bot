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

      // Répondre au callback pour enlever l'animation de chargement
      try {
        await this.bot.answerCallbackQuery(callbackQuery.id);
      } catch (error: any) {
        console.error('Erreur answerCallbackQuery:', error.message);
      }

      if (!data) return;

      try {
        // Parser le callback data
        const [command, ...args] = data.split(':');
        
        console.log(`📨 Callback commande: ${command} ${args.join(' ')}`);
        
        let response: string;

        // Gérer les commandes spéciales
        if (command === 'menu') {
          this.waitingForInput = null;
          response = await this.commandHandler.handleCommand('help', []);
        } else if (command === 'show_guide') {
          this.waitingForInput = null;
          await this.showUserGuide();
          return;
        } else if (command === 'ai_tools') {
          this.waitingForInput = null;
          response = await this.getAIToolsList();
        } else if (command === 'search_prompt') {
          this.waitingForInput = 'search';
          response = '🔍 <b>Recherche</b>\n\nTapez votre terme de recherche (nom de fournisseur, numéro de facture, etc.)';
        } else if (command === 'supplier_prompt') {
          this.waitingForInput = 'supplier';
          response = '📋 <b>Fournisseur</b>\n\nTapez le nom du fournisseur pour voir toutes ses factures.';
        } else if (command === 'lastinvoice_prompt') {
          this.waitingForInput = 'lastinvoice';
          response = '🧾 <b>Dernière facture</b>\n\nTapez le nom du fournisseur pour voir sa dernière facture.';
        } else {
          // Commandes normales
          this.waitingForInput = null;
          response = await this.commandHandler.handleCommand(command, args);
          
          // Capturer le contexte
          this.captureInvoiceContext(command, args, response);
        }

        await this.sendMessageWithButtons(response);
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
        const isQuestion = this.detectQuestionIntent(validation.sanitized!);

        if (isQuestion) {
          // RATE LIMITING: Limiter les questions IA (plus coûteuses)
          const aiRateLimit = this.rateLimitManager.check('ai', msg.chat.id);
          if (!aiRateLimit.allowed) {
            await this.sendMessage(`⏱️ ${aiRateLimit.message}\n\n<i>Réessayez dans ${Math.ceil(aiRateLimit.resetIn / 1000)} secondes.</i>`);
            return;
          }

          console.log('🤖 Question détectée, traitement par IA conversationnelle');
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

Choisissez une action ci-dessous ou tapez /help pour plus d'infos.`;

    const keyboard = {
      inline_keyboard: [
        [
          { text: '📋 Factures impayées', callback_data: 'unpaid' },
          { text: '⚠️ Factures en retard', callback_data: 'overdue' }
        ],
        [
          { text: '📊 Statistiques du mois', callback_data: 'stats' }
        ],
        [
          { text: '🔍 Rechercher', callback_data: 'search_prompt' },
          { text: '🧾 Dernière facture', callback_data: 'lastinvoice_prompt' }
        ],
        [
          { text: '📁 Factures par fournisseur', callback_data: 'supplier_prompt' }
        ],
        [
          { text: 'ℹ️ Aide', callback_data: 'menu' }
        ]
      ]
    };

    console.log('🎹 Envoi du menu avec', keyboard.inline_keyboard.length, 'rangées de boutons');

    try {
      const result = await this.bot.sendMessage(this.currentChatId, text, {
        parse_mode: 'HTML',
        reply_markup: keyboard
      });
      console.log('✅ Menu envoyé avec succès, message_id:', result.message_id);
    } catch (error: any) {
      console.error('❌ Erreur lors de l\'envoi du menu:', error.message);
      throw error;
    }
  }

  /**
   * Crée le clavier de navigation
   */
  private getNavigationKeyboard(): any {
    return {
      inline_keyboard: [
        [
          { text: '📋 Impayées', callback_data: 'unpaid' },
          { text: '⚠️ En retard', callback_data: 'overdue' }
        ],
        [
          { text: '📅 Échéances', callback_data: 'due' },
          { text: '📊 Stats', callback_data: 'stats' }
        ],
        [
          { text: '🔍 Rechercher', callback_data: 'search_prompt' },
          { text: '🤖 Outils IA', callback_data: 'ai_tools' }
        ],
        [
          { text: '❓ Aide', callback_data: 'menu' }
        ]
      ]
    };
  }

  /**
   * Envoie le message d'aide avec le bouton Guide complet
   */
  private async sendHelpMessage(): Promise<void> {
    const response = await this.commandHandler.handleCommand('help', []);

    const keyboard = {
      inline_keyboard: [
        [
          { text: '📋 Factures impayées', callback_data: 'unpaid' },
          { text: '⚠️ Factures en retard', callback_data: 'overdue' }
        ],
        [
          { text: '📊 Statistiques', callback_data: 'stats' },
          { text: '🔍 Rechercher', callback_data: 'search_prompt' }
        ],
        [
          { text: '📖 Guide complet', callback_data: 'show_guide' },
          { text: '🤖 Outils IA', callback_data: 'ai_tools' }
        ],
        [
          { text: '❓ Aide', callback_data: 'menu' }
        ]
      ]
    };

    await this.bot.sendMessage(this.currentChatId, response, {
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: keyboard
    });
  }

  /**
   * Affiche le guide utilisateur complet
   */
  private async showUserGuide(): Promise<void> {
    try {
      // Version condensée du guide pour tenir dans la limite Telegram
      const guideText = `📖 <b>GUIDE UTILISATEUR - QUESTIONS FRÉQUENTES</b>

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

<b>📋 FACTURES</b>
• "Quelles factures sont impayées ?"
• "Factures de plus de 3000€"
• "Cherche les factures de Foster"
• "Factures de Sligro en novembre"
• "Factures de Colruyt et Makro"

<b>🏢 FOURNISSEURS</b>
• "Top 10 fournisseurs"
• "Analyse les dépenses chez Sligro"
• "Compare Colruyt et Sligro"
• "Combien j'ai dépensé chez Uber Eats ?"
• "Liste tous les fournisseurs"

<b>💵 SALAIRES</b>
• "Salaire de Mokhlis Jamhoun"
• "Top 10 des employés les mieux payés"
• "Analyse les salaires de décembre"
• "Compare Mokhlis et Soufiane"
• "Salaires entre octobre et décembre"

<b>🏦 BANQUE</b>
• "Balance du mois de décembre"
• "Montre les dernières transactions"
• "Solde du compte Europabank"
• "Total des dépenses du mois"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

<b>💡 CONSEILS</b>
• Utilisez "et" pour plusieurs fournisseurs
• Précisez l'année si nécessaire
• Vous pouvez envoyer des messages vocaux !

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

      await this.bot.sendMessage(this.currentChatId, guideText, {
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔙 Retour', callback_data: 'menu' }]
          ]
        }
      });
    } catch (error: any) {
      console.error('Erreur lors de l\'affichage du guide:', error);
      await this.sendMessage('❌ Erreur lors de l\'affichage du guide.');
    }
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

      // Si c'est la commande /help, ajouter le bouton Guide complet
      const isHelpMessage = text.includes("Billit Bot - Guide d'utilisation") || text.includes('MODE CONVERSATIONNEL');
      if (isHelpMessage) {
        console.log('🎨 Détection message /help - utilisation du clavier personnalisé avec bouton Guide');
        keyboard = {
          inline_keyboard: [
            [
              { text: '📋 Factures impayées', callback_data: 'unpaid' },
              { text: '⚠️ Factures en retard', callback_data: 'overdue' }
            ],
            [
              { text: '📊 Statistiques', callback_data: 'stats' },
              { text: '🔍 Rechercher', callback_data: 'search_prompt' }
            ],
            [
              { text: '📖 Guide complet', callback_data: 'show_guide' },
              { text: '🤖 Outils IA', callback_data: 'ai_tools' }
            ],
            [
              { text: '❓ Aide', callback_data: 'menu' }
            ]
          ]
        };
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
   */
  private detectQuestionIntent(text: string): boolean {
    const t = text.toLowerCase().trim();

    // Mots-clés qui indiquent une question explicite
    const questionWords = [
      'combien', 'quel', 'quelle', 'quels', 'quelles',
      'montre', 'montrez', 'show', 'voir',
      'liste', 'list', 'lister',
      'calcule', 'calculer',
      'total', 'somme', 'moyenne',
      'analyse', 'analyser',
      'compare', 'comparer',
      'cherche', 'recherche', 'rechercher', 'search',
      'où', 'quand', 'comment', 'pourquoi',
      'est-ce que', 'est ce que',
      '?', '¿', '？'
    ];

    // Vérifier si le texte contient un mot-clé de question
    const hasQuestionWord = questionWords.some(word => t.includes(word));

    // Vérifier si c'est une phrase courte (moins de 100 caractères)
    const isShortMessage = text.length < 100;

    // Vérifier si ce n'est pas juste "salut", "merci", etc.
    const greetings = ['salut', 'bonjour', 'hello', 'hi', 'hey', 'merci', 'thanks', 'ok', 'oui', 'non'];
    const isGreeting = greetings.some(g => t === g || t === g + ' ');

    // AMÉLIORATION: Traiter TOUS les messages courts comme des requêtes IA
    // Sauf les greetings. Ça permet de gérer les réponses comme "Pluxee belgium"
    // ou "Moniz M-O-N-I-Z-Z-E" même sans mot-clé de question.
    return isShortMessage && !isGreeting;
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
