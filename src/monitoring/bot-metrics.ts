/**
 * Système de monitoring et métriques du bot
 *
 * Collecte et expose des statistiques en temps réel
 *
 * @module BotMetrics
 * @category Monitoring
 */

import { logInfo } from '../utils/logger';

export interface MetricsSnapshot {
  uptime: number;
  uptimeFormatted: string;
  memory: NodeJS.MemoryUsage;
  totalRequests: number;
  aiCalls: number;
  errors: number;
  avgResponseTime: number;
  activeUsers: number;
  toolUsage: Record<string, number>;
  errorsByType: Record<string, number>;
  requestsPerHour: number;
  lastError?: {
    message: string;
    timestamp: number;
    userId?: string;
  };
}

/**
 * Collecteur de métriques pour le bot
 */
export class BotMetrics {
  private startTime: number;
  private stats = {
    totalRequests: 0,
    aiCalls: 0,
    errors: 0,
    responseTimes: [] as number[],
    toolUsage: new Map<string, number>(),
    errorsByType: new Map<string, number>(),
    activeUsers: new Set<string>(),
    lastError: undefined as { message: string; timestamp: number; userId?: string } | undefined,
  };

  constructor() {
    this.startTime = Date.now();
    logInfo('Système de métriques initialisé', 'bot-metrics');
  }

  /**
   * Enregistre une nouvelle requête
   */
  trackRequest(userId: string, duration: number): void {
    this.stats.totalRequests++;
    this.stats.responseTimes.push(duration);
    this.stats.activeUsers.add(userId);

    // Garder seulement les 100 derniers temps de réponse
    if (this.stats.responseTimes.length > 100) {
      this.stats.responseTimes.shift();
    }
  }

  /**
   * Enregistre un appel IA
   */
  trackAICall(toolName?: string): void {
    this.stats.aiCalls++;

    if (toolName) {
      const currentCount = this.stats.toolUsage.get(toolName) || 0;
      this.stats.toolUsage.set(toolName, currentCount + 1);
    }
  }

  /**
   * Enregistre une erreur
   */
  trackError(errorType: string, message: string, userId?: string): void {
    this.stats.errors++;

    const currentCount = this.stats.errorsByType.get(errorType) || 0;
    this.stats.errorsByType.set(errorType, currentCount + 1);

    this.stats.lastError = {
      message,
      timestamp: Date.now(),
      userId,
    };
  }

  /**
   * Obtient le temps moyen de réponse
   */
  private getAverageResponseTime(): number {
    if (this.stats.responseTimes.length === 0) return 0;
    const sum = this.stats.responseTimes.reduce((a, b) => a + b, 0);
    return Math.round((sum / this.stats.responseTimes.length) * 100) / 100;
  }

  /**
   * Obtient le nombre de requêtes par heure
   */
  private getRequestsPerHour(): number {
    const uptimeHours = (Date.now() - this.startTime) / (1000 * 60 * 60);
    if (uptimeHours === 0) return 0;
    return Math.round(this.stats.totalRequests / uptimeHours);
  }

  /**
   * Formate l'uptime en format lisible
   */
  private formatUptime(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}j ${hours % 24}h ${minutes % 60}min`;
    } else if (hours > 0) {
      return `${hours}h ${minutes % 60}min`;
    } else if (minutes > 0) {
      return `${minutes}min ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * Obtient un snapshot complet des métriques
   */
  getSnapshot(): MetricsSnapshot {
    const uptime = Date.now() - this.startTime;

    return {
      uptime,
      uptimeFormatted: this.formatUptime(uptime),
      memory: process.memoryUsage(),
      totalRequests: this.stats.totalRequests,
      aiCalls: this.stats.aiCalls,
      errors: this.stats.errors,
      avgResponseTime: this.getAverageResponseTime(),
      activeUsers: this.stats.activeUsers.size,
      toolUsage: Object.fromEntries(this.stats.toolUsage),
      errorsByType: Object.fromEntries(this.stats.errorsByType),
      requestsPerHour: this.getRequestsPerHour(),
      lastError: this.stats.lastError,
    };
  }

  /**
   * Génère un rapport formaté pour Telegram
   */
  getHealthReport(): string {
    const snapshot = this.getSnapshot();
    const memoryMB = Math.round(snapshot.memory.heapUsed / 1024 / 1024);
    const totalMemoryMB = Math.round(snapshot.memory.heapTotal / 1024 / 1024);
    const successRate = snapshot.totalRequests > 0
      ? ((snapshot.totalRequests - snapshot.errors) / snapshot.totalRequests * 100).toFixed(1)
      : '100.0';

    let report = `🤖 **Bot Health Dashboard**\n\n`;
    report += `📊 **Statistiques (depuis démarrage)**\n`;
    report += `├ Uptime: ${snapshot.uptimeFormatted}\n`;
    report += `├ Requêtes totales: ${snapshot.totalRequests}\n`;
    report += `├ Utilisateurs actifs: ${snapshot.activeUsers}\n`;
    report += `├ Temps moyen réponse: ${snapshot.avgResponseTime}ms\n`;
    report += `└ Taux succès: ${successRate}%\n\n`;

    report += `🔧 **Appels IA**\n`;
    report += `├ Total: ${snapshot.aiCalls}\n`;
    report += `└ Requêtes/heure: ${snapshot.requestsPerHour}\n\n`;

    // Top 5 outils les plus utilisés
    const topTools = Object.entries(snapshot.toolUsage)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5);

    if (topTools.length > 0) {
      report += `🏆 **Outils les plus utilisés**\n`;
      topTools.forEach(([tool, count], index) => {
        const emoji = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '  ';
        report += `${emoji} ${tool}: ${count}x\n`;
      });
      report += `\n`;
    }

    // Erreurs
    if (snapshot.errors > 0) {
      report += `⚠️ **Erreurs**\n`;
      report += `├ Total: ${snapshot.errors}\n`;

      if (snapshot.lastError) {
        const timeSince = this.formatUptime(Date.now() - snapshot.lastError.timestamp);
        report += `└ Dernière: "${snapshot.lastError.message}" (il y a ${timeSince})\n\n`;
      } else {
        report += `\n`;
      }
    }

    report += `💾 **Système**\n`;
    report += `├ RAM: ${memoryMB}MB / ${totalMemoryMB}MB\n`;
    report += `└ Node.js: ${process.version}\n`;

    return report;
  }

  /**
   * Réinitialise les statistiques
   */
  reset(): void {
    this.stats = {
      totalRequests: 0,
      aiCalls: 0,
      errors: 0,
      responseTimes: [],
      toolUsage: new Map(),
      errorsByType: new Map(),
      activeUsers: new Set(),
      lastError: undefined,
    };
    this.startTime = Date.now();
    logInfo('Métriques réinitialisées', 'bot-metrics');
  }
}

// Instance singleton des métriques
export const globalMetrics = new BotMetrics();
