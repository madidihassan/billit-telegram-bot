/**
 * Gestionnaire de conversations par utilisateur
 * Permet de maintenir un historique séparé pour chaque utilisateur
 *
 * @module ConversationManager
 * @category Services
 */

import * as fs from 'fs';
import * as path from 'path';
import Groq from 'groq-sdk';
import { config } from '../config';
import { logInfo, logDebug, logError } from '../utils/logger';

/**
 * Structure d'un message de conversation
 */
export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  metadata?: {
    intent?: string;         // Intention détectée (ex: "get_invoices")
    entities?: string[];     // Entités extraites (ex: ["décembre", "factures"])
    toolCalls?: string[];    // Outils appelés
    responseTime?: number;   // Temps de réponse en ms
  };
}

/**
 * Contexte de conversation d'un utilisateur
 */
export interface UserConversationContext {
  lastIntent?: string;
  lastEntities?: string[];
  lastResults?: any;
  lastToolCalls?: string[];
}

/**
 * État de conversation pour un utilisateur
 */
export interface UserConversationState {
  userId: string;
  messages: ConversationMessage[];
  context: UserConversationContext;
  summary?: string;
  lastActivity: number;
  createdAt: number;
}

/**
 * Gestionnaire de conversations multi-utilisateurs
 */
export class ConversationManager {
  private conversations: Map<string, UserConversationState> = new Map();
  private readonly MAX_MESSAGES = 20;
  private readonly SUMMARY_THRESHOLD = 15;
  private readonly EXPIRATION_HOURS = 24;
  private readonly STORAGE_DIR = path.join(process.cwd(), 'data', 'conversations');
  private groq: Groq | null = null;

  constructor() {
    this.ensureStorageDir();
    this.loadAllConversations();

    // Initialiser Groq pour les résumés (si disponible)
    if (config.groq?.apiKey) {
      this.groq = new Groq({ apiKey: config.groq.apiKey });
    }
  }

  /**
   * Obtenir l'historique de conversation d'un utilisateur
   */
  getHistory(userId: string): ConversationMessage[] {
    const state = this.getOrCreateState(userId);
    return state.messages;
  }

  /**
   * Obtenir le contexte actuel d'un utilisateur
   */
  getContext(userId: string): UserConversationContext {
    const state = this.getOrCreateState(userId);
    return state.context;
  }

  /**
   * Ajouter un message utilisateur
   */
  addUserMessage(userId: string, content: string, metadata?: ConversationMessage['metadata']): void {
    const state = this.getOrCreateState(userId);

    const message: ConversationMessage = {
      role: 'user',
      content,
      timestamp: Date.now(),
      metadata
    };

    state.messages.push(message);
    state.lastActivity = Date.now();

    // Mettre à jour le contexte
    if (metadata?.intent) {
      state.context.lastIntent = metadata.intent;
    }
    if (metadata?.entities) {
      state.context.lastEntities = metadata.entities;
    }

    this.trimHistory(state);
    this.saveState(userId);

    logDebug(`Message utilisateur ajouté pour ${userId}`, 'conversation-manager');
  }

  /**
   * Ajouter une réponse de l'assistant
   */
  addAssistantMessage(
    userId: string,
    content: string,
    metadata?: ConversationMessage['metadata']
  ): void {
    const state = this.getOrCreateState(userId);

    const message: ConversationMessage = {
      role: 'assistant',
      content,
      timestamp: Date.now(),
      metadata
    };

    state.messages.push(message);
    state.lastActivity = Date.now();

    // Mettre à jour le contexte avec les résultats
    if (metadata?.toolCalls) {
      state.context.lastToolCalls = metadata.toolCalls;
    }

    this.trimHistory(state);

    // Générer un résumé si nécessaire
    if (state.messages.length >= this.SUMMARY_THRESHOLD && !state.summary) {
      this.generateSummary(userId).catch(err => {
        logError(`Erreur génération résumé: ${err.message}`, 'conversation-manager');
      });
    }

    this.saveState(userId);

    logDebug(`Réponse assistant ajoutée pour ${userId}`, 'conversation-manager');
  }

  /**
   * Obtenir l'historique formaté pour l'IA (avec résumé si disponible)
   */
  getFormattedHistory(userId: string): Array<{ role: string; content: string }> {
    const state = this.getOrCreateState(userId);

    // Si on a un résumé, on l'inclut au début
    if (state.summary) {
      return [
        { role: 'system', content: `Résumé des échanges précédents: ${state.summary}` },
        ...state.messages.slice(-10).map(m => ({
          role: m.role,
          content: m.content
        }))
      ];
    }

    // Sinon, retourner les derniers messages
    return state.messages.slice(-10).map(m => ({
      role: m.role,
      content: m.content
    }));
  }

  /**
   * Mettre à jour les résultats de la dernière requête (pour contexte)
   */
  updateLastResults(userId: string, results: any): void {
    const state = this.getOrCreateState(userId);
    state.context.lastResults = results;
    this.saveState(userId);
  }

