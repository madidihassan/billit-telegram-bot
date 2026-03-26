import { BillitClient } from './billit-client';
import { TelegramClient } from './telegram-client';
import { BankClient } from './bank-client';
import { BillitInvoice } from './types';
import { matchesSupplier, getSupplierDisplayName, normalizeSearchTerm as normalizeSupplierTerm, SUPPLIER_ALIASES, addSupplier, deleteSupplier, listSuppliers } from './supplier-aliases';
import { normalizeSearchTerm } from './utils/string-utils';
import { addAuthorizedUser, removeAuthorizedUser, getAllAuthorizedUsers, getUserByChatId, getAllEmployees, hasPermission, getPermissionDeniedMessage } from './database';
import { BankBalanceService } from './bank-balance-service';
import { sanitizeError } from './utils/security';

// Liste des employés (pour filtrer les salaires)
const EMPLOYEE_KEYS = [
  'kalidechami', 'zamounlamya', 'elbarnoussi', 'krimfatima', 'mahjoub',
  'eljaouhari', 'azzabi', 'aboukhalid', 'elbalghiti', 'ourimchi',
  'benyamoune', 'kharbouche', 'afkir', 'ellalouimohamed', 'madidijawad',
  'samat', 'barilyagoubi', 'taglina', 'turbatu', 'qibouz', 'mrabet',
  'madidihassan', 'elmouden', 'satti', 'jamhounmokhlis', 'madidisoufiane'
];

export class CommandHandler {
  private billitClient: BillitClient;
  private telegramClient: TelegramClient;
  private bankClient: BankClient;
  private bankBalanceService: BankBalanceService;

  constructor(billitClient: BillitClient, telegramClient: TelegramClient) {
    this.billitClient = billitClient;
    this.telegramClient = telegramClient;
    this.bankClient = new BankClient();
    this.bankBalanceService = new BankBalanceService();
  }

  /**
   * Retourne le client Billit (pour le monitoring)
   */
  getBillitClient(): BillitClient {
    return this.billitClient;
  }

  /**
   * Traite une commande reçue
   * @param callerChatId - Chat ID de l'utilisateur qui exécute la commande (pour vérification de permissions)
   */
  async handleCommand(command: string, args: string[], callerChatId?: string): Promise<string> {
    console.log(`📨 Commande reçue: /${command} ${args.join(' ')}`);

    switch (command) {
      case 'start':
      case 'help':
        return this.handleHelp();

      case 'lastinvoice':
        return this.handleLastInvoice(args);

      case 'unpaid':
        return this.handleUnpaid();

      case 'paid':
        return this.handlePaid();

      case 'overdue':
        return this.handleOverdue();

      case 'due':
        return this.handleDueInvoices();

      case 'stats':
        return this.handleStats();

      case 'search':
        return this.handleSearch(args);

      case 'supplier':
        return this.handleSupplier(args);

      case 'list_suppliers':
      case 'fournisseurs':
      case 'suppliers':
        return this.handleListSuppliers();

      case 'add_supplier':
      case 'addsupplier':
      case 'ajouter_fournisseur':
        return this.handleAddSupplier(args);

      case 'delete_supplier':
      case 'deletesupplier':
      case 'supprimer_fournisseur':
        return this.handleDeleteSupplier(args);

      case 'list_employees':
      case 'employes':
      case 'employees':
        return this.handleListEmployees();

      case 'invoice':
      case 'details':
        return this.handleInvoiceDetails(args);

      // Nouvelles commandes pour les transactions bancaires
      case 'transactions_mois':
      case 'transactions':
        return this.handleTransactionsMois();

      case 'recettes_mois':
      case 'recettes':
        return this.handleRecettesMois();

      case 'depenses_mois':
      case 'depenses':
        return this.handleDepensesMois();

      case 'balance_mois':
      case 'balance':
        return this.handleBalanceMois();

      case 'transactions_fournisseur':
        return this.handleTransactionsFournisseur(args);

      case 'transactions_periode':
        return this.handleTransactionsPeriode(args);

      case 'tools':
        return this.handleTools();

      case 'adduser':
        if (callerChatId && !hasPermission(callerChatId, 'adduser')) {
          return getPermissionDeniedMessage('adduser');
        }
        return this.handleAddUser(args);

      case 'removeuser':
        if (callerChatId && !hasPermission(callerChatId, 'removeuser')) {
          return getPermissionDeniedMessage('removeuser');
        }
        return this.handleRemoveUser(args);

      case 'listusers':
        return this.handleListUsers();

      case 'markpaid':
      case 'payinvoice':
        if (callerChatId && !hasPermission(callerChatId, command)) {
          return getPermissionDeniedMessage(command);
        }
        return this.handleMarkPaid(args);

      // Commandes pour les soldes bancaires
      case 'init_balances':
      case 'init_soldes':
        return this.handleInitBalances(args);

      case 'balances':
      case 'soldes':
        return this.handleBalances();

      case 'set_balance':
      case 'modifier_solde':
        return this.handleSetBalance(args);

      case 'update_balances':
      case 'maj_soldes':
        return this.handleUpdateBalances();

      default:
        return `❌ Commande inconnue: /${command}\n\nTapez /help pour voir les commandes disponibles.`;
    }
  }

  /**
   * Affiche l'aide
   */
  private handleHelp(): string {
    return `
🤖 <b>Billit Bot - Guide d'utilisation</b>

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

<b>💬 MODE CONVERSATIONNEL</b>

Vous pouvez me poser des questions en langage naturel ! Essayez :

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

<b>🎯 COMMANDES RAPIDES</b>

<b>📋 Factures</b>
/unpaid - Factures impayées
/overdue - Factures en retard
/search [terme] - Rechercher
/lastinvoice [n] - Dernières factures

<b>👥 Gestion</b>
/list_suppliers - Liste fournisseurs
/list_employees - Liste employés
/listusers - Utilisateurs autorisés

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

<b>💡 CONSEILS</b>
• Utilisez "et" pour plusieurs fournisseurs
• Précisez l'année si nécessaire
• Vous pouvez envoyer des messages vocaux !

<b>📖 Guide complet</b>
Voir GUIDE_UTILISATEUR.md pour tous les exemples
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

<b>🤖 Outils IA</b>
/tools - Liste tous les outils IA disponibles

<b>ℹ️ Aide</b>
/help - Afficher cette aide

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    `.trim();
  }

  /**
   * Récupère la dernière facture d'un fournisseur
   */
  private async handleLastInvoice(args: string[]): Promise<string> {
    if (args.length === 0) {
      return '❌ Veuillez spécifier un nom de fournisseur.\n\nExemple: <code>/lastinvoice Foster</code>';
    }

    const supplierName = args.join(' ');

    try {
      const invoice = await this.billitClient.getLastInvoiceBySupplier(supplierName);

      if (!invoice) {
        return `❌ Aucune facture trouvée pour le fournisseur "${supplierName}"`;
      }

      return this.formatInvoice(invoice);
    } catch (error: any) {
      console.error('Erreur handleLastInvoice:', error);
      return `❌ Erreur lors de la recherche: ${sanitizeError(error)}`;
    }
  }

  /**
   * Liste les factures impayées
   */
  private async handleUnpaid(): Promise<string> {
    try {
      const invoices = await this.billitClient.getUnpaidInvoices();

      if (invoices.length === 0) {
        return '✅ Aucune facture impayée !';
      }

      let total = 0;
      const lines = invoices.map((inv, idx) => {
        total += inv.total_amount;
        const amount = this.formatAmount(inv.total_amount, inv.currency);

        return `${idx + 1}. <b>${inv.supplier_name}</b> - ${amount} - ⏳ <b>Impayé</b>`;
      });

      const totalFormatted = this.formatAmount(total, invoices[0]?.currency || 'EUR');

      return `
━━━━━━━━━━━━━━━━━━━━━━
📋 <b>FACTURES IMPAYÉES</b>
━━━━━━━━━━━━━━━━━━━━━━

${lines.join('\n')}

━━━━━━━━━━━━━━━━━━━━━━
💰 <b>TOTAL: ${totalFormatted}</b>
   (${invoices.length} facture${invoices.length > 1 ? 's' : ''})
      `.trim();
    } catch (error: any) {
      console.error('Erreur handleUnpaid:', error);
      return `❌ Erreur lors de la récupération: ${sanitizeError(error)}`;
    }
  }

