/**
 * Types pour le système de suivi des soldes bancaires
 */

export interface BankAccountBalance {
  /** IBAN du compte */
  iban: string;
  /** Nom de la banque */
  name: string;
  /** Solde actuel en EUR */
  balance: number;
  /** ID de la dernière transaction traitée */
  lastTransactionId: string;
  /** Date de la dernière mise à jour */
  lastUpdate: string;
}

export interface BankBalancesStore {
  /** Date de la dernière mise à jour globale */
  lastUpdate: string;
  /** Date d'initialisation du système */
  initializedAt: string;
  /** Comptes bancaires suivis */
  accounts: {
    [iban: string]: BankAccountBalance;
  };
}

export interface BalanceUpdateResult {
  /** Nombre de nouvelles transactions traitées */
  transactionsProcessed: number;
  /** Comptes mis à jour */
  accountsUpdated: string[];
  /** Détails des mises à jour */
  updates: {
    iban: string;
    previousBalance: number;
    newBalance: number;
    transactionsCount: number;
  }[];
}
