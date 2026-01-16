/**
 * Messages de progression avec émojis pour feedback visuel
 *
 * Crée une expérience ChatGPT-like avec des indicateurs de statut
 *
 * @module ProgressMessages
 * @category Utils
 */

/**
 * Messages de progression pour différentes actions
 */
export const ProgressMessages = {
  // Recherche et analyse
  ANALYZING: '🔍 Analyse de votre demande...',
  SEARCHING: '🔎 Recherche dans les données...',
  PROCESSING: '⚙️ Traitement en cours...',
  CALCULATING: '🧮 Calcul des résultats...',
  THINKING: '🤔 Réflexion...',

  // Récupération de données
  FETCHING_INVOICES: '📄 Récupération des factures...',
  FETCHING_TRANSACTIONS: '💳 Récupération des transactions...',
  FETCHING_BANK_DATA: '🏦 Récupération des données bancaires...',
  LOADING_DATA: '📊 Chargement des données...',

  // IA et génération
  AI_WORKING: '🤖 L\'IA travaille sur votre question...',
  GENERATING_RESPONSE: '✍️ Génération de la réponse...',
  SYNTHESIZING: '🧬 Synthèse des informations...',

  // Finalisation
  ALMOST_DONE: '⏳ Presque terminé...',
  FINALIZING: '🎯 Finalisation...',
  DONE: '✅ Terminé !',

  // Erreurs
  ERROR_OCCURRED: '❌ Une erreur s\'est produite',
  RETRYING: '🔄 Nouvelle tentative...',
};

/**
 * Messages de progression spécifiques aux outils IA
 */
export const ToolProgressMessages: Record<string, string> = {
  // Factures
  get_unpaid_invoices: '📄 Récupération des factures impayées...',
  get_paid_invoices: '✅ Récupération des factures payées...',
  get_overdue_invoices: '⚠️ Recherche des factures en retard...',
  get_latest_invoice: '🔍 Recherche de la dernière facture...',
  get_invoice_details: '📋 Récupération des détails de facture...',
  search_invoices: '🔎 Recherche de factures...',
  get_supplier_invoices: '🏪 Factures du fournisseur...',
  mark_invoice_paid: '💰 Marquage de la facture comme payée...',

  // Transactions
  get_bank_balances: '💰 Récupération des soldes bancaires...',
  get_monthly_balance: '📊 Calcul de la balance du mois...',
  get_bank_transactions: '💳 Récupération des transactions...',
  get_recent_invoices: '📄 Factures récentes...',
  analyze_expenses_by_category: '📊 Analyse des dépenses par catégorie...',

  // Employés
  get_employee_salaries: '💼 Récupération des salaires...',
  compare_employee_salaries: '📊 Comparaison des salaires...',
  list_employees: '👥 Liste des employés...',

  // Fournisseurs
  analyze_supplier_expenses: '🏪 Analyse des dépenses fournisseur...',
  compare_supplier_expenses: '📊 Comparaison fournisseurs...',
  list_suppliers: '🏢 Liste des fournisseurs...',
  detect_new_suppliers: '🆕 Détection nouveaux fournisseurs...',

  // Utilisateurs
  list_users: '👤 Liste des utilisateurs...',
  add_user: '➕ Ajout utilisateur...',
  remove_user: '➖ Suppression utilisateur...',

  // Système
  restart_bot: '🔄 Redémarrage du bot...',
};

/**
 * Génère un message de progression basé sur le nom de l'outil
 */
export function getToolProgressMessage(toolName: string): string {
  return ToolProgressMessages[toolName] || ProgressMessages.PROCESSING;
}

/**
 * Messages pour les étapes multi-outils
 */
export function getMultiStepMessage(currentStep: number, totalSteps: number, action: string): string {
  return `⏳ Étape ${currentStep}/${totalSteps}: ${action}`;
}

/**
 * Messages d'erreur amicaux
 */
export const FriendlyErrorMessages = {
  GENERAL_ERROR: '😕 Désolé, j\'ai rencontré un problème. Pourriez-vous reformuler ?',
  API_ERROR: '🔌 Impossible de contacter l\'API. Je réessaie...',
  NO_RESULTS: '🔍 Aucun résultat trouvé pour cette recherche.',
  TIMEOUT: '⏱️ La recherche prend trop de temps. Essayons autrement ?',
  RATE_LIMIT: '⏸️ Trop de requêtes. Attendons quelques secondes...',
  NETWORK_ERROR: '📡 Problème de connexion. Vérification en cours...',
};

/**
 * Messages de succès avec célébration
 */
export const SuccessMessages = {
  INVOICE_MARKED_PAID: '🎉 Facture marquée comme payée !',
  USER_ADDED: '✅ Utilisateur ajouté avec succès !',
  USER_REMOVED: '✅ Utilisateur supprimé !',
  EMPLOYEE_ADDED: '👤 Employé ajouté !',
  EMPLOYEE_REMOVED: '👤 Employé retiré !',
  DATA_UPDATED: '✅ Données mises à jour !',
  CACHE_CLEARED: '🧹 Cache vidé !',
};

/**
 * Génère une séquence de messages de progression pour une longue opération
 */
export class ProgressSequence {
  private messages: string[];
  private currentIndex: number = 0;

  constructor(operation: string) {
    this.messages = this.generateSequence(operation);
  }

  private generateSequence(operation: string): string[] {
    const sequences: Record<string, string[]> = {
      analyze_data: [
        '🔍 Analyse en cours...',
        '📊 Traitement des données...',
        '🧮 Calcul des statistiques...',
        '✍️ Préparation de la réponse...',
      ],
      fetch_invoices: [
        '📄 Connexion à Billit...',
        '🔍 Récupération des factures...',
        '📊 Tri et filtrage...',
        '✅ Données prêtes !',
      ],
      complex_query: [
        '🤔 Analyse de votre question...',
        '🔍 Recherche des données pertinentes...',
        '🧬 Synthèse des informations...',
        '✍️ Génération de la réponse...',
      ],
    };

    return sequences[operation] || [
      ProgressMessages.PROCESSING,
      ProgressMessages.ALMOST_DONE,
    ];
  }

  /**
   * Obtient le prochain message de la séquence
   */
  next(): string | null {
    if (this.currentIndex >= this.messages.length) {
      return null;
    }
    return this.messages[this.currentIndex++];
  }

  /**
   * Réinitialise la séquence
   */
  reset(): void {
    this.currentIndex = 0;
  }

  /**
   * Obtient tous les messages
   */
  getAll(): string[] {
    return [...this.messages];
  }
}

/**
 * Helper pour créer des messages de progression animés
 */
export class AnimatedProgress {
  private frames: string[] = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  private currentFrame: number = 0;

  /**
   * Obtient le prochain frame d'animation
   */
  nextFrame(message: string): string {
    const frame = this.frames[this.currentFrame];
    this.currentFrame = (this.currentFrame + 1) % this.frames.length;
    return `${frame} ${message}`;
  }
}
