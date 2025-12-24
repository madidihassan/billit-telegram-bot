/**
 * Rate Limiter - Limite le nombre de requêtes par utilisateur
 * Utilise l'algorithme Token Bucket pour un contrôle flexible
 */

export interface RateLimitConfig {
  /** Nombre maximum de requêtes autorisées dans la fenêtre */
  maxRequests: number;
  /** Durée de la fenêtre en millisecondes */
  windowMs: number;
  /** Message d'erreur personnalisé */
  message?: string;
}

export interface RateLimitResult {
  /** Requête autorisée */
  allowed: boolean;
  /** Nombre de requêtes restantes */
  remaining: number;
  /** Temps d'attente avant réinitialisation (ms) */
  resetIn: number;
  /** Message d'erreur si bloqué */
  message?: string;
}

interface UserBucket {
  /** Nombre de tokens restants */
  tokens: number;
  /** Timestamp de la dernière requête */
  lastRefill: number;
}

/**
 * Rate Limiter avec algorithme Token Bucket
 */
export class RateLimiter {
  private buckets: Map<string, UserBucket> = new Map();
  private config: Required<RateLimitConfig>;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(config: RateLimitConfig) {
    this.config = {
      ...config,
      message: config.message ||
        `Trop de requêtes. Limite: ${config.maxRequests} requêtes par ${this.formatDuration(config.windowMs)}. Veuillez patienter.`,
    };

    // Nettoyer les buckets expirés toutes les 5 minutes
    this.startCleanup();
  }

  /**
   * Vérifie si une requête est autorisée pour un utilisateur
   */
  public checkLimit(userId: string | number): RateLimitResult {
    const userIdStr = String(userId);
    const now = Date.now();

    // Récupérer ou créer le bucket de l'utilisateur
    let bucket = this.buckets.get(userIdStr);

    if (!bucket) {
      bucket = {
        tokens: this.config.maxRequests,
        lastRefill: now,
      };
      this.buckets.set(userIdStr, bucket);
    }

    // Calculer le nombre de tokens à ajouter depuis la dernière requête
    const timePassed = now - bucket.lastRefill;
    const refillRate = this.config.maxRequests / this.config.windowMs;
    const tokensToAdd = Math.floor(timePassed * refillRate);

    // Recharger les tokens (max = maxRequests)
    if (tokensToAdd > 0) {
      bucket.tokens = Math.min(
        this.config.maxRequests,
        bucket.tokens + tokensToAdd
      );
      bucket.lastRefill = now;
    }

    // Vérifier si l'utilisateur a des tokens disponibles
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;

      return {
        allowed: true,
        remaining: Math.floor(bucket.tokens),
        resetIn: this.getResetTime(bucket),
      };
    }

