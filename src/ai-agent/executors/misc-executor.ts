/**
 * Executor pour les outils divers
 * Couvre: transactions par période, guide utilisateur, catégories de dépenses
 */

import type { ExecutorContext, ExecutorHelpers } from './types';
import type { ToolResult } from '../../types/ai-agent';
import { BankClient, type BankTransaction } from '../../bank-client';
import { matchesSupplier } from '../../supplier-aliases';
import { ExpenseCategorizer, type ExpenseCategoryType } from '../../expense-categorizer';
import { executeEmployeeFunction } from './employee-executor';

const HANDLED = new Set([
  'get_period_transactions',
  'get_user_guide',
  'analyze_expenses_by_category',
]);

export async function executeMiscFunction(
  functionName: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  args: Record<string, any>,
  ctx: ExecutorContext,
  helpers: ExecutorHelpers
): Promise<string | null> {
  if (!HANDLED.has(functionName)) return null;

  let result: ToolResult;

  switch (functionName) {
        case 'get_period_transactions': {
          // 🔧 CORRECTION AUTO: "salaire" détecté → rediriger vers get_employee_salaries
          const qLower = ctx.currentQuestion.toLowerCase();
          if (qLower.includes('salaire') || qLower.includes('salaires')) {
            console.log(`🔧 REDIRECTION AUTO: get_period_transactions → get_employee_salaries (mot 'salaire' détecté)`);
            // Convertir les dates en month si possible
            if (args.start_date && args.end_date) {
              const start = BankClient.parseDate(args.start_date);
              const end = BankClient.parseDate(args.end_date);
              if (start && end && start.getMonth() === end.getMonth()) {
                const monthNames = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
                args.month = monthNames[start.getMonth()];
                console.log(`🔧 Conversion date→month: ${args.month}`);
              }
            }
            // Supprimer start_date et end_date pour ne pas interférer
            delete args.start_date;
            delete args.end_date;
            // Continuer avec get_employee_salaries
            const empResult = await executeEmployeeFunction('get_employee_salaries', args, ctx, helpers);
            return empResult ?? JSON.stringify({ error: 'Employee function not available' });
          }

          let startDate = BankClient.parseDate(args.start_date);
          let endDate = BankClient.parseDate(args.end_date);

          if (!startDate || !endDate) {
            return JSON.stringify({ error: 'Format de date invalide' });
          }

          // IMPORTANT: Régler l'endDate à la fin de la journée (23:59:59) pour inclure toute la journée
          // Sinon, l'endDate est à 00:00:00 ce qui exclut les transactions de ce jour
          endDate.setHours(23, 59, 59, 999);

          let transactions = await ctx.bankClient.getTransactionsByPeriod(startDate, endDate);

          // Filtrer par type
          if (args.filter_type === 'recettes') {
            transactions = transactions.filter(tx => tx.type === 'Credit');
          } else if (args.filter_type === 'depenses') {
            transactions = transactions.filter(tx => tx.type === 'Debit');
          }

          // Filtrer par fournisseur/employé si spécifié
          if (args.supplier_name) {
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
          const questionLower = ctx.currentQuestion.toLowerCase();
          const wantsDetailedList = questionLower.includes('liste') ||
                                    questionLower.includes('transaction') ||  // singulier OU pluriel
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
            const allInvoices = await ctx.billitClient.getInvoices({ limit: 120 });
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
            analysis.categories.sort((a: { total: number }, b: { total: number }) => b.total - a.total);

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

    default:
      return null;
  }

  return JSON.stringify(result, null, 2);
}
