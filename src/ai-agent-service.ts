import Groq from 'groq-sdk';
import { config } from './config';
import { CommandHandler } from './command-handler';

/**
 * Service d'agent IA autonome avec Function Calling
 * L'IA peut choisir dynamiquement quelles fonctions appeler pour répondre à n'importe quelle question
 */
export class AIAgentService {
  private groq: Groq;
  private commandHandler: CommandHandler;
  private tools: Groq.Chat.Completions.ChatCompletionTool[];

  constructor(commandHandler: CommandHandler) {
    this.groq = new Groq({
      apiKey: config.groq.apiKey,
    });
    this.commandHandler = commandHandler;
    this.tools = this.defineTools();

    console.log('✓ Agent IA autonome initialisé avec', this.tools.length, 'outils disponibles');
  }

  /**
   * Définit tous les outils (commandes) disponibles pour l'IA
   */
  private defineTools(): Groq.Chat.Completions.ChatCompletionTool[] {
    return [
      // Factures
      {
        type: 'function',
        function: {
          name: 'get_unpaid_invoices',
          description: 'Obtenir toutes les factures impayées (non payées, à payer)',
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
          name: 'get_paid_invoices',
          description: 'Obtenir toutes les factures payées (déjà réglées)',
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
          name: 'get_overdue_invoices',
          description: 'Obtenir toutes les factures en retard (échéance dépassée)',
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
          name: 'get_invoice_stats',
          description: 'Obtenir les statistiques des factures du mois en cours',
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
          name: 'search_invoices',
          description: 'Rechercher des factures par terme de recherche (nom fournisseur, numéro facture, etc.)',
          parameters: {
            type: 'object',
            properties: {
              search_term: {
                type: 'string',
                description: 'Le terme à rechercher (nom de fournisseur, numéro de facture, etc.)',
              },
            },
            required: ['search_term'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_supplier_invoices',
          description: 'Obtenir toutes les factures d\'un fournisseur spécifique',
          parameters: {
            type: 'object',
            properties: {
              supplier_name: {
                type: 'string',
                description: 'Le nom du fournisseur',
              },
            },
            required: ['supplier_name'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_last_invoice_by_supplier',
          description: 'Obtenir la dernière facture d\'un fournisseur',
          parameters: {
            type: 'object',
            properties: {
              supplier_name: {
                type: 'string',
                description: 'Le nom du fournisseur',
              },
            },
            required: ['supplier_name'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_invoice_details',
          description: 'Obtenir les détails complets d\'une facture par son numéro',
          parameters: {
            type: 'object',
            properties: {
              invoice_number: {
                type: 'string',
                description: 'Le numéro de facture',
              },
            },
            required: ['invoice_number'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'list_suppliers',
          description: 'Lister tous les fournisseurs connus',
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
          description: 'Lister tous les employés',
          parameters: {
            type: 'object',
            properties: {},
            required: [],
          },
        },
      },

      // Transactions bancaires
      {
        type: 'function',
        function: {
          name: 'get_monthly_transactions',
          description: 'Obtenir toutes les transactions bancaires du mois en cours',
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
          name: 'get_monthly_credits',
          description: 'Obtenir les recettes/rentrées bancaires du mois en cours',
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
          name: 'get_monthly_debits',
          description: 'Obtenir les dépenses/sorties bancaires du mois en cours',
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
          name: 'get_monthly_balance',
          description: 'Obtenir la balance bancaire du mois en cours (rentrées - sorties)',
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
          name: 'get_supplier_transactions',
          description: 'Obtenir toutes les transactions bancaires d\'un fournisseur',
          parameters: {
            type: 'object',
            properties: {
              supplier_name: {
                type: 'string',
                description: 'Le nom du fournisseur',
              },
            },
            required: ['supplier_name'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_period_transactions',
          description: 'Obtenir les transactions bancaires pour une période donnée',
          parameters: {
            type: 'object',
            properties: {
              start_date: {
                type: 'string',
                description: 'Date de début au format YYYY-MM-DD',
              },
              end_date: {
                type: 'string',
                description: 'Date de fin au format YYYY-MM-DD',
              },
              filter_type: {
                type: 'string',
                description: 'Type de transactions: recettes, depenses, salaires, ou vide pour toutes',
                enum: ['recettes', 'depenses', 'salaires', ''],
              },
              supplier_name: {
                type: 'string',
                description: 'Nom du fournisseur pour filtrer (optionnel)',
              },
            },
            required: ['start_date', 'end_date'],
          },
        },
      },
    ];
  }

  /**
   * Exécute une fonction (tool call) et retourne le résultat
   */
  private async executeFunction(functionName: string, args: any): Promise<string> {
    console.log(`🔧 Exécution de la fonction: ${functionName}`, args);

    try {
      switch (functionName) {
        // Factures
        case 'get_unpaid_invoices':
          return await this.commandHandler.handleCommand('unpaid', []);

        case 'get_paid_invoices':
          return await this.commandHandler.handleCommand('paid', []);

        case 'get_overdue_invoices':
          return await this.commandHandler.handleCommand('overdue', []);

        case 'get_invoice_stats':
          return await this.commandHandler.handleCommand('stats', []);

        case 'search_invoices':
          return await this.commandHandler.handleCommand('search', [args.search_term]);

        case 'get_supplier_invoices':
          return await this.commandHandler.handleCommand('supplier', [args.supplier_name]);

        case 'get_last_invoice_by_supplier':
          return await this.commandHandler.handleCommand('lastinvoice', [args.supplier_name]);

        case 'get_invoice_details':
          return await this.commandHandler.handleCommand('invoice', [args.invoice_number]);

        case 'list_suppliers':
          return await this.commandHandler.handleCommand('list_suppliers', []);

        case 'list_employees':
          return await this.commandHandler.handleCommand('list_employees', []);

        // Transactions bancaires
        case 'get_monthly_transactions':
          return await this.commandHandler.handleCommand('transactions_mois', []);

        case 'get_monthly_credits':
          return await this.commandHandler.handleCommand('recettes_mois', []);

        case 'get_monthly_debits':
          return await this.commandHandler.handleCommand('depenses_mois', []);

        case 'get_monthly_balance':
          return await this.commandHandler.handleCommand('balance_mois', []);

        case 'get_supplier_transactions':
          return await this.commandHandler.handleCommand('transactions_fournisseur', [args.supplier_name]);

        case 'get_period_transactions':
          const periodArgs = [args.start_date, args.end_date];
          if (args.filter_type) {
            periodArgs.push(args.filter_type);
          }
          if (args.supplier_name) {
            periodArgs.push(args.supplier_name);
          }
          return await this.commandHandler.handleCommand('transactions_periode', periodArgs);

        default:
          return `❌ Fonction inconnue: ${functionName}`;
      }
    } catch (error: any) {
      console.error(`❌ Erreur lors de l'exécution de ${functionName}:`, error);
      return `Erreur: ${error.message}`;
    }
  }

  /**
   * Traite une question en langage naturel avec function calling autonome
   */
  async processQuestion(question: string): Promise<string> {
    try {
      console.log('🤖 Question reçue:', question);

      const messages: Groq.Chat.Completions.ChatCompletionMessageParam[] = [
        {
          role: 'system',
          content: `Tu es un assistant expert pour la gestion d'entreprise. Tu as accès à des outils pour récupérer des informations sur les factures et transactions bancaires.

RÈGLES IMPORTANTES:
1. **Utilise les outils** disponibles pour récupérer les données nécessaires
2. **Synthétise les réponses** - NE répète PAS les données brutes ligne par ligne
3. **Sois CONCIS** - réponds avec l'information essentielle demandée
4. **Format naturel** - comme si tu parlais à un humain
5. **Utilise des émojis** pour la lisibilité (mais avec parcimonie)

EXEMPLES DE BONNES RÉPONSES:
Question: "Combien j'ai gagné ce mois ?"
❌ MAUVAIS: [Liste de 58 transactions...]
✅ BON: "Ce mois-ci, vous avez généré 46 060,32 € de recettes provenant de 58 transactions, principalement par carte bancaire (VISA, Mastercard, Maestro)."

Question: "Factures impayées ?"
❌ MAUVAIS: [Dump complet des factures...]
✅ BON: "Vous avez 5 factures impayées pour un total de 12 345,67 €. Les principaux fournisseurs sont Foster (4 500 €) et CIERS (3 200 €)."

Question: "Compare octobre et novembre"
✅ BON: "Recettes - Octobre: 42 000 €, Novembre: 46 000 € (+4 000 €, +9.5%). Vos recettes sont en hausse."

**TU DOIS ANALYSER et RÉSUMER, pas copier-coller !**`,
        },
        {
          role: 'user',
          content: question,
        },
      ];

      let iteration = 0;
      const MAX_ITERATIONS = 5; // Limite de sécurité

      while (iteration < MAX_ITERATIONS) {
        iteration++;
        console.log(`\n🔄 Itération ${iteration}...`);

        // Appel à l'IA avec les tools
        const response = await this.groq.chat.completions.create({
          model: 'llama-3.3-70b-versatile',
          messages,
          tools: this.tools,
          tool_choice: 'auto',
          temperature: 0.1,
          max_tokens: 2000,
        });

        const message = response.choices[0]?.message;

        if (!message) {
          throw new Error('Aucune réponse de l\'IA');
        }

        // Ajouter la réponse de l'IA à l'historique
        messages.push(message);

        // Si l'IA veut appeler des fonctions
        if (message.tool_calls && message.tool_calls.length > 0) {
          console.log(`📞 L'IA veut appeler ${message.tool_calls.length} fonction(s)`);

          // Exécuter toutes les fonctions demandées
          for (const toolCall of message.tool_calls) {
            const functionName = toolCall.function.name;
            const functionArgs = JSON.parse(toolCall.function.arguments);

            console.log(`  → ${functionName}(${JSON.stringify(functionArgs)})`);

            // Exécuter la fonction
            const result = await this.executeFunction(functionName, functionArgs);

            console.log(`  ✓ Résultat obtenu (${result.length} caractères)`);

            // Ajouter le résultat à l'historique
            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: result,
            });
          }

          // Continuer la boucle pour que l'IA synthétise la réponse
          continue;
        }

        // Si l'IA a une réponse finale (sans tool calls)
        if (message.content) {
          console.log('✅ Réponse finale générée');
          return message.content;
        }

        // Sécurité: si ni tool_calls ni content, sortir
        break;
      }

      if (iteration >= MAX_ITERATIONS) {
        return '❌ Désolé, je n\'ai pas pu traiter votre demande (trop d\'itérations).';
      }

      return '❌ Désolé, je n\'ai pas pu générer une réponse.';

    } catch (error: any) {
      console.error('❌ Erreur lors du traitement:', error);
      return `❌ Une erreur s'est produite: ${error.message}\n\n💡 Essayez de reformuler votre question.`;
    }
  }

  /**
   * Vérifie si le service est configuré
   */
  isConfigured(): boolean {
    return !!config.groq.apiKey && config.groq.apiKey.length > 0;
  }
}
