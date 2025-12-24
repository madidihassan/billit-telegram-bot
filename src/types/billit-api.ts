/**
 * Types stricts pour l'API Billit
 * Remplace les 'any' pour un meilleur typage
 */

/**
 * Ligne de commande d'une facture Billit
 */
export interface BillitOrderLine {
  /** Description de la ligne */
  Description?: string;
  /** Description alternative */
  ItemDescription?: string;
  /** Quantité */
  Quantity?: number | string;
  /** Montant */
  Amount?: number | string;
  /** Prix unitaire */
  UnitPrice?: number | string;
  /** Prix */
  Price?: number | string;
  /** Prix unitaire HT */
  UnitPriceExcl?: number | string;
  /** Prix HT */
  PriceExcl?: number | string;
  /** Total HT */
  TotalExcl?: number | string;
  /** Total */
  Total?: number | string;
  /** Montant HT */
  AmountExcl?: number | string;
  /** Taux de TVA */
  VATRate?: number | string;
  /** TVA */
  VAT?: number | string;
  /** Pourcentage de TVA */
  VATPercentage?: number | string;
}

/**
 * Contrepartie (fournisseur/client) dans Billit
 */
export interface BillitCounterParty {
  /** Nom d'affichage */
  DisplayName?: string;
  /** Nom complet */
  FullName?: string;
  /** Nom de la compagnie */
  CompanyName?: string;
  /** Email */
  Email?: string;
  /** Téléphone */
  Phone?: string;
  /** Numéro de TVA */
  VATNumber?: string;
}

/**
 * Détails complets d'une commande/facture Billit
 */
export interface BillitOrderDetails {
  /** ID de la commande */
  OrderID?: number | string;
  /** Numéro de commande */
  OrderNumber?: string;
  /** Type de commande */
  OrderType?: string;
  /** Direction (Cost/Income) */
  OrderDirection?: string;
  /** Date de la commande */
  OrderDate?: string;
  /** Date d'échéance */
  ExpiryDate?: string;
  /** Date de création */
  Created?: string;
  /** Date de dernière modification */
  LastModified?: string;
  /** Statut de la commande */
  OrderStatus?: string;
  /** Payé */
  Paid?: boolean;
  /** Devise */
  Currency?: string;
  /** Total TTC */
  TotalIncl?: number;
  /** Total TTC (alias) */
  TotalInclVAT?: number;
  /** Total HT */
  TotalExcl?: number;
  /** Total HT (alias) */
  TotalExclVAT?: number;
  /** Total TVA */
  TotalVAT?: number;
  /** Référence de paiement */
  PaymentReference?: string;
  /** Référence */
  Reference?: string;
  /** Description */
  Description?: string;
  /** Communication */
  Communication?: string;
  /** Contrepartie (fournisseur/client) */
  CounterParty?: BillitCounterParty;
  /** Lignes de facture */
  OrderLines?: BillitOrderLine[];
  /** Autres propriétés dynamiques */
  [key: string]: any;
}

/**
 * Réponse de l'API Billit pour la liste des commandes
 */
export interface BillitOrdersResponse {
  /** Liste des commandes */
  Items?: BillitOrderDetails[];
  /** Liste des commandes (alias) */
  items?: BillitOrderDetails[];
  /** Nombre total d'items */
  TotalCount?: number;
  /** Lien vers la page suivante */
  NextLink?: string;
}

/**
 * Transaction financière Billit
 */
export interface BillitFinancialTransaction {
  /** ID de la transaction */
  BankAccountTransactionID?: number | string;
  /** ID alternatif */
  ID?: number | string;
  /** IBAN */
  IBAN?: string;
  /** Montant total */
  TotalAmount?: number | string;
  /** Type de transaction */
  TransactionType?: 'Credit' | 'Debit' | string;
  /** Date de valeur */
  ValueDate?: string;
  /** Date */
  Date?: string;
  /** Note */
  Note?: string;
  /** Description */
  Description?: string;
  /** Communication */
  Communication?: string;
  /** Nom de la contrepartie (ex: "N.V. Pluxee Belgium S.A.") */
  NameCounterParty?: string;
  /** IBAN de la contrepartie */
  IBANCounterParty?: string;
  /** BIC de la contrepartie */
  BICCounterParty?: string;
  /** Devise */
  Currency?: string;
  /** ID du compte bancaire */
  BankAccountID?: number;
  /** Autres propriétés dynamiques */
  [key: string]: any;
}

/**
 * Réponse de l'API Billit pour les transactions financières
 */
export interface BillitTransactionsResponse {
  /** Liste des transactions */
  Items?: BillitFinancialTransaction[];
  /** Liste des transactions (alias) */
  items?: BillitFinancialTransaction[];
  /** Nombre total d'items */
  TotalCount?: number;
  /** Lien vers la page suivante */
  NextLink?: string;
}

/**
 * Paramètres de filtre OData pour l'API Billit
 */
export interface BillitODataParams {
  /** Filtre OData */
  $filter?: string;
  /** Nombre d'items à retourner */
  $top?: number;
  /** Nombre d'items à sauter */
  $skip?: number;
  /** Tri */
  $orderby?: string;
  /** Sélection de champs */
  $select?: string;
  /** Expansion de relations */
  $expand?: string;
}