    // Requête refusée
    return {
      allowed: false,
      remaining: 0,
      resetIn: this.getResetTime(bucket),
      message: this.config.message,
    };
  }

  /**
   * Consomme plusieurs tokens d'un coup (pour opérations coûteuses)
   */
  public consume(userId: string | number, tokensCount: number = 1): RateLimitResult {
    if (tokensCount <= 0) {
      throw new Error('tokensCount must be positive');
    }

    const result = this.checkLimit(userId);

    if (result.allowed && tokensCount > 1) {
      // Consommer les tokens supplémentaires
      const userIdStr = String(userId);
      const bucket = this.buckets.get(userIdStr)!;
      bucket.tokens = Math.max(0, bucket.tokens - (tokensCount - 1));

      return {
        ...result,
        remaining: Math.floor(bucket.tokens),
      };
    }

    return result;
  }

  /**
   * Réinitialise le rate limit pour un utilisateur
   */
  public reset(userId: string | number): void {
    this.buckets.delete(String(userId));
  }

  /**
   * Réinitialise tous les rate limits
   */
  public resetAll(): void {
    this.buckets.clear();
  }

  /**
   * Obtient les statistiques pour un utilisateur
   */
  public getStats(userId: string | number): {
    remaining: number;
    resetIn: number;
    totalRequests: number;
  } | null {
    const bucket = this.buckets.get(String(userId));

    if (!bucket) {
      return null;
    }

    return {
      remaining: Math.floor(bucket.tokens),
      resetIn: this.getResetTime(bucket),
      totalRequests: this.config.maxRequests,
    };
  }

  /**
   * Arrête le nettoyage automatique
   */
  public stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Calcule le temps avant réinitialisation complète
   */
  private getResetTime(bucket: UserBucket): number {
    const now = Date.now();
    const timeSinceLastRefill = now - bucket.lastRefill;
    const timeToFullRefill = this.config.windowMs - timeSinceLastRefill;

    return Math.max(0, timeToFullRefill);
  }

  /**
   * Démarre le nettoyage automatique des buckets expirés
   */
  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      const expiryTime = this.config.windowMs * 2; // Garder 2x la fenêtre

      for (const [userId, bucket] of this.buckets.entries()) {
        if (now - bucket.lastRefill > expiryTime) {
          this.buckets.delete(userId);
        }
      }
    }, 5 * 60 * 1000); // Toutes les 5 minutes
  }

  /**
   * Formate une durée en texte lisible
   */
  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h`;
    }
    if (minutes > 0) {
      return `${minutes}min`;
    }
    return `${seconds}s`;
  }
}

/**
 * Factory pour créer des rate limiters avec configurations prédéfinies
 */
export class RateLimiterFactory {
  /**
   * Rate limiter pour usage général (30 requêtes par minute)
   */
  static createDefault(): RateLimiter {
    return new RateLimiter({
      maxRequests: 30,
      windowMs: 60 * 1000, // 1 minute
      message: 'Trop de requêtes. Veuillez patienter quelques secondes.',
    });
  }

  /**
   * Rate limiter strict pour API externes (10 requêtes par minute)
   */
  static createStrict(): RateLimiter {
    return new RateLimiter({
      maxRequests: 10,
      windowMs: 60 * 1000, // 1 minute
      message: 'Limite de requêtes atteinte. Veuillez patienter 1 minute.',
    });
  }

  /**
   * Rate limiter pour IA (5 requêtes par minute, coûteuses)
   */
  static createForAI(): RateLimiter {
    return new RateLimiter({
      maxRequests: 5,
      windowMs: 60 * 1000, // 1 minute
      message: 'Limite de requêtes IA atteinte. Veuillez patienter avant de poser une nouvelle question.',
    });
  }

  /**
   * Rate limiter pour reconnaissance vocale (10 par minute)
   */
  static createForVoice(): RateLimiter {
    return new RateLimiter({
      maxRequests: 10,
      windowMs: 60 * 1000, // 1 minute
      message: 'Trop de messages vocaux. Veuillez patienter quelques instants.',
    });
  }

  /**
   * Rate limiter laxiste pour développement (100 par minute)
   */
  static createDevelopment(): RateLimiter {
    return new RateLimiter({
      maxRequests: 100,
      windowMs: 60 * 1000, // 1 minute
    });
  }
}

/**
 * Gestionnaire global de rate limiters
 */
export class RateLimiterManager {
  private limiters: Map<string, RateLimiter> = new Map();

  /**
   * Enregistre un rate limiter pour une catégorie
   */
  register(category: string, limiter: RateLimiter): void {
    this.limiters.set(category, limiter);
  }

  /**
   * Vérifie la limite pour une catégorie et un utilisateur
   */
  check(category: string, userId: string | number): RateLimitResult {
    const limiter = this.limiters.get(category);

    if (!limiter) {
      // Pas de limite définie = autorisé
      return {
        allowed: true,
        remaining: Infinity,
        resetIn: 0,
      };
    }

    return limiter.checkLimit(userId);
  }

  /**
   * Obtient un rate limiter par catégorie
   */
  get(category: string): RateLimiter | undefined {
    return this.limiters.get(category);
  }

  /**
   * Arrête tous les rate limiters
   */
  stopAll(): void {
    for (const limiter of this.limiters.values()) {
      limiter.stop();
    }
  }
}
