/**
 * Types partagés par tous les modules d'exécution (executors)
 */

import { BillitClient } from '../../billit-client';
import { BankClient, BankTransaction } from '../../bank-client';
import { AlertService } from '../../alert-service';
import { CommandHandler } from '../../command-handler';
import type { TelegramBotInstance } from '../../types/ai-agent';

/**
 * Contexte passé à tous les executors.
 * Remplace les references `this.*` du monolithe.
 */
export interface ExecutorContext {
  billitClient: BillitClient;
  bankClient: BankClient;
  commandHandler: CommandHandler;
  chatId: string | null;
  telegramBot: TelegramBotInstance | null;
  currentQuestion: string;
  alertService: AlertService;
  onBeforeRestart?: () => void;
}

/**
 * Fonctions utilitaires partagées (extraites de la classe AIAgentServiceV2)
 */
export interface ExecutorHelpers {
  matchSupplierWithAI: (searchTerm: string) => Promise<string>;
  matchEmployeeWithAI: (searchTerm: string) => Promise<string>;
  parsePeriodWithAI: (text: string) => Promise<{ start: Date; end: Date; description: string } | null>;
  findClosestEmployee: (searchName: string) => Promise<{ employee: { name: string }; distance: number } | null>;
  findSimilarEmployees: (searchName: string, maxResults?: number) => Promise<Array<{ employee: { name: string }; distance: number }>>;
  levenshteinDistance: (s1: string, s2: string) => number;
  formatAmount: (amount: number) => string;
  getTopSources: (transactions: BankTransaction[]) => string[];
  getTopExpenses: (transactions: BankTransaction[]) => Array<{ name: string; amount: number }>;
}

/**
 * Signature commune de tous les executors.
 * Retourne null si le functionName n'est pas géré par cet executor.
 */
export type ExecutorFunction = (
  functionName: string,
  args: Record<string, any>,
  ctx: ExecutorContext,
  helpers: ExecutorHelpers
) => Promise<string | null>;