  /**
   * Effacer l'historique d'un utilisateur
   */
  clearHistory(userId: string): void {
    this.conversations.delete(userId);
    const filePath = this.getStateFilePath(userId);

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      logInfo(`Historique effacé pour ${userId}`, 'conversation-manager');
    }
  }

  /**
   * Nettoyer les conversations expirées
   */
  cleanup(): void {
    const now = Date.now();
    const expirationMs = this.EXPIRATION_HOURS * 60 * 60 * 1000;
    let cleaned = 0;

    for (const [userId, state] of this.conversations.entries()) {
      if (now - state.lastActivity > expirationMs) {
        this.clearHistory(userId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logInfo(`${cleaned} conversation(s) expirée(s) nettoyée(s)`, 'conversation-manager');
    }
  }

  /**
   * Obtenir ou créer l'état de conversation d'un utilisateur
   */
  private getOrCreateState(userId: string): UserConversationState {
    if (!this.conversations.has(userId)) {
      const state: UserConversationState = {
        userId,
        messages: [],
        context: {},
        lastActivity: Date.now(),
        createdAt: Date.now()
      };
      this.conversations.set(userId, state);
      logInfo(`Nouvelle conversation créée pour ${userId}`, 'conversation-manager');
    }

    return this.conversations.get(userId)!;
  }

  /**
   * Limiter la taille de l'historique
   */
  private trimHistory(state: UserConversationState): void {
    if (state.messages.length > this.MAX_MESSAGES) {
      state.messages = state.messages.slice(-this.MAX_MESSAGES);
      logDebug(`Historique tronqué à ${this.MAX_MESSAGES} messages`, 'conversation-manager');
    }
  }

  /**
   * Générer un résumé automatique de la conversation
   */
  private async generateSummary(userId: string): Promise<void> {
    if (!this.groq) {
      logDebug('Groq non configuré, résumé désactivé', 'conversation-manager');
      return;
    }

    const state = this.getOrCreateState(userId);

    // Prendre tous les messages sauf les 5 derniers (qu'on gardera en détail)
    const messagesToSummarize = state.messages.slice(0, -5);
    if (messagesToSummarize.length < 5) return; // Pas assez de messages

    const conversationText = messagesToSummarize
      .map(m => `${m.role === 'user' ? 'User' : 'Bot'}: ${m.content}`)
      .join('\n');

    try {
      const response = await this.groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [{
          role: 'user',
          content: `Résume cette conversation en 2-3 phrases clés, en gardant les informations importantes (dates, montants, noms):\n\n${conversationText}\n\nRésumé concis:`
        }],
        max_tokens: 150,
        temperature: 0.3
      });

      const summary = response.choices[0]?.message?.content?.trim();
      if (summary) {
        state.summary = summary;
        this.saveState(userId);
        logInfo(`Résumé généré pour ${userId}: ${summary.substring(0, 50)}...`, 'conversation-manager');
      }
    } catch (error: any) {
      logError(`Erreur génération résumé: ${error.message}`, 'conversation-manager');
    }
  }

  /**
   * Sauvegarder l'état d'un utilisateur
   */
  private saveState(userId: string): void {
    const state = this.conversations.get(userId);
    if (!state) return;

    const filePath = this.getStateFilePath(userId);

    try {
      fs.writeFileSync(
        filePath,
        JSON.stringify(state, null, 2),
        'utf-8'
      );
    } catch (error: any) {
      logError(`Erreur sauvegarde état ${userId}: ${error.message}`, 'conversation-manager');
    }
  }

  /**
   * Charger l'état d'un utilisateur depuis le disque
   */
  private loadState(userId: string): UserConversationState | null {
    const filePath = this.getStateFilePath(userId);

    if (!fs.existsSync(filePath)) {
      return null;
    }

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const state: UserConversationState = JSON.parse(content);

      // Vérifier l'expiration
      const now = Date.now();
      const expirationMs = this.EXPIRATION_HOURS * 60 * 60 * 1000;

      if (now - state.lastActivity > expirationMs) {
        logDebug(`État expiré pour ${userId}, ignoré`, 'conversation-manager');
        return null;
      }

      return state;
    } catch (error: any) {
      logError(`Erreur chargement état ${userId}: ${error.message}`, 'conversation-manager');
      return null;
    }
  }

  /**
   * Charger toutes les conversations depuis le disque
   */
  private loadAllConversations(): void {
    if (!fs.existsSync(this.STORAGE_DIR)) {
      return;
    }

    const files = fs.readdirSync(this.STORAGE_DIR);
    let loaded = 0;

    for (const file of files) {
      if (file.startsWith('user-') && file.endsWith('.json')) {
        const userId = file.replace('user-', '').replace('.json', '');
        const state = this.loadState(userId);

        if (state) {
          this.conversations.set(userId, state);
          loaded++;
        }
      }
    }

    if (loaded > 0) {
      logInfo(`${loaded} conversation(s) chargée(s) depuis le disque`, 'conversation-manager');
    }
  }

  /**
   * S'assurer que le répertoire de stockage existe
   */
  private ensureStorageDir(): void {
    if (!fs.existsSync(this.STORAGE_DIR)) {
      fs.mkdirSync(this.STORAGE_DIR, { recursive: true });
    }
  }

  /**
   * Obtenir le chemin du fichier d'état pour un utilisateur
   */
  private getStateFilePath(userId: string): string {
    return path.join(this.STORAGE_DIR, `user-${userId}.json`);
  }

  /**
   * Obtenir les statistiques de toutes les conversations
   */
  getStats(): {
    totalUsers: number;
    totalMessages: number;
    activeConversations: number;
  } {
    let totalMessages = 0;
    const now = Date.now();
    const activeThreshold = 60 * 60 * 1000; // 1 heure
    let activeConversations = 0;

    for (const state of this.conversations.values()) {
      totalMessages += state.messages.length;
      if (now - state.lastActivity < activeThreshold) {
        activeConversations++;
      }
    }

    return {
      totalUsers: this.conversations.size,
      totalMessages,
      activeConversations
    };
  }
}
