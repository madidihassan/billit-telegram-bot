/**
 * Détection des échecs Telegram définitifs et désactivation automatique
 * des destinataires devenus injoignables.
 *
 * Extrait de telegram-bot.ts pour être partagé avec le notifier léger
 * (src/notify/telegram-notifier.ts).
 */

import { removeAuthorizedUser } from '../database';

/**
 * Un échec est "permanent" quand renvoyer le message n'a aucune chance
 * d'aboutir :
 *  - 403 "Forbidden: bot was blocked by the user"
 *  - 403 "Forbidden: user is deactivated"
 *  - 400 "Bad Request: chat not found"
 */
export function isPermanentTelegramFailure(error: any): boolean {
  const code = error?.response?.body?.error_code ?? error?.code;
  const description = (error?.response?.body?.description ?? error?.message ?? '').toLowerCase();

  if (code === 403) {
    return description.includes('blocked') || description.includes('deactivated') || description.includes('kicked');
  }
  if (code === 400) {
    return description.includes('chat not found');
  }
  return false;
}

/** Désactive l'user en DB et logue visiblement pour qu'un admin puisse le voir. */
export function autoDisableUser(chatId: string, username: string | null, reason: string): void {
  const ok = removeAuthorizedUser(chatId);
  if (ok) {
    console.warn(`🚫 [Auto-désactivation] User ${chatId} (${username || 'inconnu'}) désactivé : ${reason}`);
  } else {
    console.error(`⚠️ [Auto-désactivation] Échec désactivation DB pour user ${chatId}`);
  }
}

/** Extrait la description d'erreur Telegram pour le log de désactivation. */
export function describeTelegramError(error: any): string {
  return error?.response?.body?.description || error?.message || 'unknown';
}