  /**
   * Liste les factures payées
   */
  private async handlePaid(): Promise<string> {
    try {
      const allInvoices = await this.billitClient.getInvoices({ limit: 100 });
      const invoices = allInvoices.filter(inv => 
        inv.status.toLowerCase().includes('paid') || inv.status.toLowerCase().includes('payé')
      );

      if (invoices.length === 0) {
        return '❌ Aucune facture payée trouvée.';
      }

      let total = 0;
      const lines = invoices.slice(0, 20).map((inv, idx) => {
        total += inv.total_amount;
        const amount = this.formatAmount(inv.total_amount, inv.currency);

        return `${idx + 1}. <b>${inv.supplier_name}</b> - ${amount} - ✅ <b>Payé</b>`;
      });

      const totalFormatted = this.formatAmount(total, invoices[0]?.currency || 'EUR');
      const moreText = invoices.length > 20 ? `\n\n<i>... et ${invoices.length - 20} autre(s)</i>` : '';

      return `
━━━━━━━━━━━━━━━━━━━━━━
✅ <b>FACTURES PAYÉES</b>
━━━━━━━━━━━━━━━━━━━━━━

${lines.join('\n')}

━━━━━━━━━━━━━━━━━━━━━━
💰 <b>TOTAL (affiché): ${totalFormatted}</b>
   (${invoices.length} facture${invoices.length > 1 ? 's' : ''})${moreText}
      `.trim();
    } catch (error: any) {
      console.error('Erreur handlePaid:', error);
      return `❌ Erreur lors de la récupération: ${sanitizeError(error)}`;
    }
  }

  /**
   * Liste les factures en retard
   */
  private async handleOverdue(): Promise<string> {
    try {
      const invoices = await this.billitClient.getOverdueInvoices();

      if (invoices.length === 0) {
        return '✅ Aucune facture en retard !';
      }

      let total = 0;
      const lines = invoices.map((inv, idx) => {
        total += inv.total_amount;
        const amount = this.formatAmount(inv.total_amount, inv.currency);
        const daysOverdue = Math.floor(
          (new Date().getTime() - new Date(inv.due_date).getTime()) / (1000 * 60 * 60 * 24)
        );

        return `${idx + 1}. <b>${inv.supplier_name}</b> - ${amount} - 🚨 <b>Retard ${daysOverdue}j</b>`;
      });

      const totalFormatted = this.formatAmount(total, invoices[0]?.currency || 'EUR');

      return `
━━━━━━━━━━━━━━━━━━━━━━
⚠️ <b>FACTURES EN RETARD</b>
━━━━━━━━━━━━━━━━━━━━━━

${lines.join('\n')}

━━━━━━━━━━━━━━━━━━━━━━
💰 <b>TOTAL: ${totalFormatted}</b>
   (${invoices.length} facture${invoices.length > 1 ? 's' : ''})
      `.trim();
    } catch (error: any) {
      console.error('Erreur handleOverdue:', error);
      return `❌ Erreur lors de la récupération: ${sanitizeError(error)}`;
    }
  }

