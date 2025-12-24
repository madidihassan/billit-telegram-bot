import Groq from 'groq-sdk';
import { config } from './config';
import { CommandHandler } from './command-handler';
import fs from 'fs';
import path from 'path';

/**
 * Service de conversation IA pour Billit Bot
 * Permet de poser des questions en langage naturel et obtenir des réponses contextuelles
 */
export class AIConversationService {
  private groq: Groq;
  private commandHandler: CommandHandler;
  private expertPrompt: string;

  constructor(commandHandler: CommandHandler) {
    this.groq = new Groq({
      apiKey: config.groq.apiKey,
    });
    this.commandHandler = commandHandler;

    // Utiliser le prompt expert intégré
    this.expertPrompt = this.getExpertPrompt();
    console.log('✓ Prompt IA expert chargé (intégré)');
  }

  /**
   * Traite une question en langage naturel et génère une réponse contextuelle
   */
  async processQuestion(question: string): Promise<string> {
    try {
      console.log('🧠 Traitement de la question IA:', question);

      // Étape 1: Analyser la question et identifier les données nécessaires
      const analysisResult = await this.analyzeQuestion(question);

      console.log('📋 Analyse:', analysisResult);

      // Étape 2: Exécuter les commandes nécessaires pour récupérer les données
      const contextData = await this.fetchContextData(analysisResult);

      console.log('📊 Données récupérées:', Object.keys(contextData));

      // Étape 3: Générer une réponse naturelle avec les données
      const response = await this.generateNaturalResponse(question, contextData);

      console.log('✅ Réponse IA générée');
      return response;

    } catch (error: any) {
      console.error('❌ Erreur lors du traitement IA:', error.message);
      return `❌ Je suis désolé, je n'ai pas pu traiter votre demande. Erreur: ${error.message}\n\n💡 Essayez de reformuler votre question ou utilisez /help pour voir les commandes disponibles.`;
    }
  }

