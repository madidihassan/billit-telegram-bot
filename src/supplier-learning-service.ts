/**
 * Service d'auto-apprentissage des fournisseurs
 * Extrait automatiquement les noms de fournisseurs depuis les descriptions de transactions
 * et les ajoute à la base de données SQLite
 *
 * HISTORIQUE: Ce service écrivait dans supplier-aliases.json (split-brain).
 * Migré vers SQLite pour cohérence avec supplier-aliases.ts et database.ts.
 */

import { matchesSupplier, reloadSuppliers, SUPPLIER_ALIASES } from './supplier-aliases';
import { addSupplier as dbAddSupplier, findSupplierByNameOrAlias, removeSupplier as dbRemoveSupplier, getAllSuppliers } from './database';

export class SupplierLearningService {

  constructor() {
    // Pas de chargement JSON - on utilise SQLite via SUPPLIER_ALIASES
  }

  /**
   * Extrait le nom du fournisseur depuis une description de transaction
   */
  extractSupplierFromDescription(description: string): string | null {
    if (!description) return null;

    const cleanDesc = description.trim();

    // Pattern 1: "Belgian Shell SA -                    DEBIT POUR DOMICILIATION..."
    let match = cleanDesc.match(/^([A-Z][A-Za-z0-9&\s\.]+?)(?:\s+-\s+|\s*:|\s{5,})/);
    if (match && match[1]) {
      const supplierName = match[1].trim();
      const words = supplierName.split(/\s+/).filter(w => w.length > 0);
      if (words.length >= 2 && words[0].length >= 2) {
        return supplierName;
      }
    }

    // Pattern 2: "VIREMENT EN FAVEUR DE mediwet BE91390..."
    match = cleanDesc.match(/(?:vers|en faveur de)\s+([A-Za-z0-9&]+?)(?:\s+BE\d+|\s+DE\d+|\s+NL\d+|\s+FR\d+|\s+-|\s+Identification|\s*,|\s+Paiement)/i);
    if (match && match[1]) {
      const supplierName = match[1].trim();
      if (supplierName.length >= 2) {
        return supplierName;
      }
    }

    // Pattern 3: "RECOUVREMENT EUROPÉEN KBC BANK NV 0001 0001"
    match = cleanDesc.match(/^(?:RECOUVREMENT|VIREMENT|PRELEVEMENT|DOMICILIATION|PREL[EÈ]VEMENT)\s+(?:EUROP[ÉE]EN\s+)?(?:SEPA\s+)?([A-Z][A-Za-z0-9&\s\.]+?)(?:\s+\d{4,}|$)/i);
    if (match && match[1]) {
      const supplierName = match[1].trim();
      const words = supplierName.split(/\s+/).filter(w => w.length > 0);
      if (words.length >= 2) {
        return supplierName;
      }
    }

    // Pattern 4: Premier mot-clé en majuscules
    match = cleanDesc.match(/^([A-Z]{2,}(?:\s+[A-Z]{2,})+(?:\s+SA|NV|Bureau|SPRL|Ltd)+)/);
    if (match && match[1]) {
      return match[1].trim();
    }

    return null;
  }

  /**
   * Normalise un nom de fournisseur pour en faire une clé
   */
  normalizeSupplierKey(supplierName: string): string {
    let key = supplierName.toLowerCase();
    key = key.replace(/\s+(sa|nv|bureau|sprl|ltd|gmbh|srl|bv|ba)$/i, '');
    key = key.replace(/\s+(belgian|n\.v\.|de|la|le|les|des|du)/i, ' ');
    key = key.replace(/[^a-z0-9\s]/g, ' ');
    key = key.replace(/\s+/g, ' ').trim();
    return key;
  }

  /**
   * Apprend un nouveau fournisseur depuis une description de transaction
   * Ecrit dans SQLite via database.ts
   */
  learnFromDescription(description: string): boolean {
    const supplierName = this.extractSupplierFromDescription(description);

    if (!supplierName) {
      return false;
    }

    // Vérifier si le fournisseur existe déjà dans SQLite
    if (this.isSupplierKnown(supplierName)) {
      return false;
    }

    const aliases = this.createAliases(supplierName);

    // Ajouter dans SQLite
    const supplierId = dbAddSupplier(supplierName, aliases, 'fournisseur');

    if (!supplierId) {
      return false;
    }

    // Recharger le cache en mémoire
    reloadSuppliers();

    console.log(`🧑‍🎓 Nouveau fournisseur appris: "${supplierName}" (SQLite ID: ${supplierId})`);
    return true;
  }

  /**
   * Vérifie si un fournisseur est déjà connu (via SQLite + cache mémoire)
   */
  isSupplierKnown(supplierName: string): boolean {
    // Vérifier dans la BDD SQLite
    const found = findSupplierByNameOrAlias(supplierName);
    if (found) return true;

    // Vérifier dans le cache en mémoire (fuzzy matching)
    for (const key in SUPPLIER_ALIASES) {
      if (matchesSupplier(supplierName, key)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Crée les aliases pour un fournisseur
   */
  private createAliases(supplierName: string): string[] {
    const aliases: string[] = [];
    const normalized = supplierName.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

    aliases.push(normalized);

    const withoutSuffix = normalized.replace(/\s+(sa|nv|bureau|sprl|ltd|gmbh|srl|bv|ba)$/, '').trim();
    if (withoutSuffix !== normalized && withoutSuffix.length > 2) {
      aliases.push(withoutSuffix);
    }

    const words = normalized.split(/\s+/);
    if (words.length > 1) {
      aliases.push(words[0]);
      aliases.push(`${words[0]} ${words[1]}`);
    }

    // Ajouter aussi la clé normalisée
    const key = this.normalizeSupplierKey(supplierName);
    if (!aliases.includes(key)) {
      aliases.push(key);
    }

    return aliases;
  }

  /**
   * Retourne le nombre de fournisseurs dans la base
   */
  getSupplierCount(): number {
    return getAllSuppliers().length;
  }

  /**
   * Liste tous les fournisseurs connus
   */
  listSuppliers(): string[] {
    return getAllSuppliers().map(s => s.name).sort();
  }

  /**
   * Ajoute manuellement un fournisseur dans SQLite
   */
  addSupplier(supplierName: string, customAliases?: string[]): boolean {
    if (this.isSupplierKnown(supplierName)) {
      return false;
    }

    const aliases = this.createAliases(supplierName);

    if (customAliases && customAliases.length > 0) {
      for (const alias of customAliases) {
        const normalizedAlias = alias.toLowerCase().trim();
        if (!aliases.includes(normalizedAlias)) {
          aliases.push(normalizedAlias);
        }
      }
    }

    const supplierId = dbAddSupplier(supplierName, aliases, 'fournisseur');

    if (!supplierId) {
      return false;
    }

    reloadSuppliers();
    console.log(`➕ Fournisseur ajouté: "${supplierName}" (SQLite ID: ${supplierId})`);
    return true;
  }

  /**
   * Supprime un fournisseur de SQLite
   */
  removeSupplier(key: string): boolean {
    const supplier = findSupplierByNameOrAlias(key);
    if (!supplier) {
      return false;
    }

    const success = dbRemoveSupplier(supplier.id);
    if (success) {
      reloadSuppliers();
      console.log(`🗑️ Fournisseur supprimé: "${supplier.name}" (SQLite ID: ${supplier.id})`);
    }
    return success;
  }
}