  /**
   * Liste les factures à échéance (impayées avec échéance dans les 15 prochains jours)
   */
  private async handleDueInvoices(): Promise<string> {
    try {
      // Récupérer toutes les factures impayées via la méthode dédiée
      const unpaidInvoices = await this.billitClient.getUnpaidInvoices();

      // Filtrer les factures avec échéance dans les 15 prochains jours
      const now = new Date();
      const fifteenDaysLater = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000);

      const dueInvoices = unpaidInvoices.filter(inv => {
        if (!inv.due_date) return false;
        const dueDate = new Date(inv.due_date);
        // Échéance entre maintenant et dans 15 jours
        return dueDate >= now && dueDate <= fifteenDaysLater;
      });

      // Trier par date d'échéance (plus proche en premier)
      dueInvoices.sort((a, b) => {
        const dateA = new Date(a.due_date).getTime();
        const dateB = new Date(b.due_date).getTime();
        return dateA - dateB;
      });

      if (dueInvoices.length === 0) {
        return '✅ Aucune facture à échéance dans les 15 prochains jours !';
      }

      let total = 0;
      const lines = dueInvoices.map((inv, idx) => {
        total += inv.total_amount;
        const amount = this.formatAmount(inv.total_amount, inv.currency);
        const daysUntilDue = Math.ceil(
          (new Date(inv.due_date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
        );

        const dueText = daysUntilDue === 0 ? 'Aujourd\'hui' :
                        daysUntilDue === 1 ? 'Demain' :
                        `Dans ${daysUntilDue}j`;

        const icon = daysUntilDue <= 3 ? '🔴' : daysUntilDue <= 7 ? '🟠' : '🟡';

        return `${idx + 1}. <b>${inv.supplier_name}</b> - ${amount} - ${icon} <b>${dueText}</b>`;
      });

      const totalFormatted = this.formatAmount(total, dueInvoices[0]?.currency || 'EUR');

      return `
━━━━━━━━━━━━━━━━━━━━━━
📅 <b>FACTURES À ÉCHÉANCE</b>
━━━━━━━━━━━━━━━━━━━━━━
<i>Prochains 15 jours</i>

${lines.join('\n')}

━━━━━━━━━━━━━━━━━━━━━━
💰 <b>TOTAL: ${totalFormatted}</b>
   (${dueInvoices.length} facture${dueInvoices.length > 1 ? 's' : ''})
      `.trim();
    } catch (error: any) {
      console.error('Erreur handleDueInvoices:', error);
      return `❌ Erreur lors de la récupération: ${sanitizeError(error)}`;
    }
  }

  /**
   * Affiche les statistiques du mois
   */
  private async handleStats(): Promise<string> {
    try {
      const now = new Date();
      const monthName = now.toLocaleDateString('fr-BE', { month: 'long', year: 'numeric' });

      // Stats du mois en cours
      const stats = await this.billitClient.getMonthlyStats();

      // Stats bancaires du mois (recettes/dépenses)
      const bankStats = await this.bankBalanceService.getBankClient().getMonthlyStats();

      // Factures en retard
      const overdueInvoices = await this.billitClient.getOverdueInvoices();

      // Toutes les factures récentes pour analyse par fournisseur
      const allInvoices = await this.billitClient.getInvoices({ limit: 120 });

      // Calculer montant moyen par facture
      const avgAmount = stats.count > 0 ? stats.total / stats.count : 0;

      // Analyse par fournisseur (top 5 du mois)
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthInvoices = allInvoices.filter(inv => {
        const invDate = new Date(inv.invoice_date);
        return invDate >= monthStart;
      });

      const supplierTotals = new Map<string, number>();
      monthInvoices.forEach((inv: any) => {
        const supplier = inv.supplier_name || 'Inconnu';
        const current = supplierTotals.get(supplier) || 0;
        supplierTotals.set(supplier, current + inv.total_amount);
      });

      const topSuppliers = Array.from(supplierTotals.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

      // Calculer le bénéfice net
      const profit = bankStats.balance;
      const profitIcon = profit >= 0 ? '📈' : '📉';

      // Formater les montants
      const totalFormatted = this.formatAmount(stats.total, 'EUR');
      const paidFormatted = this.formatAmount(stats.paid, 'EUR');
      const unpaidFormatted = this.formatAmount(stats.unpaid, 'EUR');
      const avgFormatted = this.formatAmount(avgAmount, 'EUR');
      const revenuesFormatted = this.formatAmount(bankStats.credits, 'EUR');
      const expensesFormatted = this.formatAmount(bankStats.debits, 'EUR');
      const profitFormatted = this.formatAmount(profit, 'EUR');

      let result = `
━━━━━━━━━━━━━━━━━━━━━━
📊 <b>STATISTIQUES DU MOIS</b>
━━━━━━━━━━━━━━━━━━━━━━
📅 <b>${monthName}</b>

💰 <b>SANTÉ FINANCIÈRE</b>
   💵 Recettes: ${revenuesFormatted} (${bankStats.creditCount} tx)
   💸 Dépenses: ${expensesFormatted} (${bankStats.debitCount} tx)
   ${profitIcon} <b>Bénéfice: ${profitFormatted}</b>

━━━━━━━━━━━━━━━━━━━━━━

📋 <b>FACTURES FOURNISSEURS</b>
   Total: ${stats.count} factures (Moy: ${avgFormatted})

   ✅ Payées: ${stats.paidCount} factures
      💰 ${paidFormatted}

   ⏳ Impayées: ${stats.unpaidCount} factures
      💰 ${unpaidFormatted}

━━━━━━━━━━━━━━━━━━━━━━
💰 <b>TOTAL FACTURES: ${totalFormatted}</b>
━━━━━━━━━━━━━━━━━━━━━━
`;

      // Ajouter top fournisseurs si disponible
      if (topSuppliers.length > 0) {
        result += `\n🏪 <b>TOP 5 FOURNISSEURS DU MOIS</b>\n`;
        topSuppliers.forEach(([supplier, amount], i) => {
          const icon = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
          result += `${icon} ${supplier}: ${this.formatAmount(amount, 'EUR')}\n`;
        });
      }

      // Ajouter factures en retard si présentes
      if (overdueInvoices.length > 0) {
        const overdueTotal = overdueInvoices.reduce((sum, inv) => sum + inv.total_amount, 0);
        result += `\n⚠️ <b>FACTURES EN RETARD</b>\n`;
        result += `${overdueInvoices.length} factures (${this.formatAmount(overdueTotal, 'EUR')})\n`;
      }

      return result.trim();
    } catch (error: any) {
      console.error('Erreur handleStats:', error);
      return `❌ Erreur lors de la récupération: ${sanitizeError(error)}`;
    }
  }

  /**
   * Recherche des factures
   */
  private async handleSearch(args: string[]): Promise<string> {
    if (args.length === 0) {
      return '❌ Veuillez spécifier un terme de recherche.\n\nExemple: <code>/search Foster</code>';
    }

    const searchTerm = args.join(' ');

    try {
      const invoices = await this.billitClient.searchInvoices(searchTerm);

      if (invoices.length === 0) {
        return `❌ Aucune facture trouvée pour "${searchTerm}"`;
      }

      const lines = invoices.slice(0, 10).map((inv, idx) => {
        const amount = this.formatAmount(inv.total_amount, inv.currency);
        const statusText = inv.status.toLowerCase().includes('paid') || inv.status.toLowerCase().includes('payé') 
          ? '✅ <b>Payé</b>' 
          : '⏳ <b>Impayé</b>';

        return `${idx + 1}. <b>${inv.supplier_name}</b> - ${amount} - ${statusText}`;
      });

      const moreText = invoices.length > 10 ? `\n\n<i>... et ${invoices.length - 10} autre(s)</i>` : '';

      return `
━━━━━━━━━━━━━━━━━━━━━━
🔍 <b>RÉSULTATS</b>
━━━━━━━━━━━━━━━━━━━━━━
Recherche: "${searchTerm}"

${lines.join('\n')}${moreText}
      `.trim();
    } catch (error: any) {
      console.error('Erreur handleSearch:', error);
      return `❌ Erreur lors de la recherche: ${sanitizeError(error)}`;
    }
  }

  /**
   * Liste tous les fournisseurs disponibles depuis le dictionnaire
   */
  private async handleListSuppliers(): Promise<string> {
    try {
      // Récupérer tous les fournisseurs depuis le dictionnaire
      const allSuppliers = Object.entries(SUPPLIER_ALIASES);

      // Filtrer pour exclure les employés
      const suppliers = allSuppliers.filter(([key]) => !EMPLOYEE_KEYS.includes(key));

      if (suppliers.length === 0) {
        return '❌ Aucun fournisseur configuré dans le dictionnaire.';
      }

      // Trier par ordre alphabétique du premier alias
      const sortedSuppliers = suppliers.sort((a, b) => {
        const nameA = a[1].aliases[0].toLowerCase();
        const nameB = b[1].aliases[0].toLowerCase();
        return nameA.localeCompare(nameB);
      });

      const lines = sortedSuppliers.map(([key, supplier], idx) => {
        // Nom principal (premier alias avec capitalization)
        const mainName = getSupplierDisplayName(supplier.aliases[0]);

        // Afficher les autres aliases s'il y en a
        let aliasesText = '';
        if (supplier.aliases.length > 1) {
          const otherAliases = supplier.aliases.slice(1).join(', ');
          aliasesText = `\n   🏷️  Alias: ${otherAliases}`;
        }

        return `${idx + 1}. <b>${mainName}</b>${aliasesText}`;
      });

      return `
━━━━━━━━━━━━━━━━━━━━━━
📋 <b>LISTE DES FOURNISSEURS</b>
━━━━━━━━━━━━━━━━━━━━━━

${lines.join('\n\n')}

━━━━━━━━━━━━━━━━━━━━━━
📊 <b>Total:</b> ${sortedSuppliers.length} fournisseur${sortedSuppliers.length > 1 ? 's' : ''}
━━━━━━━━━━━━━━━━━━━━━━

💡 <i>Utilisez /supplier [nom] pour voir les factures d'un fournisseur</i>
      `.trim();
    } catch (error: any) {
      console.error('Erreur handleListSuppliers:', error);
      return `❌ Erreur lors de la récupération: ${sanitizeError(error)}`;
    }
  }

  /**
   * Liste tous les employés
   */
  private async handleListEmployees(): Promise<string> {
    try {
      // Utiliser la base de données au lieu du dictionnaire
      const employees = getAllEmployees();

      if (employees.length === 0) {
        return '❌ Aucun employé trouvé dans la base de données.';
      }

      // Formatage optimisé pour Telegram
      const lines = employees.map((emp, idx) => {
        const num = String(idx + 1).padStart(2);
        const name = emp.name;
        const position = emp.position || 'Employé';
        const chatId = emp.chat_id || 'N/A';

        return `\`${num}. ${name}\`\n   └─ ${position} ${chatId !== 'N/A' ? `│ ID: ${chatId}` : ''}`;
      }).join('\n\n');

      return `💼 Liste des employés (${employees.length})\n\n${lines}`;
    } catch (error: any) {
      console.error('Erreur handleListEmployees:', error);
      return `❌ Erreur lors de la récupération: ${sanitizeError(error)}`;
    }
  }

  /**
   * Liste les factures d'un fournisseur
   */
  private async handleSupplier(args: string[]): Promise<string> {
    if (args.length === 0) {
      return '❌ Veuillez spécifier un nom de fournisseur.\n\nExemple: <code>/supplier Foster</code>';
    }

    const supplierName = args.join(' ');
    const displayName = getSupplierDisplayName(supplierName);

    try {
      const invoices = await this.billitClient.searchBySupplier(supplierName, 10);

      if (invoices.length === 0) {
        return `❌ Aucune facture trouvée pour "${displayName}"`;
      }

      let total = 0;
      const lines = invoices.slice(0, 10).map((inv, idx) => {
        total += inv.total_amount;
        const amount = this.formatAmount(inv.total_amount, inv.currency);
        const statusText = inv.status.toLowerCase().includes('paid') || inv.status.toLowerCase().includes('payé') 
          ? '✅ <b>Payé</b>' 
          : '⏳ <b>Impayé</b>';

        return `${idx + 1}. ${inv.invoice_number} - ${amount} - ${statusText}`;
      });

      const totalFormatted = this.formatAmount(total, invoices[0].currency);
      const moreText = invoices.length > 10 ? `\n\n<i>... et ${invoices.length - 10} autre(s)</i>` : '';

      return `
━━━━━━━━━━━━━━━━━━━━━━
📋 <b>${invoices[0].supplier_name}</b>
━━━━━━━━━━━━━━━━━━━━━━

${lines.join('\n')}

━━━━━━━━━━━━━━━━━━━━━━
💰 <b>Total (affiché): ${totalFormatted}</b>${moreText}
      `.trim();
    } catch (error: any) {
      console.error('Erreur handleSupplier:', error);
      return `❌ Erreur lors de la recherche: ${sanitizeError(error)}`;
    }
  }

  /**
   * Formate une facture pour affichage
   */
  private formatInvoice(invoice: BillitInvoice): string {
    const amount = this.formatAmount(invoice.total_amount, invoice.currency);
    const invoiceDate = new Date(invoice.invoice_date).toLocaleDateString('fr-BE');
    const dueDate = new Date(invoice.due_date).toLocaleDateString('fr-BE');
    const status = this.getStatusEmoji(invoice.status);

    // Construire la communication si elle existe
    const communicationLine = invoice.communication 
      ? `\n💬 <b>Communication</b>\n   ${invoice.communication}` 
      : '';

    return `
━━━━━━━━━━━━━━━━━━━━━━
🧾 <b>${invoice.supplier_name}</b>
━━━━━━━━━━━━━━━━━━━━━━

📄 <b>Facture:</b> ${invoice.invoice_number}
💰 <b>Montant TVAC:</b> ${amount}

📅 <b>Date:</b> ${invoiceDate}
⏰ <b>Échéance:</b> ${dueDate}
${communicationLine}

${status} <b>Statut:</b> ${invoice.status}

🔗 <a href="https://my.billit.eu/invoices/${invoice.id}">Ouvrir dans Billit</a>
    `.trim();
  }

  /**
   * Formate un montant avec devise
   */
  private formatAmount(amount: number, currency: string): string {
    return new Intl.NumberFormat('fr-BE', {
      style: 'currency',
      currency: currency || 'EUR',
    }).format(amount);
  }

  /**
   * Retourne un emoji selon le statut
   */
  private getStatusEmoji(status: string): string {
    const statusLower = status.toLowerCase();
    if (statusLower.includes('paid') || statusLower.includes('payé')) return '✅';
    if (statusLower.includes('pending') || statusLower.includes('attente')) return '⏳';
    if (statusLower.includes('overdue') || statusLower.includes('retard')) return '⚠️';
    return '📄';
  }

  /**
   * Affiche les détails complets d'une facture
   */
  private async handleInvoiceDetails(args: string[]): Promise<string> {
    if (args.length === 0) {
      return '❌ Veuillez spécifier un numéro de facture.\n\nExemple: <code>/invoice SI-2500003745</code> ou <code>/invoice 2500003745</code>';
    }

    const searchTerm = args.join(' ');

    try {
      console.log(`🔍 Recherche de la facture: "${searchTerm}"`);

      // Chercher la facture avec la recherche intelligente
      const invoice = await this.billitClient.findInvoiceByNumber(searchTerm);
      
      if (!invoice) {
        // Essayer une recherche plus large
        const allResults = await this.billitClient.searchInvoices(searchTerm, 5);
        
        if (allResults.length === 0) {
          return `❌ Aucune facture trouvée pour "${searchTerm}"\n\n💡 <b>Astuces:</b>\n• Essayez juste les chiffres: <code>${searchTerm.replace(/\D/g, '')}</code>\n• Ou le nom du fournisseur: <code>/search [nom]</code>`;
        }

        // Proposer les résultats trouvés
        const suggestions = allResults.map((inv, idx) => 
          `${idx + 1}. ${inv.invoice_number} - ${inv.supplier_name}`
        ).join('\n');

        return `❓ Plusieurs factures trouvées pour "${searchTerm}":\n\n${suggestions}\n\nUtilisez le numéro exact: <code>/invoice [numéro]</code>`;
      }

      console.log(`✅ Facture trouvée: ${invoice.invoice_number} (ID: ${invoice.id})`);

      // Récupérer les détails complets
      const details = await this.billitClient.getInvoiceDetails(invoice.id);

      return this.formatInvoiceDetails(details, invoice);
    } catch (error: any) {
      console.error('Erreur handleInvoiceDetails:', error);
      return `❌ Erreur lors de la récupération: ${sanitizeError(error)}`;
    }
  }

  /**
   * Formate les détails complets d'une facture avec lignes
   */
  private formatInvoiceDetails(details: import('./types/billit-api').BillitOrderDetails, invoice: BillitInvoice): string {
    const invoiceDate = new Date(invoice.invoice_date).toLocaleDateString('fr-BE');
    const dueDate = new Date(invoice.due_date).toLocaleDateString('fr-BE');
    const status = this.getStatusEmoji(invoice.status);

    // Debug: afficher la structure d'une ligne
    if (details.OrderLines && details.OrderLines.length > 0) {
      console.log('📋 Structure d\'une ligne de facture:', JSON.stringify(details.OrderLines[0], null, 2));
    }

    // Formater les lignes de facture
    let linesText = '';
    if (details.OrderLines && details.OrderLines.length > 0) {
      linesText = '\n━━━━━━━━━━━━━━━━━━━━━━\n📦 <b>LIGNES DE FACTURE</b>\n━━━━━━━━━━━━━━━━━━━━━━\n\n';
      
      details.OrderLines.forEach((line: any, idx: number) => {
        const description = line.Description || line.ItemDescription || 'Article';
        const quantity = parseFloat(line.Quantity || line.Amount || 1);
        
        // Essayer différents champs pour le prix unitaire
        const unitPrice = parseFloat(
          line.UnitPrice || 
          line.Price || 
          line.UnitPriceExcl || 
          line.PriceExcl || 
          0
        );
        
        // Essayer différents champs pour le total
        const total = parseFloat(
          line.TotalExcl || 
          line.Total || 
          line.AmountExcl || 
          (quantity * unitPrice) || 
          0
        );
        
        // TVA
        const vatRate = parseFloat(
          line.VATRate || 
          line.VAT || 
          line.VATPercentage || 
          0
        );

        // Ne pas afficher les lignes à 0 si c'est juste un problème de parsing
        if (total === 0 && unitPrice === 0) {
          return; // Ignorer cette ligne
        }

        const unitPriceFormatted = this.formatAmount(unitPrice, invoice.currency);
        const totalFormatted = this.formatAmount(total, invoice.currency);

        linesText += `${idx + 1}. <b>${description}</b>\n`;
        
        if (quantity > 1) {
          linesText += `   💰 ${unitPriceFormatted} × ${quantity} = ${totalFormatted}\n`;
        } else {
          linesText += `   💰 ${totalFormatted}\n`;
        }
        
        if (vatRate > 0) {
          linesText += `   🔖 TVA ${vatRate}%\n`;
        }
        
        linesText += '\n';
      });
      
      // Si aucune ligne n'a été affichée, ne pas montrer la section
      if (linesText === '\n━━━━━━━━━━━━━━━━━━━━━━\n📦 <b>LIGNES DE FACTURE</b>\n━━━━━━━━━━━━━━━━━━━━━━\n\n') {
        linesText = '\n<i>📦 Lignes de facture non disponibles dans l\'API</i>\n';
      }
    }

    // Calculer les totaux
    const totalExclVat = details.TotalExcl || details.TotalExclVAT || 0;
    const totalVat = details.TotalVAT || (invoice.total_amount - totalExclVat);
    const totalInclVat = invoice.total_amount;

    const totalExclFormatted = this.formatAmount(totalExclVat, invoice.currency);
    const totalVatFormatted = this.formatAmount(totalVat, invoice.currency);
    const totalInclFormatted = this.formatAmount(totalInclVat, invoice.currency);

    const communicationLine = invoice.communication 
      ? `\n💬 <b>Communication:</b> ${invoice.communication}` 
      : '';

    return `
━━━━━━━━━━━━━━━━━━━━━━
🧾 <b>${invoice.supplier_name}</b>
━━━━━━━━━━━━━━━━━━━━━━

📄 <b>Facture:</b> ${invoice.invoice_number}
📅 <b>Date:</b> ${invoiceDate}
⏰ <b>Échéance:</b> ${dueDate}
${status} <b>Statut:</b> ${invoice.status}${linesText}
━━━━━━━━━━━━━━━━━━━━━━
💰 <b>TOTAUX</b>
━━━━━━━━━━━━━━━━━━━━━━

<b>Sous-total HTVA:</b> ${totalExclFormatted}
<b>TVA:</b> ${totalVatFormatted}
━━━━━━━━━━━━━━━━━━━━━━
<b>TOTAL TVAC:</b> ${totalInclFormatted}${communicationLine}

📥 <a href="https://my.billit.eu/invoices/${invoice.id}">Télécharger le PDF</a>
    `.trim();
  }

  /**
   * Affiche toutes les transactions du mois
   */
  private async handleTransactionsMois(): Promise<string> {
    try {
      const transactions = await this.bankClient.getMonthlyTransactions();

      if (transactions.length === 0) {
        return '❌ Aucune transaction trouvée ce mois-ci.';
      }

      const now = new Date();
      const monthName = now.toLocaleDateString('fr-BE', { month: 'long', year: 'numeric' });

      // Grouper par type
      const credits = transactions.filter(tx => tx.type === 'Credit');
      const debits = transactions.filter(tx => tx.type === 'Debit');

      const totalCredits = credits.reduce((sum, tx) => sum + tx.amount, 0);
      const totalDebits = debits.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

      const lines: string[] = [];

      // Afficher les 10 dernières transactions
      transactions
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 10)
        .forEach((tx, idx) => {
          const emoji = tx.type === 'Credit' ? '💵' : '💸';
          const amount = this.formatAmount(Math.abs(tx.amount), tx.currency);
          const date = new Date(tx.date).toLocaleDateString('fr-BE');
          const description = (tx.description || 'Sans description').substring(0, 40);

          lines.push(`${idx + 1}. ${emoji} ${amount} - ${date}\n   ${description}`);
        });

      const moreText = transactions.length > 10 ? `\n\n<i>... et ${transactions.length - 10} autre(s)</i>` : '';

      return `
━━━━━━━━━━━━━━━━━━━━━━
💰 <b>TRANSACTIONS - ${monthName}</b>
━━━━━━━━━━━━━━━━━━━━━━

${lines.join('\n\n')}${moreText}

━━━━━━━━━━━━━━━━━━━━━━
📊 <b>RÉSUMÉ</b>
━━━━━━━━━━━━━━━━━━━━━━

💵 <b>Rentrées:</b> ${credits.length} transaction(s)
   ${this.formatAmount(totalCredits, 'EUR')}

💸 <b>Sorties:</b> ${debits.length} transaction(s)
   ${this.formatAmount(totalDebits, 'EUR')}

━━━━━━━━━━━━━━━━━━━━━━
💰 <b>BALANCE:</b> ${this.formatAmount(totalCredits - totalDebits, 'EUR')}
━━━━━━━━━━━━━━━━━━━━━━
      `.trim();
    } catch (error: any) {
      console.error('Erreur handleTransactionsMois:', error);
      return `❌ Erreur lors de la récupération: ${sanitizeError(error)}`;
    }
  }

  /**
   * Affiche les recettes du mois
   */
  private async handleRecettesMois(): Promise<string> {
    try {
      const credits = await this.bankClient.getCredits();

      // Filtrer pour le mois en cours
      const now = new Date();
      const monthCredits = credits.filter(tx => {
        const txDate = new Date(tx.date);
        return txDate.getMonth() === now.getMonth() && txDate.getFullYear() === now.getFullYear();
      });

      if (monthCredits.length === 0) {
        return '❌ Aucune recette ce mois-ci.';
      }

      const monthName = now.toLocaleDateString('fr-BE', { month: 'long', year: 'numeric' });
      const total = monthCredits.reduce((sum, tx) => sum + tx.amount, 0);

      const lines = monthCredits
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 15)
        .map((tx, idx) => {
          const amount = this.formatAmount(tx.amount, tx.currency);
          const date = new Date(tx.date).toLocaleDateString('fr-BE');
          const description = (tx.description || 'Sans description').substring(0, 45);

          return `${idx + 1}. ${amount} - ${date}\n   ${description}`;
        });

      const moreText = monthCredits.length > 15 ? `\n\n<i>... et ${monthCredits.length - 15} autre(s)</i>` : '';

      return `
━━━━━━━━━━━━━━━━━━━━━━
💵 <b>RECETTES - ${monthName}</b>
━━━━━━━━━━━━━━━━━━━━━━

${lines.join('\n\n')}${moreText}

━━━━━━━━━━━━━━━━━━━━━━
💰 <b>TOTAL RECETTES: ${this.formatAmount(total, 'EUR')}</b>
   (${monthCredits.length} rentrée${monthCredits.length > 1 ? 's' : ''})
━━━━━━━━━━━━━━━━━━━━━━
      `.trim();
    } catch (error: any) {
      console.error('Erreur handleRecettesMois:', error);
      return `❌ Erreur lors de la récupération: ${sanitizeError(error)}`;
    }
  }

