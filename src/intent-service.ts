import Groq from 'groq-sdk';
import { config } from './config';

export interface Intent {
  command: string;
  args: string[];
  confidence: number;
}

export class IntentService {
  private groq: Groq;

  constructor() {
    this.groq = new Groq({
      apiKey: config.groq.apiKey,
    });
  }

  /**
   * Analyse une phrase en langage naturel et extrait l'intention
   */
  async analyzeIntent(text: string, lastInvoiceNumber?: string | null): Promise<Intent> {
    try {
      console.log('🧠 Analyse de l\'intention avec Llama...');
      
      // Ajouter le contexte si une facture a été consultée récemment
      const contextInfo = lastInvoiceNumber 
        ? `\n\n🔖 CONTEXTE IMPORTANT: L'utilisateur vient de consulter la facture numéro ${lastInvoiceNumber}. 
Si il dit "cette facture", "le détail", "plus d'infos", "donne-moi le détail", etc., 
tu DOIS utiliser ${lastInvoiceNumber} comme argument de la commande invoice.
Exemple: "le détail de cette facture" → {"command": "invoice", "args": ["${lastInvoiceNumber}"], "confidence": 0.95}`
        : '';

      const prompt = `Tu es un assistant qui analyse des demandes concernant des factures ET des transactions bancaires et les convertit en commandes.

Commandes disponibles:

📋 FACTURES:
- unpaid: Liste des factures impayées (NON payées)
- paid: Liste des factures payées
- overdue: Factures en retard
- stats: Statistiques factures du mois
- lastinvoice [fournisseur]: Dernière facture d'un fournisseur
- search [terme]: Rechercher des factures
- supplier [fournisseur]: Toutes les factures d'un fournisseur
- invoice [numéro]: Détails complets d'une facture avec lignes
- list_suppliers: Liste de tous les fournisseurs disponibles
- list_employees: Liste de tous les employés

💰 TRANSACTIONS BANCAIRES:
- recettes_mois: Toutes les rentrées (recettes) du mois en cours
- depenses_mois: Toutes les sorties (dépenses) du mois en cours
- transactions_mois: Toutes les transactions du mois (rentrées + sorties)
- balance_mois: Balance du mois (rentrées - sorties)
- transactions_fournisseur [nom]: Toutes les transactions liées à un fournisseur (factures + paiements bancaires)
- transactions_periode [date1] [date2]: Transactions entre deux dates (format: YYYY-MM-DD ou DD/MM/YYYY)

ℹ️ AIDE:
- help: Afficher l'aide

Analyse cette demande et réponds UNIQUEMENT au format JSON suivant:
{
  "command": "nom_de_la_commande",
  "args": ["argument1", "argument2"],
  "confidence": 0.95
}

Exemples FACTURES:
- "Liste les factures de Foster" → {"command": "supplier", "args": ["Foster"], "confidence": 0.95}
- "Montre-moi ce que je dois payer" → {"command": "unpaid", "args": [], "confidence": 0.90}
- "Factures impayées" → {"command": "unpaid", "args": [], "confidence": 0.95}
- "Facture impayée" → {"command": "unpaid", "args": [], "confidence": 0.95}
- "Impayé" → {"command": "unpaid", "args": [], "confidence": 0.90}
- "Impayées" → {"command": "unpaid", "args": [], "confidence": 0.90}
- "Non payées" → {"command": "unpaid", "args": [], "confidence": 0.90}
- "Pas payées" → {"command": "unpaid", "args": [], "confidence": 0.90}
- "À payer" → {"command": "unpaid", "args": [], "confidence": 0.90}
- "Factures payées" → {"command": "paid", "args": [], "confidence": 0.95}
- "Facture payée" → {"command": "paid", "args": [], "confidence": 0.95}
- "Payé" → {"command": "paid", "args": [], "confidence": 0.85}
- "Payées" → {"command": "paid", "args": [], "confidence": 0.85}
- "En retard" → {"command": "overdue", "args": [], "confidence": 0.90}
- "Retard" → {"command": "overdue", "args": [], "confidence": 0.85}
- "Dernière facture CIERS" → {"command": "lastinvoice", "args": ["CIERS"], "confidence": 0.95}
- "Combien de factures en retard ?" → {"command": "overdue", "args": [], "confidence": 0.90}
- "Détails de la facture INV-001" → {"command": "invoice", "args": ["INV-001"], "confidence": 0.95}
- "Donne-moi la liste des fournisseurs" → {"command": "list_suppliers", "args": [], "confidence": 0.95}
- "Liste des fournisseurs" → {"command": "list_suppliers", "args": [], "confidence": 0.95}
- "Fournisseurs" → {"command": "list_suppliers", "args": [], "confidence": 0.90}
- "Quels sont mes fournisseurs" → {"command": "list_suppliers", "args": [], "confidence": 0.90}
- "Donne-moi la liste de tous les employés" → {"command": "list_employees", "args": [], "confidence": 0.95}
- "Liste des employés" → {"command": "list_employees", "args": [], "confidence": 0.95}
- "Employés" → {"command": "list_employees", "args": [], "confidence": 0.90}
- "Quels sont mes employés" → {"command": "list_employees", "args": [], "confidence": 0.90}
- "Personnel" → {"command": "list_employees", "args": [], "confidence": 0.85}

Exemples TRANSACTIONS BANCAIRES:
- "Quelles sont les recettes de ce mois-ci ?" → {"command": "recettes_mois", "args": [], "confidence": 0.95}
- "Recettes du mois" → {"command": "recettes_mois", "args": [], "confidence": 0.95}
- "Donne-moi les recettes du mois" → {"command": "recettes_mois", "args": [], "confidence": 0.95}
- "Combien j'ai gagné ce mois" → {"command": "recettes_mois", "args": [], "confidence": 0.90}
- "Rentrées du mois" → {"command": "recettes_mois", "args": [], "confidence": 0.95}
- "Dépenses du mois" → {"command": "depenses_mois", "args": [], "confidence": 0.95}
- "Sorties du mois" → {"command": "depenses_mois", "args": [], "confidence": 0.95}
- "Salaires du mois" → {"command": "depenses_mois", "args": [], "confidence": 0.95}
- "Quel est le salaire payé ce mois" → {"command": "depenses_mois", "args": [], "confidence": 0.95}
- "Combien j'ai payé en salaires" → {"command": "depenses_mois", "args": [], "confidence": 0.90}
- "Total des salaires" → {"command": "depenses_mois", "args": [], "confidence": 0.90}
- "Toutes les transactions du mois" → {"command": "transactions_mois", "args": [], "confidence": 0.95}
- "Balance du mois" → {"command": "balance_mois", "args": [], "confidence": 0.95}
- "Quelle est ma balance ce mois ?" → {"command": "balance_mois", "args": [], "confidence": 0.90}
- "Donne-moi les transactions Foster" → {"command": "transactions_fournisseur", "args": ["Foster"], "confidence": 0.95}
- "Toutes les transactions de Foster" → {"command": "transactions_fournisseur", "args": ["Foster"], "confidence": 0.95}

Exemples AVEC DATES/PÉRIODES SPÉCIFIQUES:
- "Recettes du mois de juillet 2025" → {"command": "transactions_periode", "args": ["2025-07-01", "2025-07-31", "recettes"], "confidence": 0.90}
- "Recettes de juillet" → {"command": "transactions_periode", "args": ["2025-07-01", "2025-07-31", "recettes"], "confidence": 0.90}
- "Recettes d'octobre" → {"command": "transactions_periode", "args": ["2025-10-01", "2025-10-31", "recettes"], "confidence": 0.90}
- "Recettes de novembre" → {"command": "transactions_periode", "args": ["2025-11-01", "2025-11-30", "recettes"], "confidence": 0.90}
- "Recettes de décembre" → {"command": "transactions_periode", "args": ["2025-12-01", "2025-12-31", "recettes"], "confidence": 0.90}
- "Combien j'ai gagné en octobre" → {"command": "transactions_periode", "args": ["2025-10-01", "2025-10-31", "recettes"], "confidence": 0.90}
- "Combien j'ai gagné en novembre" → {"command": "transactions_periode", "args": ["2025-11-01", "2025-11-30", "recettes"], "confidence": 0.90}
- "Transactions de juillet" → {"command": "transactions_periode", "args": ["2025-07-01", "2025-07-31"], "confidence": 0.85}
- "Recettes de janvier à mars 2025" → {"command": "transactions_periode", "args": ["2025-01-01", "2025-03-31", "recettes"], "confidence": 0.85}
- "Dépenses de juillet" → {"command": "transactions_periode", "args": ["2025-07-01", "2025-07-31", "depenses"], "confidence": 0.85}
- "Salaires de novembre" → {"command": "transactions_periode", "args": ["2025-11-01", "2025-11-30", "salaires"], "confidence": 0.90}
- "Quel est le salaire payé pour le mois de novembre" → {"command": "transactions_periode", "args": ["2025-11-01", "2025-11-30", "salaires"], "confidence": 0.95}
- "Salaires du mois de novembre" → {"command": "transactions_periode", "args": ["2025-11-01", "2025-11-30", "salaires"], "confidence": 0.95}
- "Montant des salaires de novembre" → {"command": "transactions_periode", "args": ["2025-11-01", "2025-11-30", "salaires"], "confidence": 0.95}
- "Donne-moi le montant des salaires du mois de novembre" → {"command": "transactions_periode", "args": ["2025-11-01", "2025-11-30", "salaires"], "confidence": 0.95}
- "Combien j'ai payé en salaires en novembre" → {"command": "transactions_periode", "args": ["2025-11-01", "2025-11-30", "salaires"], "confidence": 0.90}
- "Transactions du 1er janvier au 1er décembre" → {"command": "transactions_periode", "args": ["2025-01-01", "2025-12-01"], "confidence": 0.85}
- "Transactions entre le 01/01/2025 et le 01/12/2025" → {"command": "transactions_periode", "args": ["2025-01-01", "2025-12-01"], "confidence": 0.85}

Exemples COMPARAISONS DEUX PÉRIODES:
- "Compare octobre et novembre" → {"command": "unpaid", "args": [], "confidence": 0.50}
- "Compare les recettes d'octobre et novembre" → {"command": "unpaid", "args": [], "confidence": 0.50}
- "Combien j'ai gagné en octobre par rapport à novembre" → {"command": "unpaid", "args": [], "confidence": 0.50}
- ATTENTION: Les comparaisons entre périodes ne sont PAS supportées par le système actuel. Utilisez une commande simple.

Exemples FOURNISSEUR + PÉRIODE SPÉCIFIQUE:
- "Transactions Foster du mois de novembre" → {"command": "transactions_periode", "args": ["2025-11-01", "2025-11-30", "Foster"], "confidence": 0.90}
- "Toutes les transactions du mois de novembre pour le fournisseur Foster" → {"command": "transactions_periode", "args": ["2025-11-01", "2025-11-30", "Foster"], "confidence": 0.95}
- "Transactions de Foster en juillet" → {"command": "transactions_periode", "args": ["2025-07-01", "2025-07-31", "Foster"], "confidence": 0.90}
- "Donne-moi les paiements Foster de ce mois" → {"command": "transactions_fournisseur", "args": ["Foster"], "confidence": 0.90}
- "Recettes Foster de novembre" → {"command": "transactions_periode", "args": ["2025-11-01", "2025-11-30", "recettes", "Foster"], "confidence": 0.85}

IMPORTANT - RÈGLES STRICTES:
- Fais bien la différence entre "payées" (paid) et "impayées" (unpaid) pour les factures !
- Pour les dates, convertis toujours au format YYYY-MM-DD
- "Recettes" = rentrées = argent reçu sur le compte bancaire → recettes_mois (PAS stats !)
- "Dépenses" = sorties = argent dépensé → depenses_mois
- "Salaires" = argent PAYÉ aux employés = utiliser transactions_periode avec argument "salaires" (pas "depenses" !)
- ATTENTION: Pour les salaires, utilise TOUJOURS l'argument "salaires" pour filtrer uniquement les paiements aux employés !
- "Dépenses" inclut tout (fournisseurs + salaires + achats), "Salaires" = uniquement employés
- Si un MOIS SPÉCIFIQUE est mentionné (ex: "juillet", "janvier"), utilise transactions_periode avec le début et fin du mois
- Mois: janvier=01, février=02, mars=03, avril=04, mai=05, juin=06, juillet=07, août=08, septembre=09, octobre=10, novembre=11, décembre=12
- "Recettes du mois" (SANS mois spécifique) = recettes_mois (mois actuel)
- "Recettes de juillet" (AVEC mois spécifique) = transactions_periode avec dates de juillet
- Si un FOURNISSEUR + PÉRIODE sont mentionnés ensemble: transactions_periode avec [date1, date2, fournisseur]
- L'ordre des args pour transactions_periode: [date_debut, date_fin, type_optionnel, fournisseur_optionnel]
- Types possibles: "recettes", "depenses", "salaires", ou nom de fournisseur${contextInfo}

Demande de l'utilisateur: "${text}"

Réponds UNIQUEMENT avec le JSON, sans explication:`;

      const completion = await this.groq.chat.completions.create({
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        model: 'llama-3.1-8b-instant', // Modèle léger et rapide (5-10x moins de tokens que 70B)
        temperature: 0.0, // Maximum de précision, zéro créativité
        max_tokens: 150,
      });

      const response = completion.choices[0]?.message?.content || '';
      console.log('📝 Réponse Llama:', response);

      // Parser le JSON
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Format de réponse invalide');
      }

      const intent: Intent = JSON.parse(jsonMatch[0]);
      
      console.log('✅ Intention détectée:', intent);
      return intent;

    } catch (error: any) {
      console.error('❌ Erreur lors de l\'analyse de l\'intention:', error.message);
      
      // Fallback: retourner une intention par défaut
      return {
        command: 'help',
        args: [],
        confidence: 0.1,
      };
    }
  }

  /**
   * Vérifie si le service est configuré
   */
  isConfigured(): boolean {
    return !!config.groq.apiKey && config.groq.apiKey.length > 0;
  }
}
