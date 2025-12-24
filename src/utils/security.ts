import { config } from '../config';

/**
 * Module de sécurité centralisé pour le bot Billit
 */

/**
 * Sanitise un message d'erreur pour ne pas exposer d'informations sensibles
 */
export function sanitizeError(error: Error | any, userMessage?: string): string {
  // En mode verbose (dev), retourner le message complet
  if (config.security.verboseErrors) {
    return error.message || String(error);
  }

  // En production, retourner un message générique ou personnalisé
  const defaultMessage = 'Une erreur est survenue. Veuillez réessayer.';

  // Si un message personnalisé est fourni, l'utiliser
  if (userMessage) {
    return userMessage;
  }

  // Mapper certaines erreurs connues à des messages utilisateur-friendly
  const errorMessage = error.message || String(error);

  if (errorMessage.includes('network') || errorMessage.includes('ECONNREFUSED')) {
    return 'Erreur de connexion au serveur. Veuillez réessayer dans quelques instants.';
  }

  if (errorMessage.includes('timeout')) {
    return 'La requête a pris trop de temps. Veuillez réessayer.';
  }

  if (errorMessage.includes('401') || errorMessage.includes('unauthorized')) {
    return 'Erreur d\'authentification. Veuillez contacter l\'administrateur.';
  }

  if (errorMessage.includes('403') || errorMessage.includes('forbidden')) {
    return 'Accès refusé. Veuillez contacter l\'administrateur.';
  }

  if (errorMessage.includes('404') || errorMessage.includes('not found')) {
    return 'Ressource introuvable.';
  }

  if (errorMessage.includes('429') || errorMessage.includes('rate limit')) {
    return 'Trop de requêtes. Veuillez patienter quelques instants.';
  }

  return defaultMessage;
}

/**
 * Sanitise une URL pour la logger sans exposer les tokens
 */
export function sanitizeUrl(url: string): string {
  try {
    const urlObj = new URL(url);

    // Masquer le token dans le path si présent
    const sanitizedPath = urlObj.pathname.replace(
      /\/bot[0-9]+:[A-Za-z0-9_-]+\//g,
      '/bot***:***/'
    );

    // Masquer les query params sensibles
    const sensitiveParams = ['apikey', 'token', 'api_key', 'bot_token', 'key'];
    sensitiveParams.forEach(param => {
      if (urlObj.searchParams.has(param)) {
        urlObj.searchParams.set(param, '***');
      }
    });

    return `${urlObj.origin}${sanitizedPath}${urlObj.search}`;
  } catch {
    // Si ce n'est pas une URL valide, masquer tout ce qui ressemble à un token
    return url.replace(/[0-9]+:[A-Za-z0-9_-]{30,}/g, '***:***');
  }
}

/**
 * Sanitise un objet pour la log en masquant les champs sensibles
 */
export function sanitizeObjectForLog(obj: any): any {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  const sensitiveKeys = [
    'apikey', 'apiKey', 'api_key',
    'token', 'botToken', 'bot_token',
    'password', 'passwd', 'pwd',
    'secret', 'private_key', 'privateKey',
    'authorization', 'auth'
  ];

  const sanitized = Array.isArray(obj) ? [...obj] : { ...obj };

  Object.keys(sanitized).forEach(key => {
    const lowerKey = key.toLowerCase();

    // Vérifier si la clé est sensible
    if (sensitiveKeys.some(sk => lowerKey.includes(sk))) {
      sanitized[key] = '***';
    }
    // Récursion pour les objets imbriqués
    else if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
      sanitized[key] = sanitizeObjectForLog(sanitized[key]);
    }
  });

  return sanitized;
}

/**
 * Vérifie si une string contient des caractères suspects pouvant être malicieux
 */
export function containsSuspiciousContent(text: string): boolean {
  // Vérifier les injections SQL basiques
  const sqlPatterns = [
    /(\bDROP\b|\bDELETE\b|\bINSERT\b|\bUPDATE\b).*\b(TABLE|DATABASE|FROM|INTO)\b/i,
    /union.*select/i,
    /;\s*drop/i,
  ];

  // Vérifier les tentatives d'injection de commande
  const commandPatterns = [
    /[;&|`$]\s*(rm|cat|ls|wget|curl|bash|sh|nc|netcat)/i,
    /\$\(.*\)/,  // Command substitution
    /`.*`/,      // Backticks
  ];

  // Vérifier XSS basique (bien que Telegram échappe le HTML)
  const xssPatterns = [
    /<script/i,
    /javascript:/i,
    /onerror\s*=/i,
  ];

  const allPatterns = [...sqlPatterns, ...commandPatterns, ...xssPatterns];

  return allPatterns.some(pattern => pattern.test(text));
}

/**
 * Enregistre une tentative d'accès non autorisé
 */
export function logUnauthorizedAccess(chatId: string | number, username?: string): void {
  const timestamp = new Date().toISOString();
  console.warn(`🚨 [SECURITY] Tentative d'accès non autorisé`);
  console.warn(`   Timestamp: ${timestamp}`);
  console.warn(`   Chat ID: ${chatId}`);
  if (username) {
    console.warn(`   Username: ${username}`);
  }

  // TODO: Dans une vraie application, ceci devrait être envoyé à un système de monitoring
  // ou sauvegardé dans un fichier de log sécurisé
}

/**
 * Enregistre une tentative d'injection ou d'exploitation
 */
export function logSuspiciousActivity(
  chatId: string | number,
  activity: string,
  details?: string
): void {
  const timestamp = new Date().toISOString();
  console.warn(`⚠️  [SECURITY] Activité suspecte détectée`);
  console.warn(`   Timestamp: ${timestamp}`);
  console.warn(`   Chat ID: ${chatId}`);
  console.warn(`   Activité: ${activity}`);
  if (details) {
    console.warn(`   Détails: ${details.substring(0, 100)}`); // Limiter la longueur
  }
}