  /**
   * Affiche les dépenses du mois
   */
  private async handleDepensesMois(): Promise<string> {
    try {
      const debits = await this.bankClient.getDebits();

      // Filtrer pour le mois en cours
      const now = new Date();
      const monthDebits = debits.filter(tx => {
        const txDate = new Date(tx.date);
        return txDate.getMonth() === now.getMonth() && txDate.getFullYear() === now.getFullYear();
      });

      if (monthDebits.length === 0) {
        return '✅ Aucune dépense ce mois-ci.';
      }

      const monthName = now.toLocaleDateString('fr-BE', { month: 'long', year: 'numeric' });
      const total = monthDebits.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

      const lines = monthDebits
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 15)
        .map((tx, idx) => {
          const amount = this.formatAmount(Math.abs(tx.amount), tx.currency);
          const date = new Date(tx.date).toLocaleDateString('fr-BE');
          const description = (tx.description || 'Sans description').substring(0, 45);

          return `${idx + 1}. ${amount} - ${date}\n   ${description}`;
        });

      const moreText = monthDebits.length > 15 ? `\n\n<i>... et ${monthDebits.length - 15} autre(s)</i>` : '';

      return `
━━━━━━━━━━━━━━━━━━━━━━
💸 <b>DÉPENSES - ${monthName}</b>
━━━━━━━━━━━━━━━━━━━━━━

${lines.join('\n\n')}${moreText}

━━━━━━━━━━━━━━━━━━━━━━
💰 <b>TOTAL DÉPENSES: ${this.formatAmount(total, 'EUR')}</b>
   (${monthDebits.length} sortie${monthDebits.length > 1 ? 's' : ''})
━━━━━━━━━━━━━━━━━━━━━━
      `.trim();
    } catch (error: any) {
      console.error('Erreur handleDepensesMois:', error);
      return `❌ Erreur lors de la récupération: ${sanitizeError(error)}`;
    }
  }

  /**
   * Affiche la balance du mois
   */
  private async handleBalanceMois(): Promise<string> {
    try {
      const stats = await this.bankClient.getMonthlyStats();

      const now = new Date();
      const monthName = now.toLocaleDateString('fr-BE', { month: 'long', year: 'numeric' });

      const creditsFormatted = this.formatAmount(stats.credits, 'EUR');
      const debitsFormatted = this.formatAmount(stats.debits, 'EUR');
      const balanceFormatted = this.formatAmount(stats.balance, 'EUR');
      const balanceEmoji = stats.balance >= 0 ? '✅' : '⚠️';

      return `
━━━━━━━━━━━━━━━━━━━━━━
💰 <b>BALANCE - ${monthName}</b>
━━━━━━━━━━━━━━━━━━━━━━

💵 <b>Rentrées:</b> ${stats.creditCount} transaction(s)
   ${creditsFormatted}

💸 <b>Sorties:</b> ${stats.debitCount} transaction(s)
   ${debitsFormatted}

━━━━━━━━━━━━━━━━━━━━━━
${balanceEmoji} <b>BALANCE NETTE: ${balanceFormatted}</b>
━━━━━━━━━━━━━━━━━━━━━━
      `.trim();
    } catch (error: any) {
      console.error('Erreur handleBalanceMois:', error);
      return `❌ Erreur lors de la récupération: ${sanitizeError(error)}`;
    }
  }

  /**
   * Recherche les transactions d'un fournisseur
   */
  private async handleTransactionsFournisseur(args: string[]): Promise<string> {
    if (args.length === 0) {
      return '❌ Veuillez spécifier un nom de fournisseur.\n\nExemple: <code>/transactions_fournisseur Foster</code>';
    }

    const supplierName = args.join(' ');
    const displayName = getSupplierDisplayName(supplierName);

    try {
      // 1. Rechercher dans les factures
      const invoices = await this.billitClient.searchBySupplier(supplierName, 50);

      // 2. Rechercher dans les transactions bancaires du mois en cours
      const now = new Date();
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
      
      const bankTransactions = await this.bankClient.searchByDescription(supplierName, firstDay, lastDay);

      if (invoices.length === 0 && bankTransactions.length === 0) {
        return `❌ Aucune transaction trouvée pour "${displayName}" ce mois-ci`;
      }

      let response = `━━━━━━━━━━━━━━━━━━━━━━\n🔍 <b>TRANSACTIONS - ${displayName.toUpperCase()}</b>\n━━━━━━━━━━━━━━━━━━━━━━\n\n`;

      // Afficher les factures
      if (invoices.length > 0) {
        const totalInvoices = invoices.reduce((sum, inv) => sum + inv.total_amount, 0);
        response += `<b>📋 FACTURES (${invoices.length})</b>\n\n`;

        invoices.slice(0, 10).forEach((inv, idx) => {
          const amount = this.formatAmount(inv.total_amount, inv.currency);
          const date = new Date(inv.invoice_date).toLocaleDateString('fr-BE');
          const status = inv.status.toLowerCase().includes('paid') ? '✅' : '⏳';

          response += `${idx + 1}. ${status} ${amount} - ${date}\n   ${inv.invoice_number}\n\n`;
        });

        if (invoices.length > 10) {
          response += `<i>... et ${invoices.length - 10} autre(s)</i>\n\n`;
        }

        response += `💰 Total factures: ${this.formatAmount(totalInvoices, 'EUR')}\n\n`;
      }

      // Afficher les transactions bancaires
      if (bankTransactions.length > 0) {
        // Calculer les stats
        let credits = 0;
        let debits = 0;
        let creditCount = 0;
        let debitCount = 0;

        bankTransactions.forEach(tx => {
          if (tx.type === 'Credit') {
            credits += tx.amount;
            creditCount++;
          } else {
            debits += Math.abs(tx.amount);
            debitCount++;
          }
        });

        response += `<b>🏦 TRANSACTIONS BANCAIRES (${bankTransactions.length})</b>\n\n`;

        bankTransactions.slice(0, 10).forEach((tx, idx) => {
          const emoji = tx.type === 'Credit' ? '💵' : '💸';
          const amount = this.formatAmount(Math.abs(tx.amount), tx.currency);
          const date = new Date(tx.date).toLocaleDateString('fr-BE');
          const description = (tx.description || '').substring(0, 40);

          response += `${idx + 1}. ${emoji} ${amount} - ${date}\n   ${description}\n\n`;
        });

        if (bankTransactions.length > 10) {
          response += `<i>... et ${bankTransactions.length - 10} autre(s)</i>\n\n`;
        }

        // Résumé simplifié
        if (debits > 0 && credits === 0) {
          response += `💸 <b>Total payé à ${displayName}:</b> ${this.formatAmount(debits, 'EUR')}\n\n`;
        } else if (credits > 0 && debits === 0) {
          response += `💵 <b>Total reçu de ${displayName}:</b> ${this.formatAmount(credits, 'EUR')}\n\n`;
        } else {
          response += `💵 <b>Rentrées:</b> ${this.formatAmount(credits, 'EUR')}\n`;
          response += `💸 <b>Sorties:</b> ${this.formatAmount(debits, 'EUR')}\n`;
          response += `💰 <b>Balance:</b> ${this.formatAmount(credits - debits, 'EUR')}\n\n`;
        }
      }

      response += `━━━━━━━━━━━━━━━━━━━━━━`;

      return response.trim();
    } catch (error: any) {
      console.error('Erreur handleTransactionsFournisseur:', error);
      return `❌ Erreur lors de la recherche: ${sanitizeError(error)}`;
    }
  }

  /**
   * Affiche les transactions pour une période donnée
   * args[2] = type ("recettes", "credits", "depenses", "debits") ou nom de fournisseur
   * args[3] = nom de fournisseur optionnel (si args[2] est un type)
   */
  private async handleTransactionsPeriode(args: string[]): Promise<string> {
    if (args.length < 2) {
      return '❌ Veuillez spécifier deux dates.\n\nExemple: <code>/transactions_periode 2025-01-01 2025-12-01</code>';
    }

    const startDateStr = args[0];
    const endDateStr = args[1];
    
    // Déterminer si args[2] est un type ou un fournisseur
    const arg2 = args[2]?.toLowerCase();
    const arg3 = args[3];

    let filterType: string | undefined;
    let supplierFilter: string | undefined;

    // Si args[2] est un type connu, alors args[3] pourrait être le fournisseur
    if (arg2 === 'recettes' || arg2 === 'credits' || arg2 === 'depenses' || arg2 === 'debits' || arg2 === 'salaires') {
      filterType = arg2;
      supplierFilter = arg3;
    }
    // Sinon, args[2] est considéré comme un nom de fournisseur
    else if (arg2) {
      supplierFilter = args[2]; // Garder la casse originale pour le fournisseur
    }

    const startDate = BankClient.parseDate(startDateStr);
    const endDate = BankClient.parseDate(endDateStr);

    if (!startDate || !endDate) {
      return `❌ Format de date invalide.\n\n<b>Formats acceptés:</b>\n• YYYY-MM-DD (ex: 2025-01-01)\n• DD/MM/YYYY (ex: 01/01/2025)\n• DD-MM-YYYY (ex: 01-01-2025)`;
    }

    try {
      let transactions = await this.bankClient.getTransactionsByPeriod(startDate, endDate);

      // Filtrer par fournisseur si spécifié (avec système d'aliases)
      let displaySupplierName = supplierFilter;
      if (supplierFilter) {
        const filterName = supplierFilter; // Copie pour éviter undefined dans le filter
        transactions = transactions.filter(tx => 
          matchesSupplier(tx.description, filterName)
        );
        
        // Obtenir le nom d'affichage propre du fournisseur
        displaySupplierName = getSupplierDisplayName(supplierFilter);
      }

      // Filtrer par type si spécifié
      let titlePrefix = '💰 TRANSACTIONS';
      if (filterType === 'recettes' || filterType === 'credits') {
        transactions = transactions.filter(tx => tx.type === 'Credit');
        titlePrefix = '💵 RECETTES';
      } else if (filterType === 'depenses' || filterType === 'debits') {
        transactions = transactions.filter(tx => tx.type === 'Debit');
        titlePrefix = '💸 DÉPENSES';
      } else if (filterType === 'salaires') {
        // Filtrer uniquement les transactions vers les employés
        transactions = transactions.filter(tx =>
          tx.type === 'Debit' && this.isSalaryTransaction(tx.description || '')
        );
        titlePrefix = '👥 SALAIRES';
      }
      
      // Ajouter le nom du fournisseur au titre si filtré
      if (displaySupplierName) {
        titlePrefix += ` - ${displaySupplierName.toUpperCase()}`;
      }

      if (transactions.length === 0) {
        const filterMsg = displaySupplierName ? ` pour ${displaySupplierName}` : '';
        return `❌ Aucune transaction${filterMsg} entre ${startDate.toLocaleDateString('fr-BE')} et ${endDate.toLocaleDateString('fr-BE')}`;
      }

      // Calculer les stats sur les transactions FILTRÉES (pas toutes les transactions de la période)
      let credits = 0;
      let debits = 0;
      let creditCount = 0;
      let debitCount = 0;

      transactions.forEach(tx => {
        if (tx.type === 'Credit') {
          credits += tx.amount;
          creditCount++;
        } else {
          debits += Math.abs(tx.amount);
          debitCount++;
        }
      });

      const stats = {
        credits,
        debits,
        creditCount,
        debitCount,
        balance: credits - debits,
      };

      const lines = transactions
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 15)
        .map((tx, idx) => {
          const emoji = tx.type === 'Credit' ? '💵' : '💸';
          const amount = this.formatAmount(Math.abs(tx.amount), tx.currency);
          const date = new Date(tx.date).toLocaleDateString('fr-BE');
          const description = (tx.description || 'Sans description').substring(0, 40);

          return `${idx + 1}. ${emoji} ${amount} - ${date}\n   ${description}`;
        });

      const moreText = transactions.length > 15 ? `\n\n<i>... et ${transactions.length - 15} autre(s)</i>` : '';

      // Si un fournisseur est spécifié, afficher un résumé simplifié
      let summarySection = '';
      if (displaySupplierName) {
        // Résumé simplifié pour un fournisseur spécifique
        const totalAmount = stats.debits > 0 ? stats.debits : stats.credits;
        const action = stats.debits > 0 ? 'payé à' : 'reçu de';
        const emoji = stats.debits > 0 ? '💸' : '💵';
        
        summarySection = `
━━━━━━━━━━━━━━━━━━━━━━
${emoji} <b>Total ${action} ${displaySupplierName}:</b> ${this.formatAmount(totalAmount, 'EUR')}
━━━━━━━━━━━━━━━━━━━━━━`;
      } else {
        // Résumé détaillé pour toutes les transactions
        summarySection = `
━━━━━━━━━━━━━━━━━━━━━━
📊 <b>RÉSUMÉ</b>
━━━━━━━━━━━━━━━━━━━━━━

💵 <b>Rentrées:</b> ${stats.creditCount} transaction(s)
   ${this.formatAmount(stats.credits, 'EUR')}

💸 <b>Sorties:</b> ${stats.debitCount} transaction(s)
   ${this.formatAmount(stats.debits, 'EUR')}

━━━━━━━━━━━━━━━━━━━━━━
💰 <b>BALANCE:</b> ${this.formatAmount(stats.balance, 'EUR')}
━━━━━━━━━━━━━━━━━━━━━━`;
      }

      return `
━━━━━━━━━━━━━━━━━━━━━━
${titlePrefix} - PÉRIODE
━━━━━━━━━━━━━━━━━━━━━━
📅 Du ${startDate.toLocaleDateString('fr-BE')} au ${endDate.toLocaleDateString('fr-BE')}

${lines.join('\n\n')}${moreText}
${summarySection}
      `.trim();
    } catch (error: any) {
      console.error('Erreur handleTransactionsPeriode:', error);
      return `❌ Erreur lors de la récupération: ${sanitizeError(error)}`;
    }
  }

  // Note: normalizeSearchTerm est maintenant importé depuis utils/string-utils
  // pour éviter la duplication de code

  /**
   * Ajoute un nouveau fournisseur
   * Syntaxe: /addsupplier [clé] [nom principal] [alias1] [alias2] ...
   * Exemple: /addsupplier pluxee "Pluxee Belgium" pluxi pluxee belgium
   */
  private async handleAddSupplier(args: string[]): Promise<string> {
    try {
      if (args.length < 2) {
        return `
❌ <b>Syntaxe incorrecte</b>

Utilisation: <code>/addsupplier [clé] [nom principal] [alias1] [alias2] ...</code>

<b>Exemples:</b>
<code>/addsupplier pluxee "Pluxee Belgium" pluxi pluxee</code>
<code>/addsupplier moniz "EPS MONIZZE" moniz eps</code>

<b>Paramètres:</b>
• <b>clé</b>: Identifiant unique (ex: pluxee, moniz)
• <b>nom principal</b>: Nom d'affichage principal (entre guillemets si avec espaces)
• <b>alias1, alias2...</b>: Variantes de nom pour la recherche (optionnel)
        `.trim();
      }

      const key = args[0].toLowerCase();
      const primaryName = args[1];
      const aliases = args.slice(2); // Tous les autres arguments sont des alias

      // Générer automatiquement les patterns depuis le nom et les alias
      const patterns = [primaryName, ...aliases].map(a => normalizeSupplierTerm(a));

      // Ajouter le fournisseur
      const result = addSupplier(key, primaryName, aliases, patterns);

      return result.message;
    } catch (error: any) {
      console.error('Erreur handleAddSupplier:', error);
      return `❌ Erreur lors de l'ajout: ${sanitizeError(error)}`;
    }
  }

  /**
   * Supprime un fournisseur
   * Syntaxe: /deletesupplier [clé]
   * Exemple: /deletesupplier pluxee
   */
  private async handleDeleteSupplier(args: string[]): Promise<string> {
    try {
      if (args.length === 0) {
        return `
❌ <b>Syntaxe incorrecte</b>

Utilisation: <code>/deletesupplier [clé]</code>

<b>Exemples:</b>
<code>/deletesupplier pluxee</code>
<code>/deletesupplier moniz</code>

💡 <i>Pour voir la liste des fournisseurs et leurs clés: /list_suppliers</i>
        `.trim();
      }

      const key = args[0];
      const result = deleteSupplier(key);

      return result.message;
    } catch (error: any) {
      console.error('Erreur handleDeleteSupplier:', error);
      return `❌ Erreur lors de la suppression: ${sanitizeError(error)}`;
    }
  }

  /**
   * Ajoute un utilisateur autorisé
   */
  private async handleAddUser(args: string[]): Promise<string> {
    if (args.length === 0) {
      return '❌ Veuillez spécifier un Chat ID.\n\nExemple: <code>/adduser 123456789</code>\n\n💡 Pour trouver votre Chat ID, parlez au bot @userinfobot sur Telegram.';
    }

    const chatIdToAdd = args[0].trim();

    // Vérifier que c'est un nombre valide
    if (!/^\d+$/.test(chatIdToAdd)) {
      return `❌ Chat ID invalide: "${chatIdToAdd}"\n\nUn Chat ID doit contenir uniquement des chiffres.`;
    }

    // Vérifier s'il est déjà dans la base de données
    const existingUser = getUserByChatId(chatIdToAdd);
    if (existingUser) {
      return `ℹ️  Le Chat ID <b>${chatIdToAdd}</b> est déjà autorisé.`;
    }

    // Ajouter à la base de données
    const success = addAuthorizedUser(chatIdToAdd, null, 'user', 'admin_command');

    if (!success) {
      return `❌ Erreur lors de l'ajout de l'utilisateur.`;
    }

    // Récupérer le nouveau total
    const allUsers = getAllAuthorizedUsers();

    let message = `✅ Utilisateur ajouté avec succès !\n\n`;
    message += `📱 Chat ID: <b>${chatIdToAdd}</b>\n`;
    message += `👥 Total utilisateurs: ${allUsers.length}\n\n`;
    message += `✨ L'utilisateur est immédiatement actif (pas de redémarrage nécessaire).`;

    return message;
  }

  /**
   * Supprime un utilisateur autorisé
   */
  private async handleRemoveUser(args: string[]): Promise<string> {
    if (args.length === 0) {
      return '❌ Veuillez spécifier un Chat ID.\n\nExemple: <code>/removeuser 123456789</code>';
    }

    const chatIdToRemove = args[0].trim();

    // Vérifier si l'ID existe dans la base de données
    const existingUser = getUserByChatId(chatIdToRemove);
    if (!existingUser) {
      return `❌ Le Chat ID <b>${chatIdToRemove}</b> n'est pas dans la liste des utilisateurs autorisés.\n\nUtilisez /listusers pour voir la liste.`;
    }

    // Sécurité : empêcher de supprimer le dernier utilisateur
    const allUsers = getAllAuthorizedUsers();
    if (allUsers.length === 1) {
      return `❌ Impossible de supprimer le dernier utilisateur.\n\nIl doit toujours y avoir au moins un utilisateur autorisé.`;
    }

    // Supprimer de la base de données
    const success = removeAuthorizedUser(chatIdToRemove);

    if (!success) {
      return `❌ Erreur lors de la suppression de l'utilisateur.`;
    }

    // Récupérer le nouveau total
    const remainingUsers = getAllAuthorizedUsers();

    let message = `🗑️ Utilisateur supprimé avec succès !\n\n`;
    message += `📱 Chat ID: <b>${chatIdToRemove}</b>\n`;
    message += `👥 Total utilisateurs restants: ${remainingUsers.length}\n\n`;
    message += `✨ L'utilisateur est immédiatement désactivé (pas de redémarrage nécessaire).`;

    return message;
  }

  /**
   * Liste tous les utilisateurs autorisés
   */
  private handleListUsers(): string {
    const allUsers = getAllAuthorizedUsers();

    let message = `👥 Utilisateurs autorisés (${allUsers.length})\n\n`;

    allUsers.forEach((user, index) => {
      const username = user.username || 'Inconnu';
      message += `${index + 1}. Chat ID: <b>${user.chat_id}</b>`;
      message += ` (${username}) [${user.role}]\n`;
    });

    message += '\n💡 Pour ajouter un utilisateur: /adduser <chat_id>';
    message += '\n💡 Pour supprimer un utilisateur: /removeuser <chat_id>';

    return message;
  }

  /**
   * Affiche tous les outils IA disponibles
   */
  private handleTools(): string {
    const tools = [
      { name: 'Factures impayées', description: 'Obtenir les factures impayées' },
      { name: 'Factures payées', description: 'Obtenir les factures payées récentes' },
      { name: 'Factures en retard', description: 'Obtenir les factures en retard' },
      { name: 'Marquer facture payée', description: 'Marquer une facture comme payée' },
      { name: 'Statistiques factures', description: 'Statistiques des factures du mois' },
      { name: 'Balance du mois', description: 'Solde bancaire du mois en cours' },
      { name: 'Recettes du mois', description: 'Total des recettes/rentrées du mois' },
      { name: 'Dépenses du mois', description: 'Total des dépenses/sorties du mois' },
      { name: 'Transactions période', description: 'Transactions sur une période donnée' },
      { name: 'Salaires employés', description: 'Consulter les salaires des employés' },
      { name: 'Paiements fournisseur', description: 'Paiements versés à un fournisseur' },
      { name: 'Versements reçus', description: 'Versements reçus d\'un fournisseur/partenaire' },
      { name: 'Rechercher factures', description: 'Rechercher des factures par mot-clé' },
      { name: 'Facture par montant', description: 'Trouver une facture par fournisseur et montant' },
      { name: 'Liste fournisseurs', description: 'Lister tous les fournisseurs enregistrés' },
      { name: 'Factures mois actuel', description: 'Toutes les factures du mois en cours' },
      { name: 'Factures par mois', description: 'Factures d\'un mois spécifique' },
      { name: 'Envoyer PDF facture', description: 'Envoyer le PDF d\'une facture sur Telegram' },
      { name: 'Recherche communication', description: 'Rechercher une facture par numéro de communication' },
      { name: 'Ajouter fournisseur', description: 'Ajouter un nouveau fournisseur' },
      { name: 'Supprimer fournisseur', description: 'Supprimer un fournisseur' },
      { name: 'Ajouter utilisateur', description: 'Autoriser un nouvel utilisateur' },
      { name: 'Retirer utilisateur', description: 'Retirer l\'accès d\'un utilisateur' },
      { name: 'Liste utilisateurs', description: 'Voir tous les utilisateurs autorisés' },
      { name: 'Redémarrer le bot', description: 'Redémarrer le bot Telegram' },
    ];

    let message = '🤖 **Outils IA disponibles**\n\n';
    message += `Le bot dispose de **${tools.length} outils** pour vous aider:\n\n`;

    tools.forEach((tool, index) => {
      message += `${index + 1}. **${tool.name}**\n   ➜ ${tool.description}\n\n`;
    });

    message += '\n💡 **Astuce**: Utilisez l\'agent IA en mode conversation pour poser vos questions en langage naturel !\n';
    message += 'Exemple: "Quelles sont les factures impayées ?", "Montre-moi les paiements à Coca-Cola", etc.';

    return message;
  }

  /**
   * Marque une facture comme payée
   */
  private async handleMarkPaid(args: string[]): Promise<string> {
    if (args.length === 0) {
      return '❌ Veuillez spécifier un numéro de facture.\n\nExemple: <code>/markpaid 9901329189</code>\n\nVous pouvez aussi utiliser le numéro partiel de la facture.';
    }

    const invoiceNumber = args[0];

    try {
      await this.billitClient.markInvoiceAsPaidByNumber(invoiceNumber);
      return `✅ Facture **${invoiceNumber}** marquée comme payée avec succès !`;
    } catch (error: any) {
      console.error('Erreur handleMarkPaid:', error);
      return `❌ Erreur lors du marquage de la facture: ${sanitizeError(error)}`;
    }
  }

  /**
   * Vérifie si une transaction est un paiement de salaire (vers un employé)
   */
  private isSalaryTransaction(description: string): boolean {
    // Vérifier si la transaction correspond à un employé connu
    return EMPLOYEE_KEYS.some(employeeKey =>
      matchesSupplier(description, employeeKey)
    );
  }

  /**
   * Initialise les soldes bancaires
   * Utilise les soldes fournis par l'utilisateur comme point de départ
   */
  private async handleInitBalances(args: string[]): Promise<string> {
    try {
      // Lire les comptes depuis les variables d'environnement
      const bankAccountsEnv = process.env.BANK_ACCOUNTS;

      if (!bankAccountsEnv) {
        return `❌ Configuration manquante !

Les comptes bancaires ne sont pas configurés dans le fichier .env

Ajoutez la variable BANK_ACCOUNTS dans votre .env :
BANK_ACCOUNTS=IBAN|Nom|Solde;IBAN|Nom|Solde

Exemple :
BANK_ACCOUNTS=BE07671870399966|Europabank|80075.06;BE12001745766792|BNP Paribas Fortis|17565.13`;
      }

      // Parser les comptes depuis la variable d'environnement
      const accounts = bankAccountsEnv.split(';').map(account => {
        const [iban, name, balance] = account.split('|');
        return {
          iban: iban.trim(),
          name: name.trim(),
          balance: parseFloat(balance)
        };
      });

      await this.bankBalanceService.initializeBalances(accounts);

      // Construire le message de confirmation dynamiquement
      let message = '✅ **Soldes bancaires initialisés !**\n\n';

      for (const account of accounts) {
        const formattedIban = account.iban.match(/.{1,4}/g)?.join(' ') || account.iban;
        message += `🏦 **${account.name}**\n`;
        message += `   ${formattedIban}\n`;
        message += `   €${account.balance.toLocaleString('fr-FR', { minimumFractionDigits: 2 })}\n\n`;
      }

      const total = accounts.reduce((sum, acc) => sum + acc.balance, 0);
      message += `**Total**: €${total.toLocaleString('fr-FR', { minimumFractionDigits: 2 })}\n\n`;
      message += '💡 Les soldes seront maintenant automatiquement mis à jour avec les nouvelles transactions.\n\n';
      message += 'Utilisez /balances pour consulter les soldes à tout moment.';

      return message;
    } catch (error: any) {
      console.error('Erreur lors de l\'initialisation des soldes:', error);
      return `❌ Erreur lors de l'initialisation des soldes: ${sanitizeError(error)}`;
    }
  }

  /**
   * Affiche les soldes bancaires actuels
   */
  private handleBalances(): string {
    try {
      return this.bankBalanceService.formatBalances();
    } catch (error: any) {
      console.error('Erreur lors de la récupération des soldes:', error);
      return `❌ Erreur: ${sanitizeError(error)}`;
    }
  }

  /**
   * Modifie manuellement le solde d'un compte
   * Usage: /set_balance IBAN montant
   */
  private async handleSetBalance(args: string[]): Promise<string> {
    try {
      if (args.length < 2) {
        return `❌ Usage: /set_balance IBAN montant

Exemple: /set_balance BE07671870399966 80000.00`;
      }

      const iban = args[0].replace(/\s/g, '');
      const balance = parseFloat(args[1].replace(',', '.'));

      if (isNaN(balance)) {
        return `❌ Montant invalide: ${args[1]}`;
      }

      await this.bankBalanceService.setBalance(iban, balance);

      return `✅ Solde mis à jour !

Nouveau solde: €${balance.toLocaleString('fr-FR', { minimumFractionDigits: 2 })}

Utilisez /balances pour voir tous les soldes.`;
    } catch (error: any) {
      console.error('Erreur lors de la modification du solde:', error);
      return `❌ Erreur: ${sanitizeError(error)}`;
    }
  }

  /**
   * Met à jour les soldes avec les nouvelles transactions
   */
  private async handleUpdateBalances(): Promise<string> {
    try {
      const result = await this.bankBalanceService.updateBalances();

      if (result.transactionsProcessed === 0) {
        return `✓ Les soldes sont déjà à jour.

Utilisez /balances pour les consulter.`;
      }

      let message = `✅ **Soldes mis à jour !**\n\n`;
      message += `📊 ${result.transactionsProcessed} transaction(s) traitée(s)\n`;
      message += `🏦 ${result.accountsUpdated.length} compte(s) mis à jour\n\n`;

      for (const update of result.updates) {
        const account = this.bankBalanceService.getBalance(update.iban);
        if (account) {
          const diff = update.newBalance - update.previousBalance;
          const diffSign = diff >= 0 ? '+' : '';
          message += `**${account.name}**\n`;
          message += `  ${diffSign}€${diff.toLocaleString('fr-FR', { minimumFractionDigits: 2 })}\n`;
          message += `  €${update.previousBalance.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} → €${update.newBalance.toLocaleString('fr-FR', { minimumFractionDigits: 2 })}\n\n`;
        }
      }

      const totalBalance = this.bankBalanceService.getTotalBalance();
      message += `**Total**: €${totalBalance.toLocaleString('fr-FR', { minimumFractionDigits: 2 })}`;

      return message;
    } catch (error: any) {
      console.error('Erreur lors de la mise à jour des soldes:', error);
      return `❌ Erreur: ${sanitizeError(error)}`;
    }
  }

  /**
   * Retourne le service de soldes bancaires (pour l'IA)
   */
  getBankBalanceService(): BankBalanceService {
    return this.bankBalanceService;
  }
}
