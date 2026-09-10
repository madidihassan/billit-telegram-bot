/**
 * Contrat minimal dont InvoiceMonitoringService a besoin pour diffuser ses
 * notifications. Permet de brancher soit le bot interactif complet
 * (TelegramBotInteractive), soit le notifier léger (TelegramNotifier) sans
 * tirer l'agent IA et les commandes dans le graphe de dépendances.
 */
export interface InvoiceNotifier {
  /** @returns true si au moins un destinataire a reçu le message. */
  broadcastMessage(message: string): Promise<boolean>;

  broadcastDocument(
    document: Buffer,
    filename: string,
    caption?: string,
    replyMarkup?: any
  ): Promise<void>;
}
