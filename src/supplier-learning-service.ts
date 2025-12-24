/**
 * Service d'auto-apprentissage des fournisseurs
 * Extrait automatiquement les noms de fournisseurs depuis les descriptions de transactions
 * et les ajoute à la base de données
 */

import * as fs from 'fs';
import * as path from 'path';
import { matchesSupplier } from './supplier-aliases';

interface SupplierAlias {
  aliases: string[];
  patterns: string[];
}

interface SuppliersDatabase {
  [key: string]: SupplierAlias;
}

export class SupplierLearningService {
  private readonly ALIASES_FILE = path.join(process.cwd(), 'supplier-aliases.json');
  private database: SuppliersDatabase = {};

  constructor() {
    this.loadDatabase();
  }

  /**
   * Charge la base de données des fournisseurs
   */
  private loadDatabase(): void {
    try {
      const content = fs.readFileSync(this.ALIASES_FILE, 'utf-8');
      this.database = JSON.parse(content);
      console.log('✅ Base de données des fournisseurs chargée');
    } catch (error: any) {
      console.error('❌ Erreur lors du chargement de la base:', error.message);
      this.database = {};
    }
  }

  /**
   * Sauvegarde la base de données des fournisseurs
   */
  private saveDatabase(): void {
    try {
      // Trier les clés par ordre alphabétique
      const sorted = Object.keys(this.database).sort();
      const sortedDatabase: SuppliersDatabase = {};

      sorted.forEach(key => {
        sortedDatabase[key] = this.database[key];
      });

      fs.writeFileSync(
        this.ALIASES_FILE,
        JSON.stringify(sortedDatabase, null, 2),
        'utf-8'
      );
      console.log('💾 Base de données des fournisseurs sauvegardée');
    } catch (error: any) {
      console.error('❌ Erreur lors de la sauvegarde:', error.message);
    }
  }

  /**
   * Extrait le nom du fournisseur depuis une description de transaction
   */
  extractSupplierFromDescription(description: string): string | null {
    if (!description) return null;

    // Nettoyer la description
    const cleanDesc = description.trim();

    // Pattern 1: "Belgian Shell SA -                    DEBIT POUR DOMICILIATION..."
    // Extraire tout avant le premier " - " ou ":"
    let match = cleanDesc.match(/^([A-Z][A-Za-z0-9&\s\.]+?)(?:\s+-\s+|\s*:|\s{5,})/);
    if (match && match[1]) {
      const supplierName = match[1].trim();
      // Vérifier que le nom a au moins 2 mots et semble valide
      const words = supplierName.split(/\s+/).filter(w => w.length > 0);
      if (words.length >= 2 && words[0].length >= 2) {
        return supplierName;
      }
    }

    // Pattern 2: "VIREMENT EN FAVEUR DE mediwet BE91390..." ou "vers Coca-Cola - Communication: ..."
    // Arrêter l'extraction si on rencontre un IBAN (commence par BE ou DE suivi de chiffres)
    match = cleanDesc.match(/(?:vers|en faveur de)\s+([A-Za-z0-9&]+?)(?:\s+BE\d+|\s+DE\d+|\s+NL\d+|\s+FR\d+|\s+-|\s+Identification|\s*,|\s+Paiement)/i);
    if (match && match[1]) {
      const supplierName = match[1].trim();
      // Vérifier que le nom a au moins 2 caractères
      if (supplierName.length >= 2) {
        return supplierName;
      }
    }

    // Pattern 3: "RECOUVREMENT EUROPÉEN KBC BANK NV 0001 0001" - Extraire après "RECOUVREMENT", "VIREMENT", etc.
    match = cleanDesc.match(/^(?:RECOUVREMENT|VIREMENT|PRELEVEMENT|DOMICILIATION|PREL[EÈ]VEMENT)\s+(?:EUROP[ÉE]EN\s+)?(?:SEPA\s+)?([A-Z][A-Za-z0-9&\s\.]+?)(?:\s+\d{4,}|$)/i);
    if (match && match[1]) {
      const supplierName = match[1].trim();
      // Vérifier que le nom a au moins 2 mots
      const words = supplierName.split(/\s+/).filter(w => w.length > 0);
      if (words.length >= 2) {
        return supplierName;
      }
    }

    // Pattern 4: Extraire le premier mot-clé en majuscules au début
    match = cleanDesc.match(/^([A-Z]{2,}(?:\s+[A-Z]{2,})+(?:\s+SA|NV|Bureau|SPRL|Ltd)+)/);
    if (match && match[1]) {
      return match[1].trim();
    }

    return null;
  }

