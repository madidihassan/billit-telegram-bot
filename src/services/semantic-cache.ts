/**
 * Cache sémantique pour réponses rapides (<1s)
 * Détecte les questions équivalentes et retourne le cache
 *
 * @module SemanticCache
 * @category Services
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { logInfo, logDebug, logWarn } from '../utils/logger';

/**
 * Entrée de cache
 */
export interface CacheEntry {
  questionHash: string;       // Hash de la question normalisée
  normalizedQuestion: string;  // Question normalisée
  originalQuestion: string;    // Question originale
  response: string;            // Réponse complète
  metadata: {
    userId: string;
    toolsUsed?: string[];
    dataSnapshot?: any;        // Snapshot des données (pour invalidation)
    responseTime?: number;     // Temps de réponse original (ms)
  };
  createdAt: number;
  expiresAt: number;
  hits: number;                // Nombre d'utilisations
  lastAccessedAt: number;
}

/**
 * Métriques de performance du cache
 */
export interface CacheMetrics {
  totalRequests: number;
  cacheHits: number;
  cacheMisses: number;
  hitRate: number;             // cacheHits / totalRequests
  avgCachedResponseTime: number; // Temps moyen réponse depuis cache (ms)
  totalTimeSaved: number;      // Temps total économisé (ms)
  cacheSize: number;           // Nombre d'entrées dans le cache
}

/**
 * Cache sémantique intelligent
 */
export class SemanticCache {
  private cache: Map<string, CacheEntry> = new Map();
  private readonly TTL = 5 * 60 * 1000; // 5 minutes par défaut
  private readonly CACHE_FILE = path.join(process.cwd(), 'data', 'cache', 'semantic-cache.json');
  private readonly MAX_CACHE_SIZE = 100;

  // Métriques
  private totalRequests = 0;
  private cacheHits = 0;
  private cacheMisses = 0;
  private totalTimeSaved = 0;

  constructor(ttl?: number) {
    if (ttl) {
      this.TTL = ttl;
    }

    this.ensureCacheDir();
    this.loadCache();

    // Nettoyage automatique toutes les 10 minutes
    setInterval(() => this.cleanup(), 10 * 60 * 1000);

    logInfo(`Cache sémantique initialisé (TTL: ${this.TTL / 1000}s, Max: ${this.MAX_CACHE_SIZE} entrées)`, 'semantic-cache');
  }

  /**
   * Tenter de récupérer une réponse depuis le cache
   */
  async get(question: string, userId: string): Promise<string | null> {
    this.totalRequests++;

    const normalized = this.normalizeQuestion(question);
    const hash = this.hashQuestion(normalized, userId);

    const entry = this.cache.get(hash);

    // Pas d'entrée dans le cache
    if (!entry) {
      this.cacheMisses++;
      logDebug(`Cache miss: "${normalized}"`, 'semantic-cache');
      return null;
    }

    // Vérifier expiration
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(hash);
      this.cacheMisses++;
      logDebug(`Cache expiré: "${normalized}"`, 'semantic-cache');
      return null;
    }

    // Cache hit!
    entry.hits++;
    entry.lastAccessedAt = Date.now();
    this.cacheHits++;

    // Calculer le temps économisé (estimé)
    const timeSaved = entry.metadata.responseTime || 30000; // Default 30s
    this.totalTimeSaved += timeSaved;

    logInfo(
      `⚡ Cache HIT: "${normalized}" (${entry.hits} fois utilisé, ~${(timeSaved / 1000).toFixed(1)}s économisés)`,
      'semantic-cache'
    );

    this.saveCache(); // Sauvegarder les stats mises à jour

