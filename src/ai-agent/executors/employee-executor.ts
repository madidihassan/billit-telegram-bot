/**
 * Executor pour les outils employes/salaires
 * Couvre: salaires, comparaisons, gestion des employes
 */

import type { ExecutorContext, ExecutorHelpers } from './types';
import type { ToolResult } from '../../types/ai-agent';
import type { EmployeeData } from '../../types/ai-agent';
import { BankClient, type BankTransaction } from '../../bank-client';
import { matchesSupplier } from '../../supplier-aliases';
import {
  getAllEmployees,
  addEmployee,
  getEmployeeByName,
  employeeExistsByName,
  removeEmployee,
} from '../../database';

const HANDLED = new Set([
  'get_employee_salaries',
  'compare_employee_salaries',
  'list_employees',
  'add_employee',
  'remove_employee',
]);

export async function executeEmployeeFunction(
  functionName: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  args: Record<string, any>,
  ctx: ExecutorContext,
  helpers: ExecutorHelpers
): Promise<string | null> {
  if (!HANDLED.has(functionName)) return null;

  let result: ToolResult;

  switch (functionName) {
        case 'get_employee_salaries': {
          // 🔧 CORRECTION AUTO: "du mois" sans paramètre de période = mois actuel
          const qLower = ctx.currentQuestion.toLowerCase();
          const hasPeriodParam = args.period_text || args.month || args.start_month || args.end_month || args.year;
          if (!hasPeriodParam && (qLower.includes('du mois') || qLower.includes('ce mois') || qLower.includes('le mois'))) {
            const now = new Date();
            const monthNames = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
            args.month = monthNames[now.getMonth()];
            console.log(`🔧 CORRECTION AUTO: "du mois" détecté → ajout month="${args.month}"`);
          }

          // 🤖 Matching IA de l'employé si spécifié
          if (args.employee_name) {
            const matchedEmployee = await helpers.matchEmployeeWithAI(args.employee_name);
            args.employee_name = matchedEmployee; // Remplacer par le nom exact
          }

          // 🆕 Gérer period_text (parsing IA) - PRIORITÉ sur month/start_month/end_month
          let startDate: Date | undefined;
          let endDate: Date | undefined;
          let periodDescription: string | undefined;
          let periodParsed = false; // Flag pour savoir si period_text a été parsé avec succès

          if (args.period_text) {
            // 🔧 Fallback direct pour "année XXXX" au lieu de parsing IA
            const yearMatch = args.period_text.match(/année\s+(\d{4})/i);
            if (yearMatch) {
              const year = parseInt(yearMatch[1]);
              startDate = new Date(year, 0, 1); // 1er janvier
              endDate = new Date(year, 11, 31, 23, 59, 59); // 31 décembre
              periodDescription = `année ${year}`;
              periodParsed = true;
              console.log(`✅ Période directe (année ${year}): ${startDate.toISOString().split('T')[0]} à ${endDate.toISOString().split('T')[0]}`);
            } else {
              // Pour les autres cas, utiliser le parsing IA
              try {
                const period = await helpers.parsePeriodWithAI(args.period_text);
                if (period) {
                  startDate = period.start;
                  endDate = period.end;
                  periodDescription = period.description;
                  periodParsed = true;
                  console.log(`✅ Période IA utilisée: ${period.description}`);
                } else {
                  // ⚠️ Parsing IA échoué, continuer avec start_month/end_month si disponibles
                  console.log(`⚠️ Parsing IA échoué pour "${args.period_text}", tentative avec start_month/end_month`);
                  // Ne PAS retourner d'erreur ici - continuer avec les autres paramètres
                }
              } catch (error) {
                console.log(`⚠️ Erreur parsing IA pour "${args.period_text}": ${error}, tentative avec start_month/end_month`);
                // Ne PAS retourner d'erreur ici - continuer avec les autres paramètres
              }
            }
          }

          // 🔵 Si period_text n'a pas été parsé, essayer month/start_month/end_month
          if (!periodParsed) {
            // Logique existante pour month/start_month/end_month/start_date/end_date
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
              // Exemple: janvier 2026, demande "décembre" → décembre 2025
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
          } else if (args.start_date && args.end_date) {
            startDate = BankClient.parseDate(args.start_date) || new Date();
            endDate = BankClient.parseDate(args.end_date) || new Date();
          } else {
            // Par défaut: toutes les transactions disponibles (pour "dernier paiement", "total", etc.)
            startDate = new Date(2020, 0, 1);  // Date arbitraire dans le passé
            endDate = new Date();
          }
          }  // Fin du else pour logique existante (month/start_month/end_date)

          if (!startDate || !endDate) {
            return JSON.stringify({ error: 'Format de date invalide' });
          }

          let transactions = await ctx.bankClient.getTransactionsByPeriod(startDate, endDate);

          // Filtrer par employé (si spécifié)
          let employees = getAllEmployees();
          let salaryTransactions: BankTransaction[];

          // Fonction stricte pour matcher un nom d'employé dans une description
          const matchesEmployeeName = (description: string, employeeName: string): boolean => {
            const desc = description.toLowerCase();
            const name = employeeName.toLowerCase();

            // Découper le nom en parties (prénom/nom)
            const nameParts = name.split(' ').filter(p => p.length > 2);

            // Vérifier si TOUS les mots significatifs du nom sont présents
            return nameParts.every(part => desc.includes(part));
          };

          // Fonction pour vérifier si c'est un virement de salaire
          const isSalaryTransaction = (description: string): boolean => {
            if (!description) return false;
            const desc = description.toLowerCase();
            // Accepter "salaire" OU "salair" (pour descriptions tronquées comme "Avance salair...")
            return desc.includes('salaire') || desc.includes('salair');
          };

          if (args.employee_name) {
            // Filtrer pour un employé spécifique ou recherche partielle (ex: "Madidi" pour tous les Madidi)
            const searchTerm = args.employee_name.toLowerCase();

            // 🔍 PRIORITÉ: Chercher d'abord dans les noms d'employés en base de données
            let matchingEmployees: Array<{ name: string; id?: number }> = [];

            if (!searchTerm.includes(' ')) {
              // Recherche partielle dans les noms d'employés
              matchingEmployees = employees.filter(emp =>
                emp.name.toLowerCase().includes(searchTerm)
              );

              console.log(`🔍 Recherche partielle "${searchTerm}": ${matchingEmployees.length} employé(s) trouvé(s) en BDD`);
            }

            // Si on a trouvé des employés en BDD, filtrer UNIQUEMENT sur ces noms
            if (matchingEmployees.length > 0) {
              salaryTransactions = transactions.filter(tx => {
                if (tx.type !== 'Debit' || !tx.description) return false;
                if (!isSalaryTransaction(tx.description)) return false;

                // Vérifier si la transaction correspond à un des employés trouvés
                return matchingEmployees.some(emp => matchesEmployeeName(tx.description, emp.name));
              });
            } else {
              // Sinon, recherche classique dans les descriptions
              salaryTransactions = transactions.filter(tx => {
                if (tx.type !== 'Debit' || !tx.description) return false;

                // Si le terme de recherche est un nom de famille seul (pas d'espace), chercher partiellement
                if (!searchTerm.includes(' ')) {
                  // Recherche partielle: vérifier si la description contient le terme ET "salaire"
                  const desc = tx.description.toLowerCase();
                  return desc.includes('salaire') && desc.includes(searchTerm);
                } else {
                  // Recherche exacte: contient "salaire" ET le nom complet correspond
                  return isSalaryTransaction(tx.description) && matchesEmployeeName(tx.description, args.employee_name);
                }
              });
            }
          } else {
            // Obtenir TOUS les salaires
            salaryTransactions = transactions.filter(tx => {
              if (tx.type !== 'Debit' || !tx.description) return false;
              // Accepter si: contient "salaire" OU si correspond à un nom d'employé
              return isSalaryTransaction(tx.description) ||
                     employees.some(emp => matchesEmployeeName(tx.description, emp.name));
            });
          }

          const totalPaid = salaryTransactions.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

          // 🔍 RECHERCHE FLOUE: Si aucun résultat et un nom d'employé était spécifié, chercher des noms similaires
          let suggestionMessage = '';
          if (args.employee_name && totalPaid === 0) {
            console.log(`🔍 Recherche floue pour "${args.employee_name}" (0 résultats trouvés)...`);

            // Si le nom contient un espace, chercher une correspondance exacte avec autocorrection
            if (args.employee_name.includes(' ')) {
              const closestMatch = await helpers.findClosestEmployee(args.employee_name);

              if (closestMatch) {
                console.log(`✨ Employé similaire trouvé: "${closestMatch.employee.name}" (distance: ${closestMatch.distance})`);

                // Réessayer la recherche avec le nom corrigé
                const correctedTransactions = transactions.filter(tx => {
                  if (tx.type !== 'Debit' || !tx.description) return false;
                  return isSalaryTransaction(tx.description) && matchesEmployeeName(tx.description, closestMatch.employee.name);
                });

                if (correctedTransactions.length > 0) {
                  salaryTransactions = correctedTransactions;
                  suggestionMessage = `\n\n💡 Aucun employé trouvé pour "${args.employee_name}". Résultats affichés pour "${closestMatch.employee.name}" à la place.`;
                }
              }
            } else {
              // Si c'est un nom partiel (sans espace), proposer des suggestions
              const suggestions = await helpers.findSimilarEmployees(args.employee_name, 5);

              if (suggestions.length > 0) {
                console.log(`💡 ${suggestions.length} suggestion(s) trouvée(s) pour "${args.employee_name}"`);

                suggestionMessage = `\n\n❓ Aucun employé trouvé pour "${args.employee_name}".\n\n`;
                suggestionMessage += `Vouliez-vous dire :\n`;
                suggestions.forEach((s, i) => {
                  suggestionMessage += `${i + 1}. ${s.employee.name}\n`;
                });
                suggestionMessage += `\nVeuillez préciser le nom complet de l'employé.`;
              } else {
                console.log(`❌ Aucun employé similaire trouvé pour "${args.employee_name}"`);
              }
            }
          }

          // Recalculer le total après recherche floue
          const finalTotalPaid = salaryTransactions.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

          // Trier par date décroissante (plus récent en premier)
          salaryTransactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

          // 🤖 AUTO-APPRENTISSAGE: Détecter et ajouter automatiquement les employés inconnus
          const newEmployeesAdded: string[] = [];

          salaryTransactions.forEach(tx => {
            const desc = tx.description || '';
            const descLower = desc.toLowerCase();

            // Vérifier si l'employé est déjà connu
            const isKnown = employees.some(emp => {
              const nameParts = emp.name.toLowerCase().split(' ');
              return nameParts.every(part => descLower.includes(part));
            });

            if (!isKnown && isSalaryTransaction(desc)) {
              // Extraire le nom de la description
              // Format: "VIREMENT EN FAVEUR DE [NOM] BE12..."
              const match = desc.match(/VIREMENT EN FAVEUR DE\s+(.+?)\s+BE\d{2}/i);
              if (match) {
                const extractedName = match[1].trim();

                // Vérifier qu'on n'a pas déjà ajouté ce nom
                const alreadyAdded = newEmployeesAdded.some(name =>
                  name.toLowerCase() === extractedName.toLowerCase()
                );

                if (!alreadyAdded) {
                  // Vérifier que le nom n'existe pas déjà (double check)
                  const existsInDb = employees.some(emp =>
                    emp.name.toLowerCase() === extractedName.toLowerCase()
                  );

                  if (!existsInDb) {
                    // Ajouter automatiquement à la base de données
                    addEmployee(extractedName);
                    employees.push({
                      id: 0,
                      name: extractedName,
                      chat_id: null,
                      position: null,
                      hire_date: null,
                      is_active: true,
                      created_at: new Date().toISOString()
                    });
                    newEmployeesAdded.push(extractedName);
                    console.log(`🤖 AUTO-APPRENTISSAGE: Nouvel employé ajouté automatiquement: "${extractedName}"`);
                  }
                }
              }
            }
          });

          // ✅ Recharger les employés depuis la BD après auto-apprentissage
          if (newEmployeesAdded.length > 0) {
            employees = getAllEmployees();
            console.log(`✅ ${employees.length} employés rechargés depuis la BD`);
          }

          // 📊 ANALYSE MENSUELLE ET PAR EMPLOYÉ: si période > 1 mois OU si "analyse" demandée
          let monthlyAnalysis = '';
          const questionLower = ctx.currentQuestion.toLowerCase();
          const userAsksForAnalysis = questionLower.includes('analyse') || questionLower.includes('top');
          const isMultiMonthPeriod = (!args.month && !args.employee_name && salaryTransactions.length > 0) || userAsksForAnalysis;

          // Ne montrer l'analyse par employé que si aucun employé spécifique n'est demandé
          // ET (pas un mois spécifique OU l'utilisateur demande explicitement "analyse")
          const showEmployeeAnalysis = !args.employee_name && (!args.month || userAsksForAnalysis) && isMultiMonthPeriod;

          if (isMultiMonthPeriod) {
            // ========== ANALYSE PAR EMPLOYÉ (seulement si pas d'employé spécifique) ==========
            const employeeTotals: { [key: string]: { total: number; count: number } } = {};

            salaryTransactions.forEach(tx => {
              const descLower = (tx.description || '').toLowerCase();

              // Extraire le nom de l'employé
              employees.forEach(emp => {
                const nameParts = emp.name.toLowerCase().split(' ');
                if (nameParts.every(part => descLower.includes(part))) {
                  if (!employeeTotals[emp.name]) {
                    employeeTotals[emp.name] = { total: 0, count: 0 };
                  }
                  employeeTotals[emp.name].total += Math.abs(tx.amount);
                  employeeTotals[emp.name].count++;
                }
              });
            });

            // Trier les employés par total décroissant
            const sortedEmployees = Object.entries(employeeTotals)
              .map(([name, data]) => ({ name, ...data }))
              .sort((a, b) => b.total - a.total);

            // ========== ANALYSE PAR MOIS ==========
            const monthlyTotals: { [key: string]: { total: number; count: number; employees: Set<string> } } = {};

            salaryTransactions.forEach(tx => {
              const txDate = new Date(tx.date);
              const monthKey = `${txDate.getFullYear()}-${String(txDate.getMonth() + 1).padStart(2, '0')}`;

              if (!monthlyTotals[monthKey]) {
                monthlyTotals[monthKey] = { total: 0, count: 0, employees: new Set() };
              }

              monthlyTotals[monthKey].total += Math.abs(tx.amount);
              monthlyTotals[monthKey].count++;

              // Extraire le nom de l'employé
              const descLower = (tx.description || '').toLowerCase();
              employees.forEach(emp => {
                const nameParts = emp.name.toLowerCase().split(' ');
                if (nameParts.every(part => descLower.includes(part))) {
                  monthlyTotals[monthKey].employees.add(emp.name);
                }
              });
            });

            // Convertir en tableau et trier par total décroissant
            const sortedMonths = Object.entries(monthlyTotals)
              .map(([key, data]) => {
                const [year, month] = key.split('-');
                const date = new Date(parseInt(year), parseInt(month) - 1, 1);
                const monthName = date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
                return {
                  monthName,
                  ...data,
                  employeesList: Array.from(data.employees)
                };
              })
              .sort((a, b) => b.total - a.total);

            // ========== GÉNÉRATION DU TEXTE D'ANALYSE ==========
            if (sortedEmployees.length > 0 && showEmployeeAnalysis) {
              const topEmployee = sortedEmployees[0];
              monthlyAnalysis = `\n\n📊 ANALYSE DES SALAIRES\n\n`;
              monthlyAnalysis += `👤 Employé avec le plus de salaires perçus:\n`;
              monthlyAnalysis += `   🥇 ${topEmployee.name}: ${topEmployee.total.toFixed(2)}€ (${topEmployee.count} paiements)\n\n`;

              // Top des employés (détection automatique de "top X" ou "les X employés" dans la question)
              const currentQuestionLower = ctx.currentQuestion.toLowerCase();
              const topMatch = currentQuestionLower.match(/(?:top\s*(\d+)|les?\s+(\d+)\s+employ)/);
              const topN = topMatch ? Math.min(parseInt(topMatch[1] || topMatch[2]), sortedEmployees.length) : Math.min(5, sortedEmployees.length);

              if (sortedEmployees.length > 1) {
                monthlyAnalysis += `\n📊 Top ${topN} des employés:\n`;
                sortedEmployees.slice(0, topN).forEach((emp, i) => {
                  const icon = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
                  monthlyAnalysis += `${icon} ${emp.name}: ${emp.total.toFixed(2)}€\n`;
                });
              }
            }

            if (sortedMonths.length > 1) {
              const topMonth = sortedMonths[0];
              monthlyAnalysis += `\n\n📅 Mois avec le plus de salaires payés:\n`;
              monthlyAnalysis += `   🥇 ${topMonth.monthName}: ${topMonth.total.toFixed(2)}€ (${topMonth.count} paiements)\n`;
              monthlyAnalysis += `   Employés: ${topMonth.employeesList.length} personnes\n\n`;

              monthlyAnalysis += `📈 Répartition par mois:\n`;
              sortedMonths.forEach((m, i) => {
                const icon = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '  ';
                monthlyAnalysis += `${icon} ${m.monthName}: ${m.total.toFixed(2)}€ (${m.count} paiements)\n`;
              });
            }
          }

          // Formatter la liste complète des salaires pour Telegram
          const salaryList = salaryTransactions.map((tx, index) => {
            const num = String(index + 1).padStart(2, ' ');
            const date = new Date(tx.date).toLocaleDateString('fr-BE');
            const amount = Math.abs(tx.amount).toFixed(2);
            const desc = tx.description || 'Sans description';

            // Extraire le nom de l'employé de la description
            let employeeName = 'Inconnu';
            const descLower = desc.toLowerCase();
            employees.forEach(emp => {
              const nameParts = emp.name.toLowerCase().split(' ');
              if (nameParts.every(part => descLower.includes(part))) {
                employeeName = emp.name;
              }
            });

            return `${num}. ${date} - ${amount}€ - ${employeeName}`;
          }).join('\n');

          // Ajouter une note si de nouveaux employés ont été ajoutés
          const autoLearnNote = newEmployeesAdded.length > 0
            ? `\n\n🤖 ${newEmployeesAdded.length} nouvel(s) employé(s) ajouté(s) automatiquement:\n` +
              newEmployeesAdded.map(name => `   • ${name}`).join('\n')
            : '';

          // Générer le titre de période approprié
          let periodTitle: string;
          // 🔧 CORRECTION: Utiliser periodDescription si disponible (résultat du parsing IA)
          if (periodDescription) {
            periodTitle = periodDescription;
          } else if (args.month) {
            // Si un mois spécifique est demandé
            periodTitle = startDate.toLocaleDateString('fr-BE', { month: 'long', year: 'numeric' });
          } else if (args.start_month && args.end_month) {
            // Si période multi-mois (ex: "octobre à décembre 2025")
            const startMonthName = startDate.toLocaleDateString('fr-BE', { month: 'long' });
            const endMonthName = endDate.toLocaleDateString('fr-BE', { month: 'long' });
            const year = startDate.getFullYear();
            periodTitle = `${startMonthName} à ${endMonthName} ${year}`;
          } else if (args.year) {
            // Si une année spécifique est demandée
            periodTitle = `année ${args.year}`;
          } else {
            // Période personnalisée ou année en cours
            const isCurrentYear = startDate.getFullYear() === new Date().getFullYear() &&
                                 endDate.getFullYear() === new Date().getFullYear();
            if (isCurrentYear) {
              periodTitle = `année ${startDate.getFullYear()}`;
            } else {
              periodTitle = `${startDate.toLocaleDateString('fr-BE')} - ${endDate.toLocaleDateString('fr-BE')}`;
            }
          }

          // Décider si on inclut la liste détaillée
          // 1. Si l'utilisateur demande explicitement la liste (include_details: true OU mots-clés dans la question)
          // 2. Si recherche spécifique d'UN employé avec peu de transactions (≤ 10)
          // 3. SAUF si la question demande une analyse/statistique/résumé (dans ce cas, juste l'analyse suffit)
          // 4. SAUF si mois unique avec beaucoup de transactions (> 10) sans demande explicite

          // 🔍 DÉTECTION: Question demande une liste explicite
          const userAsksForList = questionLower.includes('liste') ||
                                 questionLower.includes('détail') ||
                                 questionLower.includes('à qui') ||
                                 questionLower.includes('qui a') ||
                                 questionLower.includes('noms') ||
                                 questionLower.includes('qui j\'ai payé') ||
                                 questionLower.includes('montre-moi les');

          // 🔍 DÉTECTION: Question demande une analyse/statistique/résumé (PAS de liste détaillée)
          const userAsksForSummaryOnly =
            questionLower.includes('top') ||  // "Top 10 employés"
            questionLower.includes('analyse') ||  // "Analyse des salaires"
            questionLower.includes('stat') ||  // "Statistiques"
            /mois.*plus.*payé|plus.*mois/.test(questionLower) ||  // "Mois où j'ai le plus payé"
            /combien.*payé|total.*salaire/.test(questionLower) ||  // "Combien j'ai payé", "Total des salaires"
            questionLower.includes('résumé') ||
            questionLower.includes('répartition') ||
            questionLower.includes('évolution') ||
            questionLower.includes('classement') ||
            questionLower.includes('meilleur') ||
            questionLower.includes('mieux') ||  // "les mieux payés", "le mieux payé"
            /\d+\s+employés/.test(questionLower) ||  // "10 employés", "les 5 employés"
            /\d+\s+derniers?\s+mois/.test(questionLower) ||  // "3 derniers mois", "6 derniers mois"
            questionLower.includes('le plus') && !questionLower.includes('liste');  // "Le plus payé" mais PAS "montre la liste"

          const userWantsDetails = args.include_details === true || userAsksForList;
          const isSpecificEmployeeSearch = args.employee_name && salaryTransactions.length <= 10;
          const isSingleMonthManyTransactions = args.month && salaryTransactions.length > 10;
          const isMultiMonthManyTransactions = (args.start_month && args.end_month) && salaryTransactions.length > 10;
          // 🔵 MASQUER la liste pour les requêtes annuelles avec beaucoup de transactions
          const isAnnualManyTransactions = args.period_text && /année\s+\d{4}/i.test(args.period_text) && salaryTransactions.length > 10;
          // Si l'utilisateur demande une analyse statistique, PAS de liste détaillée
          const includeDetailedList = !userAsksForSummaryOnly && !isMultiMonthManyTransactions && !isAnnualManyTransactions && (
            userWantsDetails ||  // Demande explicite prioritaire
            isSpecificEmployeeSearch ||  // Recherche spécifique
            !isSingleMonthManyTransactions  // Ou pas mois unique avec beaucoup
          );

          // 📊 DÉTECTION DES QUESTIONS SUR MIN/MAX
          let minMaxAnalysis = '';
          const userAsksForMin = questionLower.includes('plus bas') || questionLower.includes('minimum') || questionLower.includes('moins payé') || questionLower.includes('le moins');
          const userAsksForMax = questionLower.includes('plus haut') || questionLower.includes('plus élevé') || questionLower.includes('maximum') || questionLower.includes('le plus') || questionLower.includes('mieux payé');

          // 📊 DÉTECTION DES QUESTIONS DE COMPARAISON/CLASSEMENT
          const userAsksForRanking = questionLower.includes('se situe') || questionLower.includes('position') ||
                                      questionLower.includes('rang') || questionLower.includes('classement') ||
                                      questionLower.includes('par rapport') || questionLower.includes('comparé');

          if (salaryTransactions.length > 0 && (userAsksForMin || userAsksForMax)) {
            // Trouver min et max
            let minTx = salaryTransactions[0];
            let maxTx = salaryTransactions[0];

            salaryTransactions.forEach(tx => {
              const amount = Math.abs(tx.amount);
              if (amount < Math.abs(minTx.amount)) minTx = tx;
              if (amount > Math.abs(maxTx.amount)) maxTx = tx;
            });

            // Extraire les noms d'employés
            const employees = getAllEmployees();

            const extractEmployeeName = (description: string): string => {
              const descLower = description.toLowerCase();
              for (const emp of employees) {
                const nameParts = emp.name.toLowerCase().split(' ');
                if (nameParts.every(part => descLower.includes(part))) {
                  return emp.name;
                }
              }
              return 'Inconnu';
            };

            minMaxAnalysis = '\n\n📊 ANALYSE MIN/MAX\n\n';

            if (userAsksForMin) {
              const minEmployee = extractEmployeeName(minTx.description || '');
              const minDate = new Date(minTx.date).toLocaleDateString('fr-BE');
              minMaxAnalysis += `💵 SALAIRE LE PLUS BAS:\n`;
              minMaxAnalysis += `   ${Math.abs(minTx.amount).toFixed(2)}€ - ${minEmployee} (${minDate})\n`;
            }

            if (userAsksForMax) {
              const maxEmployee = extractEmployeeName(maxTx.description || '');
              const maxDate = new Date(maxTx.date).toLocaleDateString('fr-BE');
              if (userAsksForMin) minMaxAnalysis += '\n';
              minMaxAnalysis += `💰 SALAIRE LE PLUS HAUT:\n`;
              minMaxAnalysis += `   ${Math.abs(maxTx.amount).toFixed(2)}€ - ${maxEmployee} (${maxDate})\n`;
            }
          }

          // 📊 ANALYSE DE CLASSEMENT (si employé spécifique demandé)
          let rankingAnalysis = '';
          if (args.employee_name && userAsksForRanking && salaryTransactions.length > 0) {
            // Récupérer TOUS les salaires de TOUS les employés pour comparaison
            const allTransactions = await ctx.bankClient.getTransactionsByPeriod(startDate, endDate);
            const allEmployees = getAllEmployees();

            // Grouper par employé
            const employeeTotals: { [name: string]: number } = {};

            allTransactions.forEach(tx => {
              if (tx.type !== 'Debit' || !tx.description) return;
              const desc = tx.description.toLowerCase();
              if (!desc.includes('salaire')) return;

              // Trouver l'employé correspondant
              for (const emp of allEmployees) {
                const nameParts = emp.name.toLowerCase().split(' ');
                if (nameParts.every(part => desc.includes(part))) {
                  if (!employeeTotals[emp.name]) {
                    employeeTotals[emp.name] = 0;
                  }
                  employeeTotals[emp.name] += Math.abs(tx.amount);
                  break;
                }
              }
            });

            // Trier par total décroissant
            const ranking = Object.entries(employeeTotals)
              .map(([name, total]) => ({ name, total }))
              .sort((a, b) => b.total - a.total);

            // Trouver la position de l'employé demandé
            const targetEmployeeName = args.employee_name.toLowerCase();
            let employeeRank = -1;
            let employeeName = '';
            let employeeTotal = 0;

            for (let i = 0; i < ranking.length; i++) {
              const rankName = ranking[i].name.toLowerCase();
              if (rankName.includes(targetEmployeeName) || targetEmployeeName.includes(rankName.split(' ')[0])) {
                employeeRank = i + 1;
                employeeName = ranking[i].name;
                employeeTotal = ranking[i].total;
                break;
              }
            }

            if (employeeRank > 0 && ranking.length > 0) {
              // Calculer la médiane
              const sortedTotals = ranking.map(r => r.total).sort((a, b) => a - b);
              const medianIndex = Math.floor(sortedTotals.length / 2);
              const median = sortedTotals.length % 2 === 0
                ? (sortedTotals[medianIndex - 1] + sortedTotals[medianIndex]) / 2
                : sortedTotals[medianIndex];

              rankingAnalysis = '\n\n📊 CLASSEMENT PARMI LES EMPLOYÉS\n\n';
              rankingAnalysis += `${employeeName} se situe:\n`;
              rankingAnalysis += `   📍 Position: ${employeeRank}${employeeRank === 1 ? 'er' : 'ème'} sur ${ranking.length} employés\n`;
              rankingAnalysis += `   💰 Total perçu: ${employeeTotal.toFixed(2)}€\n\n`;

              rankingAnalysis += `Comparaison:\n`;
              rankingAnalysis += `   🥇 1er: ${ranking[0].name} (${ranking[0].total.toFixed(2)}€)\n`;
              rankingAnalysis += `   📊 Médiane: ${median.toFixed(2)}€\n`;

              const comparison = employeeTotal > median ? 'au-dessus' : employeeTotal < median ? 'en-dessous' : 'à';
              rankingAnalysis += `   📍 ${employeeName}: ${employeeTotal.toFixed(2)}€ (${comparison} de la médiane)\n`;

              if (ranking.length > 1) {
                rankingAnalysis += `   📉 Dernier: ${ranking[ranking.length - 1].name} (${ranking[ranking.length - 1].total.toFixed(2)}€)\n`;
              }
            }
          }

          let directResponse = `💰 Salaires de ${periodTitle}\n\n` +
            `Total: ${finalTotalPaid.toFixed(2)}€ (${salaryTransactions.length} paiements)` +
            monthlyAnalysis +
            minMaxAnalysis +
            rankingAnalysis;

          if (includeDetailedList) {
            directResponse += `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` + salaryList;
          }

          directResponse += autoLearnNote + suggestionMessage;

          result = {
            employee_name: args.employee_name || 'Tous les employés',
            period: `${startDate.toLocaleDateString('fr-BE')} - ${endDate.toLocaleDateString('fr-BE')}`,
            total_paid: finalTotalPaid,
            payment_count: salaryTransactions.length,
            payments: salaryTransactions.map(tx => ({
              date: tx.date,
              amount: Math.abs(tx.amount),
              description: tx.description,
            })),
            currency: 'EUR',
            direct_response: directResponse,
          };
          break;
        }

        case 'compare_employee_salaries': {
          // 🤖 Matching IA de tous les employés
          if (args.employee_names && args.employee_names.length > 0) {
            const matchedNames = await Promise.all(
              args.employee_names.map((name: string) => helpers.matchEmployeeWithAI(name))
            );
            args.employee_names = matchedNames;
          }

          // Validation: au moins 2 employés
          if (!args.employee_names || args.employee_names.length < 2) {
            result = {
              error: 'Au moins 2 employés sont requis pour une comparaison',
              direct_response: '❌ Veuillez spécifier au moins 2 employés à comparer.'
            };
            break;
          }

          // Déterminer la période
          let startDate: Date;
          let endDate: Date;

          // 🆕 Gérer period_text (parsing IA) - PRIORITÉ sur month/year
          if (args.period_text) {
            // 🔧 Fallback direct pour "année XXXX" au lieu de parsing IA
            const yearMatch = args.period_text.match(/année\s+(\d{4})/i);
            if (yearMatch) {
              const year = parseInt(yearMatch[1]);
              startDate = new Date(year, 0, 1); // 1er janvier
              endDate = new Date(year, 11, 31, 23, 59, 59); // 31 décembre
              console.log(`✅ Période directe pour comparaison (année ${year}): ${startDate.toISOString().split('T')[0]} à ${endDate.toISOString().split('T')[0]}`);
            } else {
              // Pour les autres cas, utiliser le parsing IA
              const period = await helpers.parsePeriodWithAI(args.period_text);
              if (period) {
                startDate = period.start;
                endDate = period.end;
                console.log(`✅ Période IA utilisée pour comparaison employés: ${period.description}`);
              } else {
                return JSON.stringify({ error: `Impossible de parser la période: ${args.period_text}` });
              }
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

              const targetYear = args.year ? parseInt(args.year) : new Date().getFullYear();
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
          const employees = getAllEmployees();

          // Fonction pour extraire les salaires d'un employé
          const getEmployeeSalaries = (employeeName: string) => {
            // Fuzzy matching
            let targetEmployee = employees.find(emp =>
              emp.name.toLowerCase().includes(employeeName.toLowerCase())
            );

            if (!targetEmployee) {
              const searchLower = employeeName.toLowerCase();
              const searchParts = searchLower.split(' ');

              const closestMatch = employees.reduce((best: { employee: { name: string }; distance: number } | null, emp) => {
                const empNameLower = emp.name.toLowerCase();
                const nameParts = empNameLower.split(' ');

                let distance = helpers.levenshteinDistance(searchLower, empNameLower);

                // 🔄 Tester aussi l'ordre inversé (ex: "Mokhlis Jamhoun" → "Jamhoun Mokhlis")
                if (searchParts.length === 2 && nameParts.length === 2) {
                  const reversedSearch = `${searchParts[1]} ${searchParts[0]}`;
                  const reversedDistance = helpers.levenshteinDistance(reversedSearch, empNameLower);
                  distance = Math.min(distance, reversedDistance);
                }

                if (!best || distance < best.distance) {
                  return { employee: emp, distance };
                }
                return best;
              }, null);

              if (closestMatch && closestMatch.distance <= 3) {
                targetEmployee = employees.find(emp => emp.name === closestMatch.employee.name);
              }
            }

            if (!targetEmployee) {
              return { name: employeeName, total: 0, count: 0, transactions: [], found: false, avg: 0, max: 0, maxDate: null };
            }

            const salaries = transactions.filter(tx => {
              if (tx.type !== 'Debit' || !tx.description) return false;
              const desc = tx.description.toLowerCase();
              if (!desc.includes('salaire') && !desc.includes('salair')) return false;

              const nameParts = targetEmployee.name.toLowerCase().split(' ');
              return nameParts.every(part => desc.includes(part));
            });

            const total = salaries.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
            const sortedSalaries = salaries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            const max = sortedSalaries.length > 0 ? sortedSalaries.reduce((m, tx) => Math.max(m, Math.abs(tx.amount)), 0) : 0;
            const maxTx = sortedSalaries.find(tx => Math.abs(tx.amount) === max);

            return {
              name: targetEmployee.name,
              total,
              count: salaries.length,
              avg: salaries.length > 0 ? total / salaries.length : 0,
              max,
              maxDate: maxTx ? new Date(maxTx.date) : null,
              transactions: sortedSalaries,
              found: true
            };
          };

          // Récupérer les données de tous les employés
          const employeesData = args.employee_names.map(getEmployeeSalaries);

          // Vérifier si tous ont été trouvés
          const notFound = employeesData.filter((e: EmployeeData) => !e.found);
          if (notFound.length > 0) {
            result = {
              error: `Employé(s) non trouvé(s): ${notFound.map((e: EmployeeData) => e.name).join(', ')}`,
              direct_response: `❌ Employé(s) non trouvé(s): ${notFound.map((e: EmployeeData) => e.name).join(', ')}`
            };
            break;
          }

          // Trier par total décroissant
          const sorted = employeesData.sort((a: { total: number }, b: { total: number }) => b.total - a.total);

          // Générer le titre de période
          let periodTitle: string;
          if (args.month) {
            periodTitle = startDate.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
          } else {
            periodTitle = `année ${startDate.getFullYear()}`;
          }

          // Générer la réponse comparative
          let directResponse = `📊 COMPARAISON DE SALAIRES\n\n`;
          directResponse += `${sorted.map((e: EmployeeData) => e.name).join(' vs ')} (${periodTitle})\n\n`;
          directResponse += `💰 Classement par total perçu:\n`;
          sorted.forEach((emp: EmployeeData, i: number) => {
            const icon = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
            directResponse += `   ${icon} ${emp.name}: ${emp.total.toFixed(2)}€ (${emp.count} paiements)\n`;
          });

          if (sorted.length === 2) {
            const diff = sorted[0].total - sorted[1].total;
            directResponse += `\n📈 Différence: ${Math.abs(diff).toFixed(2)}€ en faveur de ${sorted[0].name}\n`;
          }

          directResponse += `\n📊 Salaires moyens:\n`;
          sorted.forEach((emp: EmployeeData, i: number) => {
            const icon = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
            directResponse += `   ${icon} ${emp.name}: ${(emp.avg ?? emp.average ?? 0).toFixed(2)}€ par paiement\n`;
          });

          directResponse += `\n🏆 Plus hauts paiements individuels:\n`;
          sorted.forEach((emp: EmployeeData) => {
            directResponse += `   • ${emp.name}: ${(emp.max ?? 0).toFixed(2)}€${emp.maxDate ? ` (${new Date(emp.maxDate).toLocaleDateString('fr-BE')})` : ''}\n`;
          });

          result = {
            employees: sorted.map((e: any) => ({
              name: e.name,
              total: e.total,
              count: e.count,
              avg: e.avg,
              max: e.max
            })),
            winner: sorted[0].name,
            direct_response: directResponse
          };
          break;
        }

        case 'list_employees': {
          // Lister tous les employés depuis la base de données SQLite
          try {
            const employees = getAllEmployees();

            if (employees.length === 0) {
              result = {
                success: false,
                error: 'empty_list',
                message: '❌ Aucun employé n\'est configuré.',
              };
              break;
            }

            // Formatage simple et cohérent pour Telegram (sans backticks, sans astérisques)
            const employeesList = employees.map((emp, index) => {
              const num = String(index + 1).padStart(2, ' ');
              const name = emp.name;
              const position = emp.position || 'Employé';
              const chatId = emp.chat_id;

              // Format simple: "1. Nom - Poste (ID: xxx)" ou "1. Nom - Poste"
              if (chatId) {
                return `${num}. ${name} - ${position} (ID: ${chatId})`;
              } else {
                return `${num}. ${name} - ${position}`;
              }
            }).join('\n');

            const formattedMessage = `💼 Liste des employés (${employees.length})\n\n${employeesList}`;

            result = {
              success: true,
              direct_response: formattedMessage,
              message: formattedMessage,
            };
          } catch (error: any) {
            result = {
              success: false,
              error: 'database_error',
              message: `❌ Erreur lors de la récupération des employés: ${error.message}`,
            };
          }
          break;
        }

        case 'add_employee': {
          // Ajouter un nouvel employé
          const employeeName = args.name?.trim();
          const employeeChatId = args.chat_id?.trim() || null;
          const employeePosition = args.position?.trim() || 'Employé';

          // Validation
          if (!employeeName) {
            result = {
              success: false,
              error: 'missing_name',
              message: '❌ Veuillez spécifier un nom pour l\'employé.\n\nExemple: "Ajoute l\'employé Mohamed Ali"',
            };
            break;
          }

          if (employeeName.length < 3) {
            result = {
              success: false,
              error: 'invalid_name',
              message: '❌ Le nom de l\'employé doit contenir au moins 3 caractères.',
            };
            break;
          }

          try {
            // Vérifier si l'employé existe déjà (actif ou inactif)
            const existing = employeeExistsByName(employeeName);
            if (existing) {
              if (existing.is_active) {
                result = {
                  success: false,
                  error: 'already_exists',
                  message: `⚠️ Un employé nommé "${employeeName}" existe déjà dans la base de données (actif).`,
                };
              } else {
                result = {
                  success: false,
                  error: 'already_exists_inactive',
                  message: `⚠️ Un employé nommé "${employeeName}" existe déjà mais est désactivé. Veuillez d'abord le supprimer complètement ou utiliser un autre nom.`,
                };
              }
              break;
            }

            // Ajouter l'employé
            const employeeId = addEmployee(employeeName, employeeChatId, employeePosition);

            if (!employeeId) {
              result = {
                success: false,
                error: 'database_error',
                message: '❌ Erreur lors de l\'ajout de l\'employé dans la base de données.',
              };
              break;
            }

            // Récupérer tous les employés pour afficher la liste mise à jour
            const allEmployees = getAllEmployees();
            const employeesList = allEmployees.map((emp, index) => {
              const num = String(index + 1).padStart(2, ' ');
              const name = emp.name;
              const position = emp.position || 'Employé';
              const chatId = emp.chat_id;

              // Format simple: "1. Nom - Poste (ID: xxx)" ou "1. Nom - Poste"
              if (chatId) {
                return `${num}. ${name} - ${position} (ID: ${chatId})`;
              } else {
                return `${num}. ${name} - ${position}`;
              }
            }).join('\n');

            const chatInfo = employeeChatId ? `\n📱 Chat ID: ${employeeChatId}` : '';
            const formattedMessage = `✅ Employé ajouté avec succès !\n\n👤 Nom: ${employeeName}\n💼 Poste: ${employeePosition}${chatInfo}\n🆔 ID: ${employeeId}\n\n💼 Liste mise à jour des employés (${allEmployees.length})\n\n${employeesList}`;

            result = {
              success: true,
              employee_id: employeeId,
              name: employeeName,
              position: employeePosition,
              chat_id: employeeChatId,
              direct_response: formattedMessage,
              message: formattedMessage,
            };
          } catch (error: any) {
            result = {
              success: false,
              error: 'database_error',
              message: `❌ Erreur lors de l'ajout de l'employé: ${error.message}`,
            };
          }
          break;
        }

        case 'remove_employee': {
          // Supprimer un employé
          const employeeName = args.name?.trim();

          // Validation
          if (!employeeName) {
            result = {
              success: false,
              error: 'missing_name',
              message: '❌ Veuillez spécifier le nom de l\'employé à supprimer.\n\nExemple: "Supprime l\'employé Hassan Madidi"',
            };
            break;
          }

          try {
            // Chercher l'employé
            const employee = getEmployeeByName(employeeName);

            if (!employee) {
              result = {
                success: false,
                error: 'not_found',
                message: `⚠️ Aucun employé nommé "${employeeName}" n'a été trouvé.\n\nVeuillez vérifier l'orthographe exacte avec la commande "liste des employés".`,
              };
              break;
            }

            // Vérifier qu'il restera au moins un employé
            const allEmployees = getAllEmployees();
            if (allEmployees.length <= 1) {
              result = {
                success: false,
                error: 'cannot_remove_last',
                message: '❌ Impossible de supprimer le dernier employé. Il doit toujours y avoir au moins un employé.',
              };
              break;
            }

            // Supprimer l'employé (désactiver)
            const success = removeEmployee(employee.id);

            if (!success) {
              result = {
                success: false,
                error: 'database_error',
                message: '❌ Erreur lors de la suppression de l\'employé.',
              };
              break;
            }

            const remainingEmployees = getAllEmployees();

            // Formatage de la liste mise à jour
            const employeesList = remainingEmployees.map((emp, index) => {
              const num = String(index + 1).padStart(2);
              const name = emp.name;
              const position = emp.position || 'Employé';
              const chatId = emp.chat_id || 'N/A';

              return `\`${num}. ${name}\`\n   └─ ${position} ${chatId !== 'N/A' ? `│ ID: ${chatId}` : ''}`;
            }).join('\n\n');

            const formattedMessage = `✅ Employé supprimé avec succès !\n\n👤 Nom: ${employee.name}\n💼 Poste: ${employee.position || 'N/A'}\n\n💼 Liste mise à jour des employés (${remainingEmployees.length})\n\n${employeesList}`;

            result = {
              success: true,
              employee_id: employee.id,
              name: employee.name,
              direct_response: formattedMessage,
              message: formattedMessage,
            };
          } catch (error: any) {
            result = {
              success: false,
              error: 'database_error',
              message: `❌ Erreur lors de la suppression de l'employé: ${error.message}`,
            };
          }
          break;
        }


    default:
      return null;
  }

  return JSON.stringify(result, null, 2);
}
