/**
 * Types pour le service AI Agent V2
 * Remplace les 'any' par des types stricts
 */

import TelegramBot from 'node-telegram-bot-api';
import Groq from 'groq-sdk';
import { BankTransaction } from '../bank-client';
import { BillitInvoice } from '../types';

// ──────────────────────────────────────────────────────
// Types pour les outils IA (function calling)
// ──────────────────────────────────────────────────────

/** Arguments passés aux fonctions par l'IA */
export type ToolArgs = Record<string, string | number | boolean | string[] | undefined>;

/** Résultat d'exécution d'un outil (retourné en JSON) */
export type ToolResult = Record<string, unknown>;

/** Type pour les outils de l'IA (Groq/OpenAI compatible) */
export type AITool = Groq.Chat.Completions.ChatCompletionTool;

// ──────────────────────────────────────────────────────
// Types pour les messages de conversation
// ──────────────────────────────────────────────────────

/** Rôles possibles dans la conversation */
export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

/** Message dans la conversation IA */
export interface AIMessage {
  role: MessageRole;
  content: string | null;
  tool_calls?: AIToolCall[];
  tool_call_id?: string;
}

/** Appel d'outil par l'IA */
export interface AIToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

// ──────────────────────────────────────────────────────
// Types pour les données métier traitées par l'agent
// ──────────────────────────────────────────────────────

/** Données d'employé pour comparaison de salaires */
export interface EmployeeData {
  name: string;
  found: boolean;
  total: number;
  count: number;
  transactions?: BankTransaction[];
  average?: number;
  avg?: number;
  min?: number;
  max?: number;
  maxDate?: string;
}

/** Données de fournisseur pour comparaison de dépenses */
export interface SupplierData {
  name: string;
  found: boolean;
  total: number;
  count: number;
  transactions?: BankTransaction[];
  average?: number;
  avg?: number;
  min?: number;
  max?: number;
  maxDate?: string;
  debits?: number;
  credits?: number;
}

/** Section d'affichage pour les analyses de fournisseurs */
export interface DisplaySection {
  title?: string;
  type?: string;
  icon?: string;
  label?: string;
  data: BankTransaction[];
  total?: number;
  count?: number;
}

/** Résultat d'analyse de catégorie de dépenses */
export interface CategoryAnalysis {
  category: string;
  total: number;
  count: number;
  percentage?: number;
  suppliers?: Array<{ name: string; total: number; count: number }>;
}

/** Bouton inline pour Telegram */
export interface InlineButton {
  text: string;
  callback_data: string;
}

/** Match d'employé pour fuzzy matching */
export interface EmployeeMatch {
  name: string;
  distance: number;
  score: number;
}

// ──────────────────────────────────────────────────────
// Types pour le bot Telegram dans le contexte AI
// ──────────────────────────────────────────────────────

/** Instance du bot Telegram (sous-ensemble utilisé par l'agent IA) */
export type TelegramBotInstance = TelegramBot;