  /**
   * Normalise un nom de fournisseur pour en faire une clé de base de données
   * Ex: "Belgian Shell SA" -> "shell"
   */
  normalizeSupplierKey(supplierName: string): string {
    // Convertir en minuscules
    let key = supplierName.toLowerCase();

    // Enlever les suffixes communs
    key = key.replace(/\s+(sa|nv|bureau|sprl|ltd|gmbh|srl|bv|ba)$/i, '');

    // Enlever les mots communs
    key = key.replace(/\s+(belgian|n\.v\.|de|la|le|les|des|du)/i, ' ');

    // Garder seulement les caractères alphanumériques et espaces
    key = key.replace(/[^a-z0-9\s]/g, ' ');

    // Remplacer les espaces multiples par un seul
    key = key.replace(/\s+/g, ' ').trim();

    return key;
  }

  /**
   * Apprend un nouveau fournisseur depuis une description de transaction
   * Retourne true si le fournisseur a été ajouté
   */
  learnFromDescription(description: string): boolean {
    const supplierName = this.extractSupplierFromDescription(description);

    if (!supplierName) {
      return false;
    }

    // Vérifier si le fournisseur existe déjà
    if (this.isSupplierKnown(supplierName)) {
      return false; // Déjà connu
    }

    // Créer la clé normalisée
    const key = this.normalizeSupplierKey(supplierName);

    // Créer les aliases et patterns
    const aliases = this.createAliases(supplierName);
    const patterns = this.createPatterns(supplierName);

    // Ajouter à la base de données
    this.database[key] = {
      aliases,
      patterns
    };

    // Sauvegarder
    this.saveDatabase();

    console.log(`🧑‍🎓 Nouveau fournisseur appris: "${supplierName}" (clé: "${key}")`);
    return true;
  }

  /**
   * Vérifie si un fournisseur est déjà connu (via aliases ou patterns)
   */
  isSupplierKnown(supplierName: string): boolean {
    // Vérifier dans la base de données
    for (const key in this.database) {
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

    // Alias principal (nom complet normalisé)
    aliases.push(normalized);

    // Alias sans "SA", "NV", etc.
    const withoutSuffix = normalized.replace(/\s+(sa|nv|bureau|sprl|ltd|gmbh|srl|bv|ba)$/, '').trim();
    if (withoutSuffix !== normalized && withoutSuffix.length > 2) {
      aliases.push(withoutSuffix);
    }

    // Alias court (premier mot significatif)
    const words = normalized.split(/\s+/);
    if (words.length > 1) {
      // Premier mot
      aliases.push(words[0]);
      // Premier et deuxième mot
      aliases.push(`${words[0]} ${words[1]}`);
    }

    return aliases;
  }

  /**
   * Crée les patterns pour la recherche floue
   */
  private createPatterns(supplierName: string): string[] {
    const patterns: string[] = [];
    const normalized = supplierName.toLowerCase().replace(/[^a-z0-9]/g, '');

    // Pattern principal (sans espaces)
    patterns.push(normalized);

    return patterns;
  }

  /**
   * Retourne le nombre de fournisseurs dans la base de données
   */
  getSupplierCount(): number {
    return Object.keys(this.database).length;
  }

  /**
   * Liste tous les fournisseurs connus
   */
  listSuppliers(): string[] {
    return Object.keys(this.database).sort();
  }

  /**
   * Ajoute manuellement un fournisseur à la base de données
   * @param supplierName Nom complet du fournisseur (ex: "KBC BANK NV", "Mediwet")
   * @param customAliases Aliases optionnels supplémentaires
   * @returns true si ajouté, false si déjà existant
   */
  addSupplier(supplierName: string, customAliases?: string[]): boolean {
    // Vérifier si le fournisseur existe déjà
    if (this.isSupplierKnown(supplierName)) {
      return false;
    }

    // Créer la clé normalisée
    const key = this.normalizeSupplierKey(supplierName);

    // Créer les aliases et patterns de base
    const aliases = this.createAliases(supplierName);
    const patterns = this.createPatterns(supplierName);

    // Ajouter les aliases personnalisés si fournis
    if (customAliases && customAliases.length > 0) {
      customAliases.forEach(alias => {
        const normalizedAlias = alias.toLowerCase().trim();
        if (!aliases.includes(normalizedAlias)) {
          aliases.push(normalizedAlias);
        }
      });
    }

    // Ajouter à la base de données
    this.database[key] = {
      aliases,
      patterns
    };

    // Sauvegarder
    this.saveDatabase();

    console.log(`➕ Fournisseur ajouté manuellement: "${supplierName}" (clé: "${key}")`);
    return true;
  }

  /**
   * Supprime un fournisseur de la base de données
   * @param key Clé du fournisseur à supprimer
   * @returns true si supprimé, false si non trouvé
   */
  removeSupplier(key: string): boolean {
    if (!this.database[key]) {
      return false;
    }

    delete this.database[key];
    this.saveDatabase();

    console.log(`🗑️  Fournisseur supprimé: "${key}"`);
    return true;
  }
}