    return entry.response;
  }

  /**
   * Mettre en cache une question et sa réponse
   */
  set(
    question: string,
    response: string,
    userId: string,
    metadata?: {
      toolsUsed?: string[];
      dataSnapshot?: any;
      responseTime?: number;
    }
  ): void {
    const normalized = this.normalizeQuestion(question);
    const hash = this.hashQuestion(normalized, userId);

    // Vérifier la taille du cache
    if (this.cache.size >= this.MAX_CACHE_SIZE && !this.cache.has(hash)) {
      this.evictOldest();
    }

    const entry: CacheEntry = {
      questionHash: hash,
      normalizedQuestion: normalized,
      originalQuestion: question,
      response,
      metadata: {
        userId,
        ...metadata
      },
      createdAt: Date.now(),
      expiresAt: Date.now() + this.TTL,
      hits: 0,
      lastAccessedAt: Date.now()
    };

    this.cache.set(hash, entry);

    logInfo(`💾 Mise en cache: "${normalized}" (expire dans ${this.TTL / 1000}s)`, 'semantic-cache');

    this.saveCache();
  }

  /**
   * Invalider le cache pour un utilisateur ou une question spécifique
   */
  invalidate(question?: string, userId?: string): number {
    let invalidated = 0;

    if (question && userId) {
      // Invalider une question spécifique pour un utilisateur
      const normalized = this.normalizeQuestion(question);
      const hash = this.hashQuestion(normalized, userId);
      if (this.cache.delete(hash)) {
        invalidated = 1;
        logInfo(`Cache invalidé pour: "${normalized}" (userId: ${userId})`, 'semantic-cache');
      }
    } else if (userId) {
      // Invalider toutes les entrées d'un utilisateur
      for (const [hash, entry] of this.cache.entries()) {
        if (entry.metadata.userId === userId) {
          this.cache.delete(hash);
          invalidated++;
        }
      }
      logInfo(`${invalidated} entrée(s) invalidée(s) pour userId: ${userId}`, 'semantic-cache');
    } else {
      // Invalider tout le cache
      invalidated = this.cache.size;
      this.cache.clear();
      logInfo('Cache complètement invalidé', 'semantic-cache');
    }

    if (invalidated > 0) {
      this.saveCache();
    }

    return invalidated;
  }

  /**
   * Nettoyer les entrées expirées
   */
  cleanup(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [hash, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(hash);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logInfo(`${cleaned} entrée(s) de cache expirée(s) nettoyée(s)`, 'semantic-cache');
      this.saveCache();
    }
  }

  /**
   * Obtenir les métriques de performance du cache
   */
  getMetrics(): CacheMetrics {
    const hitRate = this.totalRequests > 0
      ? (this.cacheHits / this.totalRequests) * 100
      : 0;

    const avgCachedResponseTime = this.cacheHits > 0
      ? this.totalTimeSaved / this.cacheHits
      : 0;

    return {
      totalRequests: this.totalRequests,
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
      hitRate: Math.round(hitRate * 10) / 10, // 1 décimale
      avgCachedResponseTime: Math.round(avgCachedResponseTime),
      totalTimeSaved: this.totalTimeSaved,
      cacheSize: this.cache.size
    };
  }

  /**
   * Réinitialiser les métriques
   */
  resetMetrics(): void {
    this.totalRequests = 0;
    this.cacheHits = 0;
    this.cacheMisses = 0;
    this.totalTimeSaved = 0;
    logInfo('Métriques du cache réinitialisées', 'semantic-cache');
  }

  /**
   * Normaliser une question pour détecter les synonymes
   */
  private normalizeQuestion(question: string): string {
    return question
      .toLowerCase()
      .trim()
      // Normaliser les synonymes courants
      .replace(/non payées?/g, 'impayées')
      .replace(/pas (?:encore )?payées?/g, 'impayées')
      .replace(/en retard/g, 'overdue')
      .replace(/montrer|afficher|voir/g, 'liste')
      .replace(/donne(?:-moi)?|montre(?:-moi)?/g, 'liste')
      // Normaliser les mois
      .replace(/janvier/g, 'jan')
      .replace(/février|fevrier/g, 'fev')
      .replace(/décembre|decembre/g, 'dec')
      // Retirer les mots de liaison inutiles
      .replace(/\b(moi|les?|des?|du|de|la|s'il (?:vous|te) plaît|merci|svp)\b/g, '')
      // Retirer les espaces multiples
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Générer un hash pour une question (incluant userId pour isolation)
   */
  private hashQuestion(normalized: string, userId: string): string {
    const combined = `${userId}:${normalized}`;
    return crypto
      .createHash('sha256')
      .update(combined)
      .digest('hex')
      .substring(0, 16); // Prendre seulement 16 chars
  }

  /**
   * Évincer l'entrée la plus ancienne (LRU - Least Recently Used)
   */
  private evictOldest(): void {
    let oldestHash: string | null = null;
    let oldestTime = Date.now();

    for (const [hash, entry] of this.cache.entries()) {
      if (entry.lastAccessedAt < oldestTime) {
        oldestTime = entry.lastAccessedAt;
        oldestHash = hash;
      }
    }

    if (oldestHash) {
      const evicted = this.cache.get(oldestHash);
      this.cache.delete(oldestHash);
      logWarn(
        `Cache plein: éviction de "${evicted?.normalizedQuestion}" (dernier accès: ${new Date(oldestTime).toLocaleString()})`,
        'semantic-cache'
      );
    }
  }

  /**
   * Sauvegarder le cache sur disque
   */
  private saveCache(): void {
    try {
      const data = {
        entries: Array.from(this.cache.entries()),
        metrics: {
          totalRequests: this.totalRequests,
          cacheHits: this.cacheHits,
          cacheMisses: this.cacheMisses,
          totalTimeSaved: this.totalTimeSaved
        },
        savedAt: Date.now()
      };

      fs.writeFileSync(
        this.CACHE_FILE,
        JSON.stringify(data, null, 2),
        'utf-8'
      );
    } catch (error: any) {
      logWarn(`Erreur sauvegarde cache: ${error.message}`, 'semantic-cache');
    }
  }

  /**
   * Charger le cache depuis le disque
   */
  private loadCache(): void {
    if (!fs.existsSync(this.CACHE_FILE)) {
      logDebug('Nouveau cache sémantique (aucune sauvegarde existante)', 'semantic-cache');
      return;
    }

    try {
      const content = fs.readFileSync(this.CACHE_FILE, 'utf-8');
      const data = JSON.parse(content);

      // Charger les entrées
      if (data.entries && Array.isArray(data.entries)) {
        this.cache = new Map(data.entries);

        // Supprimer les entrées expirées lors du chargement
        const now = Date.now();
        let expired = 0;

        for (const [hash, entry] of this.cache.entries()) {
          if (now > entry.expiresAt) {
            this.cache.delete(hash);
            expired++;
          }
        }

        logInfo(
          `Cache chargé: ${this.cache.size} entrée(s) (${expired} expirée(s) ignorée(s))`,
          'semantic-cache'
        );
      }

      // Charger les métriques
      if (data.metrics) {
        this.totalRequests = data.metrics.totalRequests || 0;
        this.cacheHits = data.metrics.cacheHits || 0;
        this.cacheMisses = data.metrics.cacheMisses || 0;
        this.totalTimeSaved = data.metrics.totalTimeSaved || 0;
      }

    } catch (error: any) {
      logWarn(`Erreur chargement cache: ${error.message}`, 'semantic-cache');
    }
  }

  /**
   * S'assurer que le répertoire de cache existe
   */
  private ensureCacheDir(): void {
    const dir = path.dirname(this.CACHE_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true});
    }
  }

  /**
   * Obtenir des statistiques détaillées sur le cache
   */
  getDetailedStats(): {
    entries: Array<{
      question: string;
      hits: number;
      age: string;
      expiresIn: string;
    }>;
    topQuestions: Array<{
      question: string;
      hits: number;
    }>;
  } {
    const now = Date.now();
    const entries = Array.from(this.cache.values())
      .map(entry => ({
        question: entry.normalizedQuestion,
        hits: entry.hits,
        age: this.formatDuration(now - entry.createdAt),
        expiresIn: this.formatDuration(entry.expiresAt - now)
      }))
      .sort((a, b) => b.hits - a.hits);

    const topQuestions = entries.slice(0, 10);

    return {
      entries,
      topQuestions
    };
  }

  /**
   * Formater une durée en texte lisible
   */
  private formatDuration(ms: number): string {
    if (ms < 0) return 'expiré';
    if (ms < 60000) return `${Math.round(ms / 1000)}s`;
    if (ms < 3600000) return `${Math.round(ms / 60000)}min`;
    return `${Math.round(ms / 3600000)}h`;
  }
}
