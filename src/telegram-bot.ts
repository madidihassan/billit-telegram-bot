import TelegramBot from 'node-telegram-bot-api';
import { config } from './config';
import { CommandHandler } from './command-handler';
import { VoiceService } from './voice-service';
import { IntentService } from './intent-service';
import fs from 'fs';
import path from 'path';

export class TelegramBotInteractive {
  private bot: TelegramBot;
  private commandHandler: CommandHandler;
  private chatId: string;
  private waitingForInput: string | null = null; // Pour mémoriser l'état de la conversation
  private lastInvoiceNumber: string | null = null; // Mémoriser la dernière facture consultée
  private voiceService: VoiceService;
  private intentService: IntentService;

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
    this.voiceService = new VoiceService();
    this.intentService = new IntentService();
    
    console.log('🔧 Configuration du bot Telegram...');
    console.log('   Chat ID:', this.chatId);
    console.log('   Reconnaissance vocale:', this.voiceService.isConfigured() ? '✅ Activée' : '❌ Désactivée');
    console.log('   Compréhension IA:', this.intentService.isConfigured() ? '✅ Activée' : '❌ Désactivée');
    
    this.setupHandlers();
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

      // Vérifier que le message vient du bon chat
      if (msg && msg.chat.id.toString() !== this.chatId) {
        console.log(`⚠️  Callback ignoré d'un chat non autorisé: ${msg.chat.id}`);
        return;
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
        await this.sendMessage(`❌ Erreur: ${error.message}`);
      }
    });

    // Gérer les commandes
    this.bot.onText(/^\/(\w+)(.*)/, async (msg, match) => {
      // Vérifier que le message vient du bon chat
      if (msg.chat.id.toString() !== this.chatId) {
        console.log(`⚠️  Message ignoré d'un chat non autorisé: ${msg.chat.id}`);
        return;
      }

      if (!match) return;

      const command = match[1];
      const argsString = match[2].trim();
      const args = argsString ? argsString.split(/\s+/) : [];

      try {
        const response = await this.commandHandler.handleCommand(command, args);
        
        // Capturer le contexte
        this.captureInvoiceContext(command, args, response);
        
        await this.sendMessageWithButtons(response);
      } catch (error: any) {
        console.error('Erreur lors du traitement de la commande:', error);
        await this.sendMessage(`❌ Erreur: ${error.message}`);
      }
    });

    // Gérer les messages texte normaux (sans commande)
    this.bot.on('message', async (msg) => {
      console.log('📩 Event message:', msg.text || msg.voice ? '🎤 Voice' : msg.caption || '[media]', 'from chat:', msg.chat.id);
      
      // Vérifier que le message vient du bon chat
      if (msg.chat.id.toString() !== this.chatId) {
        return;
      }

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
        console.log('📨 Réponse reçue pour:', this.waitingForInput, '- Valeur:', msg.text);
        
        try {
          let response: string;
          
          const command = this.waitingForInput;
          const args = [msg.text];
          
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
          await this.sendMessage(`❌ Erreur: ${error.message}`);
        }
        
        return;
      }

      // Répondre aux messages non-commandes avec le menu
      if (msg.text) {
        console.log('📨 Message texte reçu, envoi du menu');
        await this.sendWelcomeMessage();
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
      const result = await this.bot.sendMessage(this.chatId, text, {
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
          { text: '⚠️ En retard', callback_data: 'overdue' },
          { text: '📊 Stats', callback_data: 'stats' }
        ],
        [
          { text: '🔍 Rechercher', callback_data: 'search_prompt' },
          { text: '🏠 Menu principal', callback_data: 'menu' }
        ]
      ]
    };
  }

  /**
   * Envoie un message avec les boutons de navigation
   */
  async sendMessageWithButtons(text: string): Promise<void> {
    try {
      await this.bot.sendMessage(this.chatId, text, {
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: this.getNavigationKeyboard()
      });
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
      await this.bot.sendMessage(this.chatId, text, {
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

      // Télécharger le fichier
      const fileUrl = `https://api.telegram.org/file/bot${config.telegram.botToken}/${file.file_path}`;
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
      await this.sendMessage(`❌ Erreur lors de la transcription: ${error.message}`);
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
   * Traite une commande vocale transcrite avec IA
   */
  private async processVoiceCommand(text: string): Promise<void> {
    try {
      // Utiliser l'IA pour comprendre l'intention
      await this.sendMessage('🧠 Analyse de votre demande...');
      
      const intent = await this.intentService.analyzeIntent(text, this.lastInvoiceNumber);
      
      console.log('🎯 Intention détectée:', intent);

      // Vérifier la confiance
      if (intent.confidence < 0.5) {
        await this.sendMessage(`❓ Je ne suis pas sûr d'avoir compris: "${text}"\n\n<b>Exemples de demandes:</b>\n• "Liste les factures de Foster"\n• "Montre-moi ce que je dois payer"\n• "Combien de factures en retard ?"\n• "Dernière facture CIERS"\n• "Cherche tout sur Foster"`);
        return;
      }

      // Exécuter la commande
      const response = await this.commandHandler.handleCommand(intent.command, intent.args);
      
      // Capturer le contexte
      this.captureInvoiceContext(intent.command, intent.args, response);

      await this.sendMessageWithButtons(response);

    } catch (error: any) {
      console.error('Erreur lors du traitement de la commande vocale:', error);
      await this.sendMessage(`❌ Erreur: ${error.message}`);
    }
  }

  /**
   * Arrête le bot
   */
  stop(): void {
    this.bot.stopPolling();
    console.log('👋 Bot Telegram arrêté');
  }
}
