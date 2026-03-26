/**
 * Executor pour les outils de gestion des factures
 * Couvre: factures impayées/payées, récentes, en retard, échéances,
 * marquage payé, stats, recherche, PDF, communication
 */

import type { ExecutorContext, ExecutorHelpers } from './types';
import { hasPermission, getPermissionDeniedMessage } from '../../database';
import { matchesSupplier } from '../../supplier-aliases';
import { BillitInvoice } from '../../types';

const HANDLED = new Set([
  'get_unpaid_invoices',
  'get_paid_invoices',
  'get_latest_invoice',
  'get_recent_invoices',
  'get_overdue_invoices',
  'get_upcoming_due_invoices',
  'mark_invoice_as_paid',
  'get_invoice_stats',
  'search_invoices',
  'get_invoice_by_supplier_and_amount',
  'get_all_invoices',
  'get_supplier_invoices',
  'get_monthly_invoices',
  'get_invoices_by_month',
  'send_invoice_pdf',
  'search_by_communication',
]);

export async function executeInvoiceFunction(
  functionName: string,
  args: Record<string, any>,
  ctx: ExecutorContext,
  helpers: ExecutorHelpers
): Promise<string | null> {
  if (!HANDLED.has(functionName)) return null;

  let result: Record<string, unknown>;

  switch (functionName) {
    case 'get_unpaid_invoices': {
      const invoices = await ctx.billitClient.getUnpaidInvoices();
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
      let allInvoices: BillitInvoice[] = [];
      let skip = 0;
      const pageSize = 120;

      while (true) {
        const batch = await ctx.billitClient.getInvoices({
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
        let allInvoices: BillitInvoice[] = [];
        let skip = 0;
        const pageSize = 120;

        while (true) {
          const batch = await ctx.billitClient.getInvoices({
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

        // 🔧 FIX: Filtrer par fournisseur si spécifié
        let filteredInvoices = allInvoices;
        if (args.supplier_name) {
          filteredInvoices = allInvoices.filter(inv =>
            matchesSupplier(inv.supplier_name, args.supplier_name)
          );
          console.log(`🔍 Filtrage par fournisseur "${args.supplier_name}": ${filteredInvoices.length} facture(s) trouvée(s)`);
        }

        console.log(`📊 get_latest_invoice: ${filteredInvoices.length} factures à considérer`);

        // Filtrer les factures avec une date valide et trier par date (la plus récente en premier)
        const sortedInvoices = filteredInvoices
          .filter(inv => inv.invoice_date && !isNaN(new Date(inv.invoice_date).getTime()))
          .sort((a, b) => {
            const dateA = new Date(a.invoice_date).getTime();
            const dateB = new Date(b.invoice_date).getTime();
            return dateB - dateA; // Ordre décroissant (plus récent en premier)
          });

        if (sortedInvoices.length === 0) {
          result = {
            success: false,
            message: args.supplier_name
              ? `Aucune facture trouvée pour le fournisseur "${args.supplier_name}"`
              : 'Aucune facture avec une date valide trouvée',
          };
          break;
        }

        const latestInvoice = sortedInvoices[0];
        console.log(`📄 Dernière facture: ${latestInvoice.supplier_name} - ${latestInvoice.invoice_date} - ${latestInvoice.total_amount}€`);

        // 🔧 FIX: Utiliser direct_response pour forcer le format avec communication
        const invDate = new Date(latestInvoice.invoice_date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
        const dueDateLine = latestInvoice.due_date ? `⏰ Date d'échéance : ${new Date(latestInvoice.due_date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}` : '';
        const commLine = latestInvoice.communication ? `💬 Communication : ${latestInvoice.communication}` : '';

        const statusText = latestInvoice.status.toLowerCase().includes('paid') || latestInvoice.status.toLowerCase().includes('payé')
          ? 'Payée'
          : latestInvoice.status.toLowerCase().includes('domiciliation')
          ? 'Domiciliation'
          : 'À payer';

        const directResponse = `📄 Dernière facture reçue de ${latestInvoice.supplier_name} :

🏪 Fournisseur : ${latestInvoice.supplier_name}
💰 Montant : ${latestInvoice.total_amount.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
📋 N° de facture : ${latestInvoice.invoice_number}
📅 Date : ${invDate}
${dueDateLine}
${commLine}
📊 Statut : ${statusText}`;

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
          direct_response: directResponse,
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
        let allInvoices: BillitInvoice[] = [];
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
            const page = await ctx.billitClient.getInvoices({ limit: pageSize, skip });
            if (page.length === 0) break;
            allInvoices.push(...page);
            skip += pageSize;
            hasMore = page.length === pageSize;
            pageCount++;

            // Si filtrage fournisseur : continuer jusqu'à avoir assez de résultats
            if (supplierName) {
              const currentFiltered = allInvoices.filter(inv => matchesSupplier(inv.supplier_name, supplierName));
              if (currentFiltered.length >= limit) {
                console.log(`✅ Assez de factures pour "${supplierName}" après ${pageCount} pages`);
                break;
              }
            }
          }
          console.log(`📊 ${allInvoices.length} factures récupérées via pagination (${pageCount} pages)`);
        } else {
          // Cas simple : limit < 50
          allInvoices = await ctx.billitClient.getInvoices({ limit: pageSize });
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
      const invoices = await ctx.billitClient.getOverdueInvoices();
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
      const unpaidInvoices = await ctx.billitClient.getUnpaidInvoices();

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
      // Vérification de permissions
      if (ctx.chatId && !hasPermission(ctx.chatId, 'mark_invoice_as_paid')) {
        result = { success: false, error: 'permission_denied', message: getPermissionDeniedMessage('mark_invoice_as_paid') };
        break;
      }
      const invoiceNumber = args.invoice_number as string;

      // D'abord trouver la facture
      const invoice = await ctx.billitClient.findInvoiceByNumber(invoiceNumber);
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
      await ctx.billitClient.markInvoiceAsPaidByNumber(invoiceNumber);

      // 🔍 VÉRIFICATION OBLIGATOIRE : Récupérer les détails réels depuis Billit
      const updatedDetails = await ctx.billitClient.getInvoiceDetails(invoice.id);

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
      const stats = await ctx.billitClient.getMonthlyStats();

      // 🔧 AJOUT: Récupérer aussi les stats bancaires pour le bénéfice
      const now = new Date();
      const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

      const transactions = await ctx.bankClient.getTransactionsByPeriod(startDate, endDate);
      const credits = transactions.filter(tx => tx.type === 'Credit');
      const debits = transactions.filter(tx => tx.type === 'Debit');
      const totalCredits = credits.reduce((sum, tx) => sum + tx.amount, 0);
      const totalDebits = debits.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
      const balance = totalCredits - totalDebits; // Bénéfice net

      result = {
        month: new Date().toLocaleDateString('fr-BE', { month: 'long', year: 'numeric' }),
        total_invoices: stats.count,
        paid_count: stats.paidCount,
        paid_amount: stats.paid,
        unpaid_count: stats.unpaidCount,
        unpaid_amount: stats.unpaid,
        total_amount: stats.total,
        currency: 'EUR',
        // 🔧 AJOUT: Stats bancaires pour le bénéfice
        bank_revenues: totalCredits,
        bank_expenses: totalDebits,
        bank_profit: balance,
        credit_count: credits.length,
        debit_count: debits.length,
      };
      break;
    }

    case 'search_invoices': {
      // 🎯 Gérer les filtres par montant
      const hasAmountFilter = args.min_amount !== undefined || args.max_amount !== undefined;

      if (hasAmountFilter) {
        // Récupérer toutes les factures et filtrer par montant
        const allInvoices = await ctx.billitClient.getInvoices({ limit: 120 });

        // Pagination pour récupérer toutes les factures si nécessaire
        let invoices = [...allInvoices];
        let page = 2;
        while (allInvoices.length === 120) {
          const nextPage = await ctx.billitClient.getInvoices({ limit: 120, page });
          if (nextPage.length === 0) break;
          invoices.push(...nextPage);
          page++;
          if (page > 10) break; // Sécurité
        }

        // Filtrer par montant ET par search_term (fournisseur) si fourni
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
        const invoices = await ctx.billitClient.searchInvoices(args.search_term || '');
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
      // Récupérer toutes les factures
      const allInvoices = await ctx.billitClient.getInvoices({ limit: 120 });

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

    case 'get_all_invoices': {
      // Récupérer TOUTES les factures (toutes périodes confondues)
      console.log('🔄 Récupération de TOUTES les factures (pagination complète)...');

      const allInvoices: any[] = [];
      let skip = 0;
      const pageSize = 120;
      let hasMore = true;

      while (hasMore) {
        const page = await ctx.billitClient.getInvoices({ limit: pageSize, skip });
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
      const matchedSupplier = await helpers.matchSupplierWithAI(args.supplier_name);
      console.log(`🤖 Fournisseur matché: "${args.supplier_name}" → "${matchedSupplier}"`);

      // Pagination complète
      console.log('🔄 Récupération de TOUTES les factures (pagination complète)...');
      let allInvoices: BillitInvoice[] = [];
      let skip = 0;
      const pageSize = 120;

      while (true) {
        const batch = await ctx.billitClient.getInvoices({
          limit: pageSize,
          skip: skip
        });
        allInvoices = allInvoices.concat(batch);
        if (batch.length < pageSize) break;
        skip += pageSize;
      }
      console.log(`✓ ${allInvoices.length} facture(s) récupérées`);

      // Filtrer par fournisseur (fuzzy matching avec matchesSupplier)
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
      let allInvoices: BillitInvoice[] = [];
      let skip = 0;
      const pageSize = 120;

      while (true) {
        const batch = await ctx.billitClient.getInvoices({
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

      let allInvoices: BillitInvoice[] = [];
      let skip = 0;
      const pageSize = 120;

      while (true) {
        const batch = await ctx.billitClient.getInvoices({
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
      if (!ctx.telegramBot || !ctx.chatId) {
        result = {
          success: false,
          error: 'Service Telegram non disponible',
        };
        break;
      }

      let invoiceId = args.invoice_id;

      // Si on a seulement le numéro de facture, chercher l'ID
      if (!invoiceId && args.invoice_number) {
        const allInvoices = await ctx.billitClient.getInvoices({ limit: 120 });
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
      const pdfBuffer = await ctx.billitClient.downloadInvoicePdf(invoiceId);

      if (!pdfBuffer) {
        result = {
          success: false,
          error: 'PDF non disponible',
        };
        break;
      }

      // Récupérer les détails pour le nom de fichier
      const invoiceDetails = await ctx.billitClient.getInvoiceDetails(invoiceId);
      const supplierName = invoiceDetails.Supplier?.Name || 'Facture';
      const invoiceNumber = invoiceDetails.OrderNumber || invoiceId;
      const filename = `Facture_${invoiceNumber}_${supplierName.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;

      // Préparer le message de légende
      const caption = `📄 Facture ${invoiceNumber} - ${supplierName}`;

      // Envoyer via Telegram
      await ctx.telegramBot.sendDocument(ctx.chatId, pdfBuffer, {
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
      const invoices = await ctx.billitClient.searchByCommunication(
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

    default:
      return null;
  }

  return JSON.stringify(result, null, 2);
}