  /**
   * Analyse la question pour identifier les commandes à exécuter
   */
  private async analyzeQuestion(question: string): Promise<{
    intent: string;
    commands: Array<{command: string, args: string[], description: string}>;
  }> {
    // Utiliser le prompt expert complet
    const prompt = `${this.expertPrompt}

Question de l'utilisateur: "${question}"

Réponds UNIQUEMENT avec le JSON, sans texte avant ou après:`;


    const completion = await this.groq.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: 'llama-3.3-70b-versatile', // Modèle plus puissant ! (8B → 70B)
      temperature: 0.0,
      max_tokens: 300,
    });

    const response = completion.choices[0]?.message?.content || '';
    console.log('📝 Réponse brute Llama:', response);

    const jsonMatch = response.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      console.log('⚠️  Pas de JSON trouvé, utilisation du fallback');
      // Fallback : essayer d'identifier avec une regex simple
      return this.fallbackAnalysis(question);
    }

    const parsed = JSON.parse(jsonMatch[0]);
    console.log('✅ JSON parsé:', JSON.stringify(parsed, null, 2));

    return parsed;
  }

  /**
   * Analyse de secours si l'IA échoue
   */
  private fallbackAnalysis(question: string): {
    intent: string;
    commands: Array<{command: string, args: string[], description: string}>;
  } {
    const q = question.toLowerCase();

    // Comparaison entre périodes (ex: "compare octobre et novembre")
    if (q.includes('compar') && (q.includes('octobre') || q.includes('novembre') || q.includes('décembre') || q.includes('septembre') || q.includes('janvier') || q.includes('février') || q.includes('mars') || q.includes('avril') || q.includes('mai') || q.includes('juin') || q.includes('juillet') || q.includes('août'))) {

      // Extraire les mois mentionnés
      const moisMap: { [key: string]: { start: string, end: string } } = {
        'janvier': { start: '2025-01-01', end: '2025-01-31' },
        'février': { start: '2025-02-01', end: '2025-02-28' },
        'mars': { start: '2025-03-01', end: '2025-03-31' },
        'avril': { start: '2025-04-01', end: '2025-04-30' },
        'mai': { start: '2025-05-01', end: '2025-05-31' },
        'juin': { start: '2025-06-01', end: '2025-06-30' },
        'juillet': { start: '2025-07-01', end: '2025-07-31' },
        'août': { start: '2025-08-01', end: '2025-08-31' },
        'septembre': { start: '2025-09-01', end: '2025-09-30' },
        'octobre': { start: '2025-10-01', end: '2025-10-31' },
        'novembre': { start: '2025-11-01', end: '2025-11-30' },
        'décembre': { start: '2025-12-01', end: '2025-12-31' }
      };

      const monthsFound = Object.keys(moisMap).filter(m => q.includes(m));

      if (monthsFound.length >= 2) {
        const [m1, m2] = monthsFound;
        return {
          intent: `Comparer ${m1} et ${m2}`,
          commands: [
            { command: 'transactions_periode', args: [moisMap[m1].start, moisMap[m1].end], description: `obtenir les transactions de ${m1}` },
            { command: 'transactions_periode', args: [moisMap[m2].start, moisMap[m2].end], description: `obtenir les transactions de ${m2}` }
          ]
        };
      }
    }

    // Factures payées (AVANT impayées pour éviter confusion)
    if ((q.includes('payé') && !q.includes('impayé')) ||
        q.includes('dernière facture') && (q.includes('payé') || q.includes('réglé'))) {
      return {
        intent: 'Voir les factures payées',
        commands: [{ command: 'paid', args: [], description: 'obtenir les factures payées' }]
      };
    }

    // Factures impayées
    if (q.includes('impayé') || q.includes('à payer') || q.includes('restant à payer') || q.includes('non payé')) {
      return {
        intent: 'Voir les factures impayées',
        commands: [{ command: 'unpaid', args: [], description: 'obtenir les factures impayées' }]
      };
    }

    // Factures en retard
    if (q.includes('retard')) {
      return {
        intent: 'Voir les factures en retard',
        commands: [{ command: 'overdue', args: [], description: 'obtenir les factures en retard' }]
      };
    }

    // Recettes
    if (q.includes('recette') || q.includes('rentrée') || q.includes('gagné')) {
      return {
        intent: 'Voir les recettes du mois',
        commands: [{ command: 'recettes_mois', args: [], description: 'obtenir les recettes' }]
      };
    }

    // Dépenses
    if (q.includes('dépense') || q.includes('sortie') || q.includes('dépensé')) {
      return {
        intent: 'Voir les dépenses du mois',
        commands: [{ command: 'depenses_mois', args: [], description: 'obtenir les dépenses' }]
      };
    }

    // Stats
    if (q.includes('stat') || q.includes('résumé') || q.includes('synthèse')) {
      return {
        intent: 'Voir les statistiques',
        commands: [{ command: 'stats', args: [], description: 'obtenir les statistiques du mois' }]
      };
    }

    // Balance
    if (q.includes('balance') || q.includes('solde')) {
      return {
        intent: 'Voir la balance du mois',
        commands: [{ command: 'balance_mois', args: [], description: 'obtenir la balance' }]
      };
    }

    // Fournisseurs
    if (q.includes('fournisseur') && !q.includes('factures')) {
      return {
        intent: 'Lister les fournisseurs',
        commands: [{ command: 'list_suppliers', args: [], description: 'obtenir la liste des fournisseurs' }]
      };
    }

    // Employés
    if (q.includes('employé') || q.includes('salarié') || q.includes('personnel')) {
      return {
        intent: 'Voir les employés',
        commands: [{ command: 'list_employees', args: [], description: 'obtenir la liste des employés' }]
      };
    }

    // Par défaut
    return {
      intent: 'Question générale',
      commands: [{ command: 'help', args: [], description: 'afficher l\'aide' }]
    };
  }

  /**
   * Exécute les commandes et récupère les données
   */
  private async fetchContextData(analysisResult: any): Promise<{
    [key: string]: any;
  }> {
    const contextData: any = {};

    for (const cmd of analysisResult.commands) {
      try {
        const result = await this.commandHandler.handleCommand(cmd.command, cmd.args);
        contextData[cmd.command] = {
          data: result,
          description: cmd.description
        };
      } catch (error: any) {
        contextData[cmd.command] = {
          error: error.message,
          description: cmd.description
        };
      }
    }

    return contextData;
  }

  /**
   * Génère une réponse naturelle basée sur les données
   */
  private async generateNaturalResponse(question: string, contextData: any): Promise<string> {
    // Construire le contexte pour l'IA
    let contextPrompt = 'Données disponibles :\n\n';

    for (const [key, value] of Object.entries(contextData)) {
      contextPrompt += `## ${key}\n`;
      contextPrompt += `${JSON.stringify(value, null, 2)}\n\n`;
    }

    const prompt = `Tu es un assistant français convivial et professionnel pour la gestion d'entreprise.

Ta tâche : Répondre à la question de l'utilisateur en utilisant les données ci-dessous.
Ta réponse doit être :
- Naturelle et conversationnelle
- Précise et basée sur les données
- Formatée avec des émojis pour la lisibilité
- Concise mais complète

${contextPrompt}

Question de l'utilisateur : "${question}"

Génère une réponse naturelle et utile. Utilise des émojis appropriés.
Si les données contiennent une erreur, explique-le gentiment.
Ta réponse :`;

    const completion = await this.groq.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: 'llama-3.3-70b-versatile', // Modèle plus puissant pour la génération de réponse
      temperature: 0.7,
      max_tokens: 1000,
    });

    const response = completion.choices[0]?.message?.content || 'Je suis désolé, je n\'ai pas pu générer une réponse.';

    // Nettoyer la réponse (enlever les guillemets s'ils sont présents)
    let cleanResponse = response.trim();
    if (cleanResponse.startsWith('"') && cleanResponse.endsWith('"')) {
      cleanResponse = cleanResponse.slice(1, -1);
    }

    return cleanResponse;
  }

  /**
   * Retourne le prompt expert complet
   */
  private getExpertPrompt(): string {
    return `Tu es un assistant EXPERT qui analyse des demandes concernant des FACTURES et TRANSACTIONS BANCAIRES.

═══════════════════════════════════════════════════════════════════
📋 COMMANDES - FACTURES
═══════════════════════════════════════════════════════════════════

1. paid → Factures PAYÉES (déjà réglées, triées par date)
2. unpaid → Factures NON PAYÉES (à payer, impayées)
3. overdue → Factures en RETARD (échéance dépassée)
4. stats → Statistiques du mois
5. lastinvoice [fournisseur] → Dernière facture d'un fournisseur
6. supplier [fournisseur] → TOUTES les factures d'un fournisseur
7. invoice [numéro] → Détails complets d'une facture
8. list_suppliers → Liste de tous les fournisseurs
9. list_employees → Liste des employés

💰 COMMANDES - TRANSACTIONS
═══════════════════════════════════════════════════════════════════

10. recettes_mois → Rentrées du mois actuel
11. depenses_mois → Sorties du mois actuel
12. balance_mois → Balance du mois (rentrées - sorties)
13. transactions_fournisseur [nom] → Transactions d'un fournisseur
14. transactions_periode [date1] [date2] [type?] → Transactions entre dates
    Format dates: YYYY-MM-DD

🎯 RÈGLES STRICTES
═══════════════════════════════════════════════════════════════════

✅ "factures payées" ou "dernière facture payée" → commande "paid" (PAS "supplier" !)
✅ "factures impayées" → commande "unpaid"
✅ "dernière facture de [nom]" → commande "lastinvoice" avec nom fournisseur
✅ "toutes les factures de [nom]" → commande "supplier" avec nom
✅ "salaires de [mois]" → transactions_periode avec "salaires"

📅 MOIS 2025
═══════════════════════════════════════════════════════════════════
janvier:01, février:02, mars:03, avril:04, mai:05, juin:06,
juillet:07, août:08, septembre:09, octobre:10, novembre:11, décembre:12

✨ EXEMPLES
═══════════════════════════════════════════════════════════════════

"Donne-moi la dernière facture payée"
→ {"intent": "Dernière facture payée", "commands": [{"command": "paid", "args": [], "description": "factures payées"}]}

"Quelle est la dernière facture qui a été payée ?"
→ {"intent": "Dernière payée", "commands": [{"command": "paid", "args": [], "description": "factures payées triées"}]}

"Factures payées"
→ {"intent": "Voir payées", "commands": [{"command": "paid", "args": [], "description": "factures payées"}]}

"Factures impayées"
→ {"intent": "Voir impayées", "commands": [{"command": "unpaid", "args": [], "description": "factures à payer"}]}

"Dernière facture de Foster"
→ {"intent": "Dernière Foster", "commands": [{"command": "lastinvoice", "args": ["Foster"], "description": "dernière facture Foster"}]}

"Toutes les factures de CIERS"
→ {"intent": "Factures CIERS", "commands": [{"command": "supplier", "args": ["CIERS"], "description": "toutes factures CIERS"}]}

"Factures en retard"
→ {"intent": "En retard", "commands": [{"command": "overdue", "args": [], "description": "factures échues"}]}

"Stats du mois"
→ {"intent": "Stats", "commands": [{"command": "stats", "args": [], "description": "statistiques"}]}

"Recettes du mois"
→ {"intent": "Recettes mois", "commands": [{"command": "recettes_mois", "args": [], "description": "rentrées mois"}]}

"Recettes de novembre"
→ {"intent": "Recettes novembre", "commands": [{"command": "transactions_periode", "args": ["2025-11-01", "2025-11-30", "recettes"], "description": "recettes novembre"}]}

"Salaires de novembre"
→ {"intent": "Salaires novembre", "commands": [{"command": "transactions_periode", "args": ["2025-11-01", "2025-11-30", "salaires"], "description": "salaires novembre"}]}

"Liste des fournisseurs"
→ {"intent": "Liste fournisseurs", "commands": [{"command": "list_suppliers", "args": [], "description": "tous fournisseurs"}]}

"Compare octobre et novembre"
→ {"intent": "Comparer oct/nov", "commands": [{"command": "transactions_periode", "args": ["2025-10-01", "2025-10-31"], "description": "octobre"}, {"command": "transactions_periode", "args": ["2025-11-01", "2025-11-30"], "description": "novembre"}]}

"Transactions Foster en novembre"
→ {"intent": "Transactions Foster nov", "commands": [{"command": "transactions_periode", "args": ["2025-11-01", "2025-11-30", "Foster"], "description": "transactions Foster novembre"}]}

═══════════════════════════════════════════════════════════════════

IMPORTANT:
- "paid" est une COMMANDE, pas un nom de fournisseur !
- "payée" sans "im" = factures PAYÉES (paid)
- "dernière facture payée" = paid (déjà triées par date)

Réponds UNIQUEMENT en JSON:
{"intent": "...", "commands": [{"command": "...", "args": [...], "description": "..."}]}`;
  }

  /**
   * Vérifie si le service est configuré
   */
  isConfigured(): boolean {
    return !!config.groq.apiKey && config.groq.apiKey.length > 0;
  }
}
