/**
 * Executor pour les outils fournisseurs
 * Couvre: analyse dépenses, comparaisons, paiements, gestion fournisseurs
 */

import type { ExecutorContext, ExecutorHelpers } from './types';
import type { ToolResult, SupplierData, DisplaySection } from '../../types/ai-agent';
import type { BankTransaction } from '../../bank-client';
import { matchesSupplier, SUPPLIER_ALIASES, addSupplier, deleteSupplier, extractPotentialSupplierNames } from '../../supplier-aliases';
import { normalizeSearchTerm } from '../../utils/string-utils';
import { getAllSuppliers } from '../../database';

const HANDLED = new Set([
  'analyze_supplier_expenses',
  'compare_supplier_expenses',
  'get_supplier_payments',
  'get_supplier_received_payments',
  'list_suppliers',
  'add_supplier',
  'delete_supplier',
  'detect_new_suppliers',
]);

export async function executeSupplierFunction(
  functionName: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  args: Record<string, any>,
  ctx: ExecutorContext,
  helpers: ExecutorHelpers
): Promise<string | null> {
  if (!HANDLED.has(functionName)) return null;

  let result: ToolResult;

  switch (functionName) {
        case 'analyze_supplier_expenses': {
          // 🔍 DÉTECTION AUTOMATIQUE DE PLUSIEURS FOURNISSEURS
          // Si supplier_name contient " et ", extraire tous les fournisseurs
          let suppliersToProcess: string[] = [];
          let isMultiSupplier = false;

          if (args.supplier_name && args.supplier_name.includes(' et ')) {
            // Extraire tous les fournisseurs séparés par " et ", ",", "&"
            const parts = args.supplier_name.split(/\s+(?:et|,|&)\s+/i);
            suppliersToProcess = parts.map((p: string) => p.trim()).filter((p: string) => p.length > 0);
            isMultiSupplier = suppliersToProcess.length > 1;
            console.log(`🔍 Détection: ${suppliersToProcess.length} fournisseurs à traiter:`, suppliersToProcess);
          } else if (args.supplier_name) {
            suppliersToProcess = [args.supplier_name];
          }

          // 🤖 Matching IA de tous les fournisseurs
          if (suppliersToProcess.length > 0) {
            const matchedNames = await Promise.all(
              suppliersToProcess.map(name => helpers.matchSupplierWithAI(name))
            );
            suppliersToProcess = matchedNames;
            console.log(`🤖 Matching IA: ${matchedNames.join(', ')}`);
          }

          // Gérer month/year ou start_month/end_month
          let startDate: Date;
          let endDate: Date;

          // 🆕 Gérer period_text (parsing IA) - PRIORITÉ sur month/start_month/end_month
          if (args.period_text) {
            const period = await helpers.parsePeriodWithAI(args.period_text);
            if (period) {
              startDate = period.start;
              endDate = period.end;
              console.log(`✅ Période IA utilisée pour analyse fournisseurs: ${period.description}`);
            } else {
              return JSON.stringify({ error: `Impossible de parser la période: ${args.period_text}` });
            }
          } else {
            // Logique existante pour month/start_month/end_month
            const monthMap: { [key: string]: number } = {
            'janvier': 0, 'fevrier': 1, 'février': 1, 'mars': 2, 'avril': 3,
            'mai': 4, 'juin': 5, 'juillet': 6, 'aout': 7, 'août': 7,
            'septembre': 8, 'octobre': 9, 'novembre': 10, 'decembre': 11, 'décembre': 11,
          };

          const parseMonth = (monthInput: string): number => {
            const lower = monthInput.toLowerCase();
            if (monthMap[lower] !== undefined) {
              return monthMap[lower];
            } else if (!isNaN(parseInt(lower))) {
              return parseInt(lower) - 1;
            }
            return -1;
          };

          if (args.month) {
            // Mois unique
            const targetMonth = parseMonth(args.month);
            if (targetMonth === -1) {
              return JSON.stringify({ error: `Mois invalide: ${args.month}` });
            }

            // Si aucune année spécifiée, déduire intelligemment l'année
            let targetYear: number;
            if (args.year) {
              targetYear = parseInt(args.year);
            } else {
              const now = new Date();
              const currentYear = now.getFullYear();
              const currentMonth = now.getMonth();

              // Si le mois demandé est dans le futur, utiliser l'année précédente
              // Exemple: janvier 2026, demande "décembre" → 2025
              if (targetMonth > currentMonth) {
                targetYear = currentYear - 1;
              } else {
                targetYear = currentYear;
              }
            }

            startDate = new Date(targetYear, targetMonth, 1);
            endDate = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59);
          } else if (args.start_month && args.end_month) {
            // Période multi-mois (ex: octobre à décembre)
            const startMonth = parseMonth(args.start_month);
            const endMonth = parseMonth(args.end_month);

            if (startMonth === -1 || endMonth === -1) {
              return JSON.stringify({ error: `Mois invalide: ${args.start_month} ou ${args.end_month}` });
            }

            // Si aucune année spécifiée, déduire intelligemment l'année
            let targetYear: number;
            if (args.year) {
              targetYear = parseInt(args.year);
            } else {
              const now = new Date();
              const currentYear = now.getFullYear();
              const currentMonth = now.getMonth();

              // Si le mois de FIN est dans le futur, utiliser l'année précédente
              // Exemple: janvier 2026, demande "octobre à décembre" → 2025
              if (endMonth > currentMonth) {
                targetYear = currentYear - 1;
              } else {
                targetYear = currentYear;
              }
            }

            startDate = new Date(targetYear, startMonth, 1);
            endDate = new Date(targetYear, endMonth + 1, 0, 23, 59, 59);
          } else {
            // Par défaut: année intelligente
            let targetYear: number;
            if (args.year) {
              targetYear = parseInt(args.year);
            } else {
              const now = new Date();
              const currentYear = now.getFullYear();
              const currentMonth = now.getMonth();

              // Si on est en janvier (mois 0), utiliser l'année précédente par défaut
              // Exemple: janvier 2026, demande "top 10 dépenses" → 2025
              if (currentMonth === 0) {
                targetYear = currentYear - 1;
              } else {
                targetYear = currentYear;
              }
            }
            startDate = new Date(targetYear, 0, 1);
            endDate = new Date(targetYear, 11, 31, 23, 59, 59);
          }
          }  // Fin du else pour logique existante (month/start_month/end_month)

          if (!startDate || !endDate) {
            return JSON.stringify({ error: 'Format de date invalide' });
          }

          // Récupérer les transactions
          let transactions = await ctx.bankClient.getTransactionsByPeriod(startDate, endDate);

          // Importer les fonctions de fournisseur
          let suppliers = Object.keys(SUPPLIER_ALIASES);

          // 🏷️ FILTRAGE PAR CATÉGORIE (si args.category est spécifié)
          if (args.category) {
            const categoryMap: { [key: string]: string[] } = {
              'alimentation': ['foster', 'coca-cola', 'cocacola', 'colruyt', 'sligro', 'makro', 'metro', 'transgourmet', 'alkhoomsy', 'turbatu'],
              'utilities': ['engie', 'vivaqua', 'fluxys', 'electrabel'],
              'telecom': ['proximus', 'orange', 'telenet', 'mobile', 'vodafone'],
              'transport': ['uber', 'takeaway', 'deliveroo', 'just eat', 'justeat'],
              'services': ['kbc', 'bnp', 'ing', 'beobank', 'babel'],
              'assurance': ['ag insurance', 'allianz', 'axa', 'bnpparf', 'p&v'],
              'loyers': ['loyer', 'location', 'immobilier']
            };

            const categorySuppliers = categoryMap[args.category.toLowerCase()];
            if (categorySuppliers) {
              const categoryLower = args.category.toLowerCase();
              suppliers = suppliers.filter((sup: string) => {
                const supLower = sup.toLowerCase();
                return categorySuppliers.some((keyword: string) => supLower.includes(keyword));
              });
              console.log(`🏷️ Filtrage par catégorie "${args.category}": ${suppliers.length} fournisseur(s) trouvé(s)`);
            }
          }

          // 🔄 NOUVEAU: Pour un fournisseur spécifique, chercher aussi dans les factures Billit si pas de dépenses bancaires
          const getSupplierExpensesFromInvoices = async (supplierName: string): Promise<any[]> => {
            try {
              console.log(`🔍 Recherche de factures Billit pour "${supplierName}"...`);
              const allInvoices = await ctx.billitClient.getInvoices({ limit: 120 });

              // Filtrer par fournisseur
              const supplierInvoices = allInvoices.filter(inv => {
                const invDate = new Date(inv.invoice_date);
                return invDate >= startDate && invDate <= endDate && matchesSupplier(inv.supplier_name, supplierName);
              });

              console.log(`📄 ${supplierInvoices.length} facture(s) trouvée(s) pour "${supplierName}"`);

              // Convertir les factures au format des transactions (pour compatibilité avec le code d'analyse)
              return supplierInvoices.map(inv => ({
                date: inv.invoice_date,
                amount: -inv.total_amount,  // Négatif car c'est une dépense
                type: 'Debit',
                description: `Facture ${inv.invoice_number} - ${inv.supplier_name}`,
                communication: inv.communication || '',
                invoice_number: inv.invoice_number,
                supplier_name: inv.supplier_name,
              }));
            } catch (error) {
              console.error(`❌ Erreur lors de la récupération des factures:`, error);
              return [];
            }
          };

          // 🔍 Vérifier d'abord s'il y a des factures Billit pour décider quoi afficher
          const hasInvoicesForSupplier = async (supplierName: string): Promise<boolean> => {
            try {
              const allInvoices = await ctx.billitClient.getInvoices({ limit: 120 });
              const supplierInvoices = allInvoices.filter(inv => {
                const invDate = new Date(inv.invoice_date);
                return invDate >= startDate && invDate <= endDate && matchesSupplier(inv.supplier_name, supplierName);
              });
              return supplierInvoices.length > 0;
            } catch {
              return false;
            }
          };

          // 🔍 Fonction pour analyser UN fournisseur spécifique
          const analyzeSingleSupplier = async (supplierName: string): Promise<any[]> => {
            // 🔧 FIX BUG #18-19: Ne PAS utiliser matchesSupplier pour trouver les fournisseurs dans SUPPLIER_ALIASES
            // car il est trop permissif (ex: "Colruyt" matche "Foster" via "food")
            // À la place, filtrer directement les transactions par le nom exact du fournisseur (après AI matching)
            
            console.log(`🔍 Analyse fournisseur "${supplierName}"...`);

            // Filtrer les transactions qui correspondent au fournisseur spécifique
            let supplierTransactions = transactions.filter(tx =>
              matchesSupplier(tx.description || '', supplierName)
            );

            console.log(`📊 ${supplierTransactions.length} transaction(s) trouvée(s) pour "${supplierName}"`);

            // 🔄 NOUVEAU: Si pas de débits bancaires, chercher dans les factures Billit
            const debits = supplierTransactions.filter((tx: BankTransaction) => tx.type === 'Debit');
            if (debits.length === 0) {
              console.log(`⚠️ Aucun débit bancaire pour "${supplierName}", recherche dans les factures Billit...`);
              const invoiceExpenses = await getSupplierExpensesFromInvoices(supplierName);
              if (invoiceExpenses.length > 0) {
                console.log(`✅ ${invoiceExpenses.length} facture(s) trouvée(s) dans Billit`);
                // Combiner avec les crédits existants (revenus)
                const credits = supplierTransactions.filter((tx: BankTransaction) => tx.type === 'Credit');
                return [...invoiceExpenses, ...credits];
              }
            }

            return supplierTransactions;
          };

          // Filtrer les transactions du fournisseur (TOUS types : crédit ET débit)
          let supplierTransactions: BankTransaction[];

          if (isMultiSupplier && suppliersToProcess.length > 0) {
            // Plusieurs fournisseurs : combiner tous les résultats
            let allTransactions: BankTransaction[] = [];
            for (const supplier of suppliersToProcess) {
              const txs = await analyzeSingleSupplier(supplier);
              allTransactions = allTransactions.concat(txs);
            }
            supplierTransactions = allTransactions;
          } else if (args.supplier_name) {
            // Filtrer pour un fournisseur spécifique
            supplierTransactions = await analyzeSingleSupplier(args.supplier_name);
          } else {
            // Obtenir TOUTES les transactions vers fournisseurs connus (débits uniquement pour le top global)
            supplierTransactions = transactions.filter(tx => {
              if (tx.type !== 'Debit') return false;
              // Vérifier si correspond à un fournisseur connu
              return suppliers.some((sup: string) => matchesSupplier(tx.description || '', sup));
            });
          }

          // ✨ DÉTECTION: Afficher Dépenses SEULEMENT, Revenus SEULEMENT, ou les DEUX ?
          const debits = supplierTransactions.filter(tx => tx.type === 'Debit');
          const credits = supplierTransactions.filter(tx => tx.type === 'Credit');
          const totalDebits = debits.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
          const totalCredits = credits.reduce((sum, tx) => sum + tx.amount, 0);

          // 📋 MOTS-CLÉS: Déterminer quoi afficher
          const questionLower = ctx.currentQuestion.toLowerCase();
          const userWantsRevenue = questionLower.includes('revenu') || questionLower.includes('recette') ||
                                   questionLower.includes('gain') || questionLower.includes('encaissé') ||
                                   questionLower.includes('chiffre d\'affaires') || questionLower.includes('ca ');
          const userWantsExpenses = questionLower.includes('dépense') || questionLower.includes('depense') ||
                                    questionLower.includes('paiement') || questionLower.includes('facture');
          const userAsksForAnalysis = questionLower.includes('analyse') || questionLower.includes('top');

          // 🔍 Vérifier si des factures existent dans Billit (pour les fournisseurs comme Uber)
          const hasBillitInvoices = args.supplier_name ? await hasInvoicesForSupplier(args.supplier_name) : false;
          console.log(`📊 hasBillitInvoices pour "${args.supplier_name || 'multi'}": ${hasBillitInvoices}`);

          // 🎯 LOGIQUE D'AFFICHAGE:
          // - "analyse Uber" → Afficher les DEUX (Dépenses + Revenus)
          // - "revenus Uber" → Afficher les Revenus SEULEMENT
          // - "dépenses Uber" → Afficher les Dépenses SEULEMENT (même si totalDebits = 0 mais factures existent)
          // - Par défaut → Afficher les Dépenses (sauf si pas de dépenses mais des revenus)
          const hasExpenseData = totalDebits > 0 || hasBillitInvoices;
          const showBothSections = userAsksForAnalysis && hasExpenseData && totalCredits > 0;
          const showRevenueOnly = userWantsRevenue && !userWantsExpenses && totalCredits > 0;
          const showExpensesOnly = userWantsExpenses || (!showBothSections && !showRevenueOnly);

          let sectionsToDisplay: DisplaySection[] = [];
          if (showBothSections || (!userWantsRevenue && !userWantsExpenses)) {
            // Afficher les Dépenses (par défaut ou analyse complète)
            sectionsToDisplay.push({ type: 'expenses', data: debits, total: totalDebits, icon: '💸', label: 'Dépenses' });
          }
          if (showBothSections || showRevenueOnly) {
            // Afficher les Revenus (si analyse complète ou demande explicite)
            sectionsToDisplay.push({ type: 'revenues', data: credits, total: totalCredits, icon: '💰', label: 'Revenus' });
          }

          // Pour la compatibilité avec le code existant, utiliser les dépenses par défaut
          const supplierExpenses = debits;
          const totalSpent = totalDebits;
          const isRevenuePartner = showRevenueOnly;

          // Trier par date décroissante
          supplierExpenses.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

          // 📊 ANALYSE PAR FOURNISSEUR
          const isMultiSupplierQuery = !args.supplier_name && supplierExpenses.length > 0;
          const isSpecificSupplierAnalysis = args.supplier_name;  // Changé pour vérifier aussi le cas 0 transaction

          let analysisText = '';
          const showSupplierAnalysis = !args.supplier_name && isMultiSupplierQuery;

          // Générer le titre de période
          let periodTitle: string;
          if (args.month) {
            periodTitle = startDate.toLocaleDateString('fr-BE', { month: 'long', year: 'numeric' });
          } else if (args.start_month && args.end_month) {
            const startMonthName = startDate.toLocaleDateString('fr-BE', { month: 'long' });
            const endMonthName = endDate.toLocaleDateString('fr-BE', { month: 'long' });
            const year = startDate.getFullYear();
            periodTitle = `${startMonthName} à ${endMonthName} ${year}`;
          } else if (args.year) {
            periodTitle = `année ${args.year}`;
          } else {
            periodTitle = `année ${startDate.getFullYear()}`;
          }

          if (isSpecificSupplierAnalysis) {
            // ✅ Vérifier s'il y a des données avant de faire l'analyse
            if (debits.length === 0 && credits.length === 0) {
              // Aucune donnée trouvée (ni transactions, ni factures)
              const supplierName = args.supplier_name || 'Ce fournisseur';
              result = {
                supplier_name: supplierName,
                period: `${startDate.toLocaleDateString('fr-BE')} - ${endDate.toLocaleDateString('fr-BE')}`,
                total_spent: 0,
                transaction_count: 0,
                type: 'dépenses',
                direct_response: `🔍 ${supplierName}

❌ Aucune donnée trouvée pour ce fournisseur (ni transactions bancaires, ni factures).

Vérifiez:
• Le nom du fournisseur est correct
• Des factures existent dans Billit pour ce fournisseur`
              };
              break;
            }

            // 🎯 Afficher une ou deux sections selon le cas
            const supplierName = args.supplier_name || 'Ce fournisseur';
            let directResponse = `📊 Analyse: ${supplierName}\n${periodTitle}\n\n`;

            for (const section of sectionsToDisplay) {
              const sectionData = section.data;
              const sectionTotal = section.total;
              const sectionIcon = section.icon;
              const sectionLabel = section.label;

              if (sectionData.length === 0) continue;

              // Calculer les statistiques
              const amounts = sectionData.map((tx: BankTransaction) => Math.abs(tx.amount));
              const totalAmount = sectionTotal ?? 0;
              const avgAmount = totalAmount / sectionData.length;
              const minAmount = Math.min(...amounts);
              const maxAmount = Math.max(...amounts);

              directResponse += `${sectionIcon} **${sectionLabel}**\n`;
              directResponse += `Total: ${totalAmount.toFixed(2)}€ • ${sectionData.length} transaction${sectionData.length > 1 ? 's' : ''}\n`;
              directResponse += `Moyenne: ${avgAmount.toFixed(2)}€\n`;
              directResponse += `Min: ${minAmount.toFixed(2)}€\n`;
              directResponse += `Max: ${maxAmount.toFixed(2)}€\n`;

              // Évolution mensuelle (compacte)
              const monthlyBreakdown: { [key: string]: { total: number; count: number; fullDate: Date } } = {};
              sectionData.forEach((tx: BankTransaction) => {
                const txDate = new Date(tx.date);
                const monthKey = txDate.toLocaleDateString('fr-BE', { month: 'short', year: 'numeric' });
                if (!monthlyBreakdown[monthKey]) {
                  monthlyBreakdown[monthKey] = { total: 0, count: 0, fullDate: txDate };
                }
                monthlyBreakdown[monthKey].total += Math.abs(tx.amount);
                monthlyBreakdown[monthKey].count++;
              });

              const sortedMonths = Object.entries(monthlyBreakdown)
                .map(([month, data]) => ({ month, ...data }))
                .sort((a: { fullDate: Date }, b: { fullDate: Date }) => b.fullDate.getTime() - a.fullDate.getTime());

              if (sortedMonths.length > 0) {
                directResponse += `📅 Évolution mensuelle:\n`;
                sortedMonths.forEach((m: { month: string; total: number }) => {
                  directResponse += `  ${m.month}: ${m.total.toFixed(0)}€\n`;
                });
              }

              // Dernières transactions (format compact)
              const maxToShow = Math.min(5, sectionData.length);
              const recentPayments = sectionData.slice(0, maxToShow);
              directResponse += `💳 Derniers:\n`;
              recentPayments.forEach((tx: BankTransaction, i: number) => {
                const date = new Date(tx.date).toLocaleDateString('fr-BE', { day: '2-digit', month: '2-digit' });
                const amount = Math.abs(tx.amount).toFixed(2);
                // Raccourcir la description
                let desc = tx.description || '-';
                if (desc.length > 50) {
                  desc = desc.substring(0, 47) + '...';
                }
                // Pour les revenus Uber, simplifier
                if (desc.includes('STICHTING CUSTODIAN UBER PAYMENTS')) {
                  desc = 'Uber Payments';
                }
                directResponse += `  ${date}: ${amount}€ - ${desc}\n`;
              });

              if (sectionData.length > 5) {
                directResponse += `  ... et ${sectionData.length - 5} autres\n`;
              }

              // Séparateur entre sections
              if (sectionsToDisplay.length > 1 && sectionsToDisplay.indexOf(section) < sectionsToDisplay.length - 1) {
                directResponse += `\n`;
              }
            }

            // Calculer le solde net (revenus - dépenses)
            if (showBothSections) {
              const netBalance = totalCredits - totalDebits;
              const marginPercent = totalDebits > 0 ? ((netBalance / totalDebits) * 100).toFixed(1) : '0.0';
              directResponse += `\n💰 **Solde net**: ${netBalance >= 0 ? '+' : ''}${netBalance.toFixed(2)}€`;
              directResponse += ` (Marge: ${marginPercent}%)\n`;
            }

            result = {
              supplier_name: supplierName,
              period: `${startDate.toLocaleDateString('fr-BE')} - ${endDate.toLocaleDateString('fr-BE')}`,
              total_spent: totalDebits,
              transaction_count: debits.length,
              total_revenue: totalCredits,
              revenue_count: credits.length,
              net_balance: totalCredits - totalDebits,
              direct_response: directResponse.trimStart()
            };
            break;
          } else if (showSupplierAnalysis) {
            // Grouper par fournisseur
            const supplierTotals: { [key: string]: { total: number; count: number } } = {};

            supplierExpenses.forEach(tx => {
              const desc = tx.description || '';

              // Identifier le fournisseur
              for (const supplier of suppliers) {
                if (matchesSupplier(desc, supplier)) {
                  if (!supplierTotals[supplier]) {
                    supplierTotals[supplier] = { total: 0, count: 0 };
                  }
                  supplierTotals[supplier].total += Math.abs(tx.amount);
                  supplierTotals[supplier].count++;
                  break; // Un seul fournisseur par transaction
                }
              }
            });

            // Trier par total décroissant
            const sortedSuppliers = Object.entries(supplierTotals)
              .map(([name, data]) => ({ name, ...data }))
              .sort((a, b) => b.total - a.total);

            if (sortedSuppliers.length > 0) {
              // Détection de "top X" dans la question
              const topMatch = questionLower.match(/(?:top\s*(\d+)|les?\s+(\d+)\s+fournisseurs)/);
              const topN = topMatch ? Math.min(parseInt(topMatch[1] || topMatch[2]), sortedSuppliers.length) : Math.min(5, sortedSuppliers.length);

              analysisText = `\n\n📊 ANALYSE DES DÉPENSES FOURNISSEURS\n\n`;
              analysisText += `🏪 Top ${topN} des fournisseurs par dépenses:\n`;
              sortedSuppliers.slice(0, topN).forEach((sup, i) => {
                const icon = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
                analysisText += `${icon} ${sup.name}: ${sup.total.toFixed(2)}€ (${sup.count} paiements)\n`;
              });

              // Statistiques globales
              const totalSuppliers = sortedSuppliers.length;
              const avgPerSupplier = totalSpent / totalSuppliers;
              analysisText += `\n📈 Statistiques:\n`;
              analysisText += `   • Nombre de fournisseurs: ${totalSuppliers}\n`;
              analysisText += `   • Dépense moyenne par fournisseur: ${avgPerSupplier.toFixed(2)}€\n`;
              analysisText += `   • Total dépensé: ${totalSpent.toFixed(2)}€\n`;
            }
          }

          // Formatter la liste des dépenses
          const expenseList = supplierExpenses.map((tx, index) => {
            const num = String(index + 1).padStart(2, ' ');
            const date = new Date(tx.date).toLocaleDateString('fr-BE');
            const amount = Math.abs(tx.amount).toFixed(2);
            const desc = tx.description || 'Sans description';

            // Identifier le fournisseur
            let supplierName = 'Inconnu';
            for (const supplier of suppliers) {
              if (matchesSupplier(desc, supplier)) {
                supplierName = supplier;
                break;
              }
            }

            return `${num}. ${date} - ${amount}€ - ${supplierName}`;
          }).join('\n');

          // Décider si on inclut la liste détaillée
          const userAsksForList = questionLower.includes('liste') || questionLower.includes('détail');
          const userWantsDetails = args.include_details === true || userAsksForList;
          const userAsksForTopOnly = /top\s*\d+/.test(questionLower) && !userAsksForList;
          const isSpecificSupplierSearch = args.supplier_name && supplierExpenses.length <= 10;
          const isSingleMonthManyExpenses = args.month && supplierExpenses.length > 10;
          const includeDetailedList = !userAsksForTopOnly && !isSingleMonthManyExpenses && (userWantsDetails || isSpecificSupplierSearch);

          let directResponse = '';

          // 🔍 CAS: PLUSIEURS FOURNISSEURS → Générer une section par fournisseur
          if (isMultiSupplier && suppliersToProcess.length > 0) {
            directResponse = `📊 Analyse de ${suppliersToProcess.length} fournisseurs - ${periodTitle}\n\n`;

            for (const supplierName of suppliersToProcess) {
              // Analyser ce fournisseur spécifique
              const singleSupplierTxs = await analyzeSingleSupplier(supplierName);
              const singleDebits = singleSupplierTxs.filter((tx: BankTransaction) => tx.type === 'Debit');
              const singleCredits = singleSupplierTxs.filter((tx: BankTransaction) => tx.type === 'Credit');
              const singleTotalDebits = singleDebits.reduce((sum: number, tx: BankTransaction) => sum + Math.abs(tx.amount), 0);
              const singleTotalCredits = singleCredits.reduce((sum: number, tx: BankTransaction) => sum + tx.amount, 0);

              const singleIsRevenue = singleTotalCredits > singleTotalDebits;
              const singleExpenses = singleIsRevenue ? singleCredits : singleDebits;
              const singleTotal = singleExpenses.reduce((sum: number, tx: BankTransaction) => sum + Math.abs(tx.amount), 0);
              const singleCount = singleExpenses.length;

              if (singleCount === 0) {
                directResponse += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
                directResponse += `🔍 ${supplierName}\n`;
                directResponse += `❌ Aucune donnée trouvée pour ce fournisseur (ni transactions bancaires, ni factures).\n`;
                continue;
              }

              // Trier par date
              singleExpenses.sort((a: BankTransaction, b: BankTransaction) => new Date(b.date).getTime() - new Date(a.date).getTime());

              const icon = singleIsRevenue ? '💰' : '💸';
              const typeLabel = singleIsRevenue ? 'Revenus' : 'Dépenses';
              const countLabel = singleIsRevenue ? 'versements' : 'paiements';

              directResponse += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
              directResponse += `${icon} ${supplierName} - ${typeLabel} de ${periodTitle}\n\n`;
              directResponse += `Total: ${singleTotal.toFixed(2)}€ (${singleCount} ${countLabel})\n`;

              // Ajouter quelques statistiques
              const amounts = singleExpenses.map(tx => Math.abs(tx.amount));
              const avgAmount = singleTotal / singleCount;
              directResponse += `   • Moyenne: ${avgAmount.toFixed(2)}€\n`;
              directResponse += `   • Min: ${Math.min(...amounts).toFixed(2)}€ | Max: ${Math.max(...amounts).toFixed(2)}€\n`;

              // Afficher les 5 dernières transactions
              const recentTxs = singleExpenses.slice(0, 5);
              directResponse += `\n💳 Derniers ${countLabel}:\n`;
              recentTxs.forEach((tx, i) => {
                const date = new Date(tx.date).toLocaleDateString('fr-BE');
                const amount = Math.abs(tx.amount).toFixed(2);
                directResponse += `   ${i + 1}. ${date}: ${amount}€\n`;
              });
              if (singleCount > 5) {
                directResponse += `   ... et ${singleCount - 5} autres\n`;
              }
            }
          } else {
            // CAS: FOURNISSEUR UNIQUE OU TOUS
            // Adapter le titre selon le type (dépenses ou revenus)
            const titleIcon = isRevenuePartner ? '💰' : '💸';
            const titleType = isRevenuePartner ? 'Revenus' : 'Dépenses fournisseurs';
            const countLabel = isRevenuePartner ? 'versements' : 'paiements';

            // 📝 Construire le titre avec le nom du fournisseur si spécifié
            let titleWithSupplier = `${titleIcon} ${titleType} de ${periodTitle}`;
            if (args.supplier_name && !isMultiSupplier) {
              titleWithSupplier = `${titleIcon} ${args.supplier_name} - ${titleType} de ${periodTitle}`;
            }

            directResponse = `${titleWithSupplier}\n\n` +
              `Total: ${totalSpent.toFixed(2)}€ (${supplierExpenses.length} ${countLabel})` +
              `\n\n💡 Note: Ce montant représente les paiements réellement effectués (factures payées). Les factures en attente de paiement ne sont pas incluses.` +
              analysisText;

            if (includeDetailedList) {
              directResponse += `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` + expenseList;
            }
          }

          result = {
            supplier_name: args.supplier_name || 'Tous les fournisseurs',
            period: `${startDate.toLocaleDateString('fr-BE')} - ${endDate.toLocaleDateString('fr-BE')}`,
            total_spent: totalSpent,
            expense_count: supplierExpenses.length,
            expenses: supplierExpenses.map(tx => ({
              date: tx.date,
              amount: Math.abs(tx.amount),
              description: tx.description,
            })),
            currency: 'EUR',
            direct_response: directResponse,
          };
          break;
        }

        case 'compare_supplier_expenses': {
          // 🤖 Matching IA de tous les fournisseurs
          if (args.supplier_names && args.supplier_names.length > 0) {
            const matchedNames = await Promise.all(
              args.supplier_names.map((name: string) => helpers.matchSupplierWithAI(name))
            );
            args.supplier_names = matchedNames;
          }

          // Validation: au moins 2 fournisseurs
          if (!args.supplier_names || args.supplier_names.length < 2) {
            result = {
              error: 'Au moins 2 fournisseurs sont requis pour une comparaison',
              direct_response: '❌ Veuillez spécifier au moins 2 fournisseurs à comparer.'
            };
            break;
          }

          // Déterminer la période
          let startDate: Date;
          let endDate: Date;

          // 🆕 Gérer period_text (parsing IA) - PRIORITÉ sur month/year
          if (args.period_text) {
            const period = await helpers.parsePeriodWithAI(args.period_text);
            if (period) {
              startDate = period.start;
              endDate = period.end;
              console.log(`✅ Période IA utilisée pour comparaison fournisseurs: ${period.description}`);
            } else {
              return JSON.stringify({ error: `Impossible de parser la période: ${args.period_text}` });
            }
          } else {
            // Logique existante pour month/year
            if (args.month) {
              const monthMap: { [key: string]: number } = {
                'janvier': 0, 'fevrier': 1, 'février': 1, 'mars': 2, 'avril': 3,
                'mai': 4, 'juin': 5, 'juillet': 6, 'aout': 7, 'août': 7,
                'septembre': 8, 'octobre': 9, 'novembre': 10, 'decembre': 11, 'décembre': 11
              };

              let targetMonth = -1;
              const monthInput = args.month.toLowerCase();

              if (monthMap[monthInput] !== undefined) {
                targetMonth = monthMap[monthInput];
              } else if (!isNaN(parseInt(monthInput))) {
                targetMonth = parseInt(monthInput) - 1;
              }

              // Si aucune année spécifiée, déduire intelligemment l'année
              let targetYear: number;
              if (args.year) {
                targetYear = parseInt(args.year);
              } else {
                const now = new Date();
                const currentYear = now.getFullYear();
                const currentMonth = now.getMonth();

                // Si le mois demandé est dans le futur, utiliser l'année précédente
                if (targetMonth > currentMonth) {
                  targetYear = currentYear - 1;
                } else {
                  targetYear = currentYear;
                }
              }

              startDate = new Date(targetYear, targetMonth, 1);
              endDate = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59);
            } else {
              // Par défaut: année intelligente
              let targetYear: number;
              if (args.year) {
                targetYear = parseInt(args.year);
              } else {
                const now = new Date();
                const currentYear = now.getFullYear();
                const currentMonth = now.getMonth();

                // Si on est en janvier (mois 0), utiliser l'année précédente par défaut
                if (currentMonth === 0) {
                  targetYear = currentYear - 1;
                } else {
                  targetYear = currentYear;
                }
              }
              startDate = new Date(targetYear, 0, 1);
              endDate = new Date(targetYear, 11, 31, 23, 59, 59);
            }
            }  // Fin du else pour logique existante (month/year)

          // Récupérer toutes les transactions
          const transactions = await ctx.bankClient.getTransactionsByPeriod(startDate, endDate);

          // Fonction pour extraire les dépenses d'un fournisseur
          const getSupplierExpenses = (supplierName: string) => {
            const expenses = transactions.filter(tx =>
              tx.type === 'Debit' &&
              matchesSupplier(tx.description || '', supplierName)
            );

            const total = expenses.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
            const sortedExpenses = expenses.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            const max = sortedExpenses.length > 0 ? sortedExpenses.reduce((m, tx) => Math.max(m, Math.abs(tx.amount)), 0) : 0;
            const maxTx = sortedExpenses.find(tx => Math.abs(tx.amount) === max);

            return {
              name: supplierName,
              total,
              count: expenses.length,
              avg: expenses.length > 0 ? total / expenses.length : 0,
              max,
              maxDate: maxTx ? new Date(maxTx.date) : null,
              transactions: sortedExpenses,
              found: expenses.length > 0
            };
          };

          // Récupérer les données de tous les fournisseurs
          const suppliersData = args.supplier_names.map(getSupplierExpenses);

          // Vérifier si tous ont des dépenses
          const notFound = suppliersData.filter((s: SupplierData) => !s.found);
          if (notFound.length === args.supplier_names.length) {
            result = {
              error: 'Aucune dépense trouvée pour ces fournisseurs',
              direct_response: `❌ Aucune dépense trouvée pour: ${notFound.map((s: SupplierData) => s.name).join(', ')}`
            };
            break;
          }

          // Filtrer uniquement les fournisseurs trouvés
          const foundSuppliers = suppliersData.filter((s: SupplierData) => s.found);

          // Trier par total décroissant
          const sorted = foundSuppliers.sort((a: { total: number }, b: { total: number }) => b.total - a.total);

          // Générer le titre de période
          let periodTitle: string;
          if (args.month) {
            periodTitle = startDate.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
          } else {
            periodTitle = `année ${startDate.getFullYear()}`;
          }

          // Générer la réponse comparative
          let directResponse = `📊 COMPARAISON DE DÉPENSES FOURNISSEURS\n\n`;
          directResponse += `${sorted.map((s: SupplierData) => s.name).join(' vs ')} (${periodTitle})\n\n`;
          directResponse += `💸 Classement par total dépensé:\n`;
          sorted.forEach((sup: SupplierData, i: number) => {
            const icon = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
            directResponse += `   ${icon} ${sup.name}: ${sup.total.toFixed(2)}€ (${sup.count} paiements)\n`;
          });

          if (sorted.length === 2) {
            const diff = sorted[0].total - sorted[1].total;
            const percentage = ((diff / sorted[1].total) * 100).toFixed(1);
            directResponse += `\n📈 Différence: ${Math.abs(diff).toFixed(2)}€ (+${percentage}%) en faveur de ${sorted[0].name}\n`;
          }

          directResponse += `\n📊 Dépense moyenne par paiement:\n`;
          sorted.forEach((sup: SupplierData, i: number) => {
            const icon = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
            directResponse += `   ${icon} ${sup.name}: ${(sup.avg ?? sup.average ?? 0).toFixed(2)}€\n`;
          });

          directResponse += `\n🏆 Plus hauts paiements individuels:\n`;
          sorted.forEach((sup: SupplierData) => {
            directResponse += `   • ${sup.name}: ${(sup.max ?? 0).toFixed(2)}€${sup.maxDate ? ` (${new Date(sup.maxDate).toLocaleDateString('fr-BE')})` : ''}\n`;
          });

          // Ajouter avertissement si certains fournisseurs n'ont pas de dépenses
          if (notFound.length > 0) {
            directResponse += `\n⚠️ Aucune dépense pour: ${notFound.map((s: SupplierData) => s.name).join(', ')}`;
          }

          result = {
            suppliers: sorted.map((s: any) => ({
              name: s.name,
              total: s.total,
              count: s.count,
              avg: s.avg,
              max: s.max
            })),
            winner: sorted[0].name,
            direct_response: directResponse
          };
          break;
        }

        case 'get_supplier_payments': {
          // 🤖 Matching IA du fournisseur
          const matchedSupplier = await helpers.matchSupplierWithAI(args.supplier_name);
          args.supplier_name = matchedSupplier; // Remplacer par le nom exact

          // 🆕 Gérer period_text (parsing IA) - PRIORITÉ sur month/year
          let startDate: Date;
          let endDate: Date;

          if (args.period_text) {
            const period = await helpers.parsePeriodWithAI(args.period_text);
            if (period) {
              startDate = period.start;
              endDate = period.end;
              console.log(`✅ Période IA utilisée pour ${args.supplier_name}: ${period.description}`);
            } else {
              return JSON.stringify({ error: `Impossible de parser la période: ${args.period_text}` });
            }
          } else {
            // Logique existante pour month/year
            if (args.month) {
            // Convertir le mois en dates
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
              targetMonth = parseInt(monthInput) - 1;
            } else {
              return JSON.stringify({ error: `Mois invalide: ${args.month}` });
            }

            // Si aucune année spécifiée, déduire intelligemment l'année
            let targetYear: number;
            if (args.year) {
              targetYear = parseInt(args.year);
            } else {
              const now = new Date();
              const currentYear = now.getFullYear();
              const currentMonth = now.getMonth();

              // Si le mois demandé est dans le futur, utiliser l'année précédente
              if (targetMonth > currentMonth) {
                targetYear = currentYear - 1;
              } else {
                targetYear = currentYear;
              }
            }

            startDate = new Date(targetYear, targetMonth, 1);
            endDate = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59);
          } else if (args.year) {
            // Année spécifique uniquement
            const targetYear = parseInt(args.year);
            startDate = new Date(targetYear, 0, 1);
            endDate = new Date(targetYear, 11, 31, 23, 59, 59);
          } else {
            // Par défaut: toutes les transactions disponibles (pour "dernier paiement", "total", etc.)
            startDate = new Date(2020, 0, 1);  // Date arbitraire dans le passé
            endDate = new Date();
          }
          }  // Fin du else pour logique existante (month/year)

          let transactions = await ctx.bankClient.getTransactionsByPeriod(startDate, endDate);

          // Filtrer par fournisseur SEULEMENT les débits (paiements VERS le fournisseur)
          const supplierPayments = transactions.filter(tx =>
            tx.type === 'Debit' &&
            matchesSupplier(tx.description || '', args.supplier_name)
          );

          // Calculer le total (débits sont négatifs, on prend la valeur absolue)
          const totalPaid = supplierPayments.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

          // 🔍 DÉTECTION: Si 0 paiements VERS le fournisseur, vérifier d'abord les factures Billit (ex: Uber)
          if (totalPaid === 0 && supplierPayments.length === 0) {
            // 📄 Vérifier d'abord s'il y a des factures dans Billit
            try {
              const allInvoices = await ctx.billitClient.getInvoices({ limit: 120 });
              const supplierInvoices = allInvoices.filter(inv => {
                const invDate = new Date(inv.invoice_date);
                return invDate >= startDate && invDate <= endDate && matchesSupplier(inv.supplier_name, args.supplier_name);
              });

              if (supplierInvoices.length > 0) {
                // 💡 Des factures existent dans Billit - les afficher comme dépenses
                const totalInvoices = supplierInvoices.reduce((sum, inv) => sum + inv.total_amount, 0);
                const invoiceList = supplierInvoices.map(inv => ({
                  date: inv.invoice_date,
                  amount: inv.total_amount,
                  description: `Facture ${inv.invoice_number} - ${inv.supplier_name}`,
                  invoice_number: inv.invoice_number,
                  supplier_name: inv.supplier_name,
                })).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

                result = {
                  supplier_name: args.supplier_name,
                  period: `${startDate.toLocaleDateString('fr-BE')} - ${endDate.toLocaleDateString('fr-BE')}`,
                  total_paid: totalInvoices,
                  payment_count: supplierInvoices.length,
                  payments: invoiceList,
                  currency: 'EUR',
                  // 💡 INFORMATION: Les dépenses viennent des factures Billit (pas de débits bancaires)
                  is_invoice_based_expenses: true,
                  direct_response: `💸 Dépenses: ${args.supplier_name}\n${startDate.toLocaleDateString('fr-BE')} - ${endDate.toLocaleDateString('fr-BE')}\n\nTotal: **${totalInvoices.toFixed(2)}€** (${supplierInvoices.length} facture${supplierInvoices.length > 1 ? 's' : ''})\n\n📄 Factures${supplierInvoices.length > 5 ? ' (5 premières)' : ''}:\n${invoiceList.slice(0, 5).map(inv => {
                    const d = new Date(inv.date);
                    return `  ${d.toLocaleDateString('fr-BE', { day: '2-digit', month: '2-digit', year: '2-digit' })}: ${inv.amount.toFixed(2)}€ - ${inv.description}`;
                  }).join('\n')}${supplierInvoices.length > 5 ? `\n  ... et ${supplierInvoices.length - 5} autres` : ''}\n\n💡 Note: Ces dépenses proviennent des factures Billit (commissions déduites à la source).`
                };
                break;
              }
            } catch (error) {
              console.error('❌ Erreur lors de la vérification des factures Billit:', error);
            }

            // 📊 Si aucune facture Billit, vérifier s'il y a des paiements DE sa part (revenus)
            const supplierReceived = transactions.filter(tx =>
              tx.type === 'Credit' &&
              matchesSupplier(tx.description || '', args.supplier_name)
            );

            if (supplierReceived.length > 0) {
              const totalReceived = supplierReceived.reduce((sum, tx) => sum + tx.amount, 0);
              result = {
                supplier_name: args.supplier_name,
                period: `${startDate.toLocaleDateString('fr-BE')} - ${endDate.toLocaleDateString('fr-BE')}`,
                total_paid: 0,
                payment_count: 0,
                payments: [],
                currency: 'EUR',
                // 💡 INFORMATION CLÉ: C'est un partenaire de revenus (pas un fournisseur de dépenses)
                is_revenue_partner: true,
                total_received: totalReceived,
                received_count: supplierReceived.length,
                direct_response: `💰 ${args.supplier_name} est un **partenaire de revenus** (pas une dépense).\n\nVous avez reçu **${totalReceived.toFixed(2)}€** de ${args.supplier_name} sur cette période (${supplierReceived.length} versements).\n\nC'est un revenu, pas une dépense.`
              };
              break;
            }
          }

          result = {
            supplier_name: args.supplier_name,
            period: `${startDate.toLocaleDateString('fr-BE')} - ${endDate.toLocaleDateString('fr-BE')}`,
            total_paid: totalPaid,
            payment_count: supplierPayments.length,
            payments: supplierPayments.map(tx => ({
              date: tx.date,
              amount: Math.abs(tx.amount), // Afficher en positif (paiement)
              description: tx.description,
            })),
            currency: 'EUR',
          };
          break;
        }

        case 'get_supplier_received_payments': {
          // 🤖 Matching IA du fournisseur
          const matchedSupplier = await helpers.matchSupplierWithAI(args.supplier_name);
          args.supplier_name = matchedSupplier; // Remplacer par le nom exact

          // 🆕 Gérer period_text (parsing IA) - PRIORITÉ sur month/year
          let startDate: Date;
          let endDate: Date;

          if (args.period_text) {
            const period = await helpers.parsePeriodWithAI(args.period_text);
            if (period) {
              startDate = period.start;
              endDate = period.end;
              console.log(`✅ Période IA utilisée pour ${args.supplier_name} (reçus): ${period.description}`);
            } else {
              return JSON.stringify({ error: `Impossible de parser la période: ${args.period_text}` });
            }
          } else {
            // Logique existante pour month/year
            if (args.month) {
            // Convertir le mois en dates
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
              targetMonth = parseInt(monthInput) - 1;
            } else {
              return JSON.stringify({ error: `Mois invalide: ${args.month}` });
            }

            const targetYear = args.year ? parseInt(args.year) : new Date().getFullYear();
            startDate = new Date(targetYear, targetMonth, 1);
            endDate = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59);
          } else if (args.year) {
            // Année spécifique uniquement
            const targetYear = parseInt(args.year);
            startDate = new Date(targetYear, 0, 1);
            endDate = new Date(targetYear, 11, 31, 23, 59, 59);
          } else {
            // Par défaut: toutes les transactions disponibles (pour "dernier paiement", "total", etc.)
            startDate = new Date(2020, 0, 1);  // Date arbitraire dans le passé
            endDate = new Date();
          }
          }  // Fin du else pour logique existante (month/year)

          let transactions = await ctx.bankClient.getTransactionsByPeriod(startDate, endDate);

          // Filtrer par fournisseur SEULEMENT les crédits (versements DU fournisseur)
          const supplierReceived = transactions.filter(tx =>
            tx.type === 'Credit' &&
            matchesSupplier(tx.description || '', args.supplier_name)
          );

          // Calculer le total (crédits sont positifs)
          const totalReceived = supplierReceived.reduce((sum, tx) => sum + tx.amount, 0);

          result = {
            supplier_name: args.supplier_name,
            period: `${startDate.toLocaleDateString('fr-BE')} - ${endDate.toLocaleDateString('fr-BE')}`,
            total_received: totalReceived,
            payment_count: supplierReceived.length,
            payments: supplierReceived.map(tx => ({
              date: tx.date,
              amount: tx.amount,
              description: tx.description,
            })),
            currency: 'EUR',
          };
          break;
        }
        case 'list_suppliers': {
          // Lister tous les fournisseurs depuis la base de données SQLite
          try {
            const suppliers = getAllSuppliers();

            if (suppliers.length === 0) {
              result = {
                success: false,
                error: 'empty_list',
                message: '❌ Aucun fournisseur n\'est configuré.',
              };
              break;
            }

            // Formatage simple et cohérent pour Telegram (même format que les employés)
            const suppliersList = suppliers.map((sup, index) => {
              const num = String(index + 1).padStart(2, ' ');
              const name = sup.name;
              const type = sup.type || 'fournisseur';

              // Format simple: "1. Nom - Type"
              return `${num}. ${name} - ${type}`;
            }).join('\n');

            const formattedMessage = `📦 Liste des fournisseurs (${suppliers.length})\n\n${suppliersList}`;

            result = {
              success: true,
              direct_response: formattedMessage,
              message: formattedMessage,
            };
          } catch (error: any) {
            result = {
              success: false,
              error: 'database_error',
              message: `❌ Erreur lors de la récupération des fournisseurs: ${error.message}`,
            };
          }
          break;
        }

        case 'add_supplier': {
          // Ajouter manuellement un fournisseur (SQLite)
          const aliases = args.aliases || [];
          const patterns = [args.supplier_name.toLowerCase().replace(/[^a-z0-9]/g, '')];
          const addResult = addSupplier(
            args.supplier_name.toLowerCase().replace(/\s+/g, ''),
            args.supplier_name,
            aliases.map((a: string) => a.toLowerCase()),
            patterns
          );

          result = {
            success: addResult.success,
            supplier_name: args.supplier_name,
            aliases: aliases,
            message: addResult.message,
          };
          break;
        }

        case 'delete_supplier': {
          // Supprimer un fournisseur (SQLite)
          const deleteResult = deleteSupplier(args.supplier_key);

          result = {
            success: deleteResult.success,
            supplier_key: args.supplier_key,
            message: deleteResult.message,
          };
          break;
        }

        case 'detect_new_suppliers': {
          try {
            // Importer les fonctions nécessaires

            // Récupérer toutes les transactions bancaires
            const transactions = await ctx.bankClient.getAllTransactions();

            // Mots-clés à exclure (salaires, taxes, paiements récurrents)
            const EXCLUDED_KEYWORDS = [
              'salaire', 'salary', 'avance', 'solde salaire',
              'onss', 'tva', 'precompte', 'fiscal', 'impot',
              'loyer', 'rent', 'ordre permanent', 'standing order',
              'tonton chami', 'bureau', 'compte',
              'indexation', 'sogle', 'team precompte'
            ];

            // Récupérer tous les fournisseurs connus
            const suppliers = getAllSuppliers();
            const supplierNames = suppliers.map(s => s.name);

            // Filtrer les transactions Debit qui ne matchent aucun fournisseur connu
            const unmatchedTransactions = transactions.filter((tx: BankTransaction) => {
              if (tx.type !== 'Debit') return false;

              const description = tx.description || '';
              const descLower = description.toLowerCase();

              // Ignorer les transactions vides ou trop courtes
              if (description.length < 10) return false;

              // Ignorer les mots-clés exclus
              if (EXCLUDED_KEYWORDS.some(keyword => descLower.includes(keyword))) {
                return false;
              }

              // Vérifier si matche un fournisseur connu
              const matchesKnownSupplier = supplierNames.some(supplier =>
                matchesSupplier(description, supplier)
              );

              return !matchesKnownSupplier;
            });

            if (unmatchedTransactions.length === 0) {
              result = {
                success: true,
                count: 0,
                message: '✅ Toutes les transactions correspondent à des fournisseurs connus !\n\n🎯 Couverture: 100%\n📊 Fournisseurs en base: ' + suppliers.length,
              };
            } else {
              // Regrouper les transactions par description similaire
              const grouped = new Map<string, any>();

              unmatchedTransactions.forEach((tx: BankTransaction) => {
                const description = tx.description || '';
                const normalized = normalizeSearchTerm(description);
                const potentialNames = extractPotentialSupplierNames(description);

                const key = normalized.substring(0, 30);

                if (grouped.has(key)) {
                  const existing = grouped.get(key);
                  existing.count++;
                  existing.totalAmount += Math.abs(tx.amount);
                  existing.transactions.push({
                    date: tx.date,
                    amount: Math.abs(tx.amount),
                    description: description
                  });
                } else {
                  grouped.set(key, {
                    description: description,
                    normalizedDescription: normalized,
                    potentialNames: potentialNames,
                    count: 1,
                    totalAmount: Math.abs(tx.amount),
                    transactions: [{
                      date: tx.date,
                      amount: Math.abs(tx.amount),
                      description: description
                    }]
                  });
                }
              });

              // Convertir en tableau et trier par montant total décroissant
              const unknownSuppliers = Array.from(grouped.values())
                .sort((a, b) => b.totalAmount - a.totalAmount);

              // Formater le message
              let message = `🔍 DÉTECTION DE NOUVEAUX FOURNISSEURS\n\n`;
              message += `📊 ${unmatchedTransactions.length} transaction(s) non matchée(s)\n`;
              message += `📋 ${unknownSuppliers.length} fournisseur(s) potentiel(s) détecté(s)\n\n`;
              message += `${'='.repeat(40)}\n\n`;

              unknownSuppliers.slice(0, 10).forEach((supplier, index) => {
                message += `${index + 1}. 💰 ${supplier.totalAmount.toFixed(2)}€ (${supplier.count} transaction${supplier.count > 1 ? 's' : ''})\n`;
                message += `   📝 ${supplier.description.substring(0, 60)}${supplier.description.length > 60 ? '...' : ''}\n`;

                if (supplier.potentialNames.length > 0) {
                  message += `   🏷️  ${supplier.potentialNames.slice(0, 3).join(', ')}\n`;
                }

                message += `   📅 ${supplier.transactions[0].date}: ${supplier.transactions[0].amount.toFixed(2)}€\n`;

                if (supplier.transactions.length > 1) {
                  message += `   ... et ${supplier.transactions.length - 1} autre(s)\n`;
                }

                message += `\n`;
              });

              if (unknownSuppliers.length > 10) {
                message += `... et ${unknownSuppliers.length - 10} autre(s)\n\n`;
              }

              message += `💡 Pour ajouter ces fournisseurs:\n`;
              message += `1. Modifier src/reload-suppliers.ts\n`;
              message += `2. Ajouter à ADDITIONAL_KNOWN_SUPPLIERS\n`;
              message += `3. Exécuter: npm run build && node dist/reload-suppliers.js`;

              result = {
                success: true,
                count: unknownSuppliers.length,
                unmatched_transactions: unmatchedTransactions.length,
                suppliers: unknownSuppliers,
                message: message,
              };
            }
          } catch (error: any) {
            result = {
              success: false,
              error: 'detection_error',
              message: `❌ Erreur lors de la détection: ${error.message}`,
            };
          }
          break;
        }


    default:
      return null;
  }

  return JSON.stringify(result, null, 2);
}
