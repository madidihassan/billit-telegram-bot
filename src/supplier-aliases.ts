/**
 * Dictionnaire d'aliases pour les fournisseurs
 * Permet de mapper des noms communs vers les vrais noms dans les transactions
 */

import * as fs from 'fs';
import * as path from 'path';

export interface SupplierAlias {
  aliases: string[];  // Noms que l'utilisateur peut utiliser
  patterns: string[]; // Patterns à chercher dans les descriptions de transactions
}

// Charger les aliases depuis le fichier JSON
function loadSupplierAliases(): Record<string, SupplierAlias> {
  try {
    const aliasesPath = path.join(__dirname, '..', 'supplier-aliases.json');
    
    if (fs.existsSync(aliasesPath)) {
      const content = fs.readFileSync(aliasesPath, 'utf-8');
      const loaded = JSON.parse(content);
      console.log(`✓ ${Object.keys(loaded).length} fournisseur(s) chargé(s) depuis supplier-aliases.json`);
      return loaded;
    } else {
      console.warn('⚠️  Fichier supplier-aliases.json non trouvé, utilisation des aliases par défaut');
    }
  } catch (error: any) {
    console.error('❌ Erreur lors du chargement de supplier-aliases.json:', error.message);
  }
  
  // Fallback: aliases par défaut
  return {
    'foster': {
      aliases: ['foster', 'foster fast food', 'foster fastfood'],
      patterns: ['foster', 'fosterfastfood']
    },
    'edenred': {
      aliases: ['edenred', 'eden red', 'eden', 'ticket restaurant'],
      patterns: ['edenred', 'edenredbelgium']
    },
    'collibry': {
      aliases: ['collibry', 'colibri', 'collibri'],
      patterns: ['collibry']
    }
  };
}

export const SUPPLIER_ALIASES: Record<string, SupplierAlias> = loadSupplierAliases();

/**
 * Normalise un terme de recherche en enlevant espaces, accents, ponctuation
 */
export function normalizeSearchTerm(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD') // Décompose les accents
    .replace(/[\u0300-\u036f]/g, '') // Enlève les accents
    .replace(/[\s\-_\.\/\\]/g, '') // Enlève espaces, tirets, underscores, points, slashes
    .trim();
}

/**
 * Trouve les patterns de recherche pour un nom de fournisseur
 * Retourne les patterns à chercher dans les descriptions
 */
export function getSupplierPatterns(supplierName: string): string[] {
  const normalized = normalizeSearchTerm(supplierName);
  
  // Chercher dans les aliases
  for (const [key, supplier] of Object.entries(SUPPLIER_ALIASES)) {
    // Vérifier si le nom correspond à un alias
    const matchesAlias = supplier.aliases.some(alias => 
      normalizeSearchTerm(alias) === normalized || 
      normalizeSearchTerm(alias).includes(normalized) ||
      normalized.includes(normalizeSearchTerm(alias))
    );
    
    if (matchesAlias) {
      // Retourner les patterns de ce fournisseur
      return supplier.patterns.map(p => normalizeSearchTerm(p));
    }
  }
  
  // Si pas trouvé dans les aliases, retourner le terme normalisé
  return [normalized];
}

/**
 * Calcule la distance de Levenshtein entre deux chaînes
 * Utilisé pour la similarité approximative
 */
function levenshteinDistance(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;
  const matrix: number[][] = [];

  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,     // suppression
        matrix[i][j - 1] + 1,     // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return matrix[len1][len2];
}

/**
 * Vérifie si deux chaînes sont similaires (distance de Levenshtein)
 */
function isSimilar(str1: string, str2: string, threshold: number = 0.25): boolean {
  const distance = levenshteinDistance(str1, str2);
  const maxLen = Math.max(str1.length, str2.length);
  const similarity = 1 - distance / maxLen;
  return similarity >= (1 - threshold);
}

/**
 * Vérifie si une description de transaction correspond à un fournisseur
 * AMÉLIORÉ: Utilise une recherche intelligente avec similarité approximative
 */
export function matchesSupplier(description: string, supplierName: string): boolean {
  const normalizedDesc = normalizeSearchTerm(description);
  const normalizedSupplier = normalizeSearchTerm(supplierName);

  // 1. Essayer les patterns prédéfinis d'abord (plus rapides)
  const patterns = getSupplierPatterns(supplierName);
  if (patterns.some(pattern => normalizedDesc.includes(pattern))) {
    return true;
  }

  // 2. Correspondance directe (inclusion)
  if (normalizedDesc.includes(normalizedSupplier)) {
    return true;
  }

  // 3. NOUVEAU: Similarité approximative AMÉLIORÉE
  // Chercher dans toute la description, pas seulement mot par mot
  if (normalizedSupplier.length >= 4) {
    // Extraire tous les mots de la description (même les courts)
    const words = normalizedDesc.split(/[^a-z0-9]+/).filter(w => w.length >= 4);

    // a) Comparer avec chaque mot individuel
    for (const word of words) {
      if (isSimilar(word, normalizedSupplier, 0.35)) {
        return true;
      }
    }

    // b) Chercher des sous-chaînes similaires dans toute la description
    // Ex: "moniz" dans "epsmonizze sanv"
    // On cherche des sous-chaînes de longueur similaire au terme cherché
    const searchLen = Math.max(normalizedSupplier.length, 8);
    for (let i = 0; i <= normalizedDesc.length - searchLen; i++) {
      const substring = normalizedDesc.substring(i, i + searchLen);
      if (isSimilar(substring, normalizedSupplier, 0.35)) {
        return true;
      }
    }
  }

  // 4. Recherche traditionnelle (fallback)
  const words = normalizedDesc.split(/[^a-z0-9]+/).filter(w => w.length >= 4);

  for (const word of words) {
    // Correspondance directe exacte
    if (word === normalizedSupplier) {
      return true;
    }

    // Correspondance inclusion (contenu dans)
    if (word.includes(normalizedSupplier) && normalizedSupplier.length >= 4) {
      return true;
    }

    if (normalizedSupplier.includes(word) && word.length >= 5) {
      return true;
    }
  }

  return false;
}

/**
 * Trouve automatiquement les noms de fournisseurs potentiels dans une description
 */
export function extractPotentialSupplierNames(description: string): string[] {
  const normalizedDesc = normalizeSearchTerm(description);
  const words = normalizedDesc.split(/[^a-z0-9]+/).filter(w => w.length >= 4);

  // Filtrer les mots communs qui ne sont pas des noms de fournisseurs
  const commonWords = new Set([
    'virement', 'euro', 'sepa', 'paiement', 'facture', 'communication',
    'IBAN', 'info', 'personnelle', 'introduit', 'via', 'online', 'pays',
    'bas', 'avant', 'numero', 'compte', 'bancaire', 'debit', 'credit'
  ]);

  return words.filter(w => !commonWords.has(w.toLowerCase()));
}


/**
 * Trouve le nom "propre" d'un fournisseur à partir d'un alias
 * Retourne le premier alias de la liste (généralement le nom principal)
 */
export function getSupplierDisplayName(supplierName: string): string {
  const normalized = normalizeSearchTerm(supplierName);
  
  for (const [key, supplier] of Object.entries(SUPPLIER_ALIASES)) {
    const matchesAlias = supplier.aliases.some(alias => 
      normalizeSearchTerm(alias) === normalized || 
      normalizeSearchTerm(alias).includes(normalized) ||
      normalized.includes(normalizeSearchTerm(alias))
    );
    
    if (matchesAlias) {
      // Retourner le premier alias (nom principal) avec la première lettre en majuscule
      return supplier.aliases[0]
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
    }
  }
  
  // Si pas trouvé, retourner le nom original avec première lettre en majuscule
  return supplierName
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Sauvegarde les aliases dans le fichier JSON
 */
function saveSupplierAliases(suppliers: Record<string, SupplierAlias>): boolean {
  try {
    const aliasesPath = path.join(__dirname, '..', 'supplier-aliases.json');
    const content = JSON.stringify(suppliers, null, 2);
    fs.writeFileSync(aliasesPath, content, 'utf-8');
    console.log(`✓ ${Object.keys(suppliers).length} fournisseur(s) sauvegardé(s) dans supplier-aliases.json`);
    return true;
  } catch (error: any) {
    console.error('❌ Erreur lors de la sauvegarde de supplier-aliases.json:', error.message);
    return false;
  }
}

/**
 * Ajoute un nouveau fournisseur
 * @param key Clé unique du fournisseur (ex: 'pluxee')
 * @param primaryName Nom principal d'affichage (ex: 'Pluxee Belgium')
 * @param aliases Liste des alias (ex: ['pluxee', 'pluxi', 'pluxee belgium'])
 * @param patterns Liste des patterns pour les transactions (ex: ['pluxee', 'pluxibel'])
 */
export function addSupplier(
  key: string,
  primaryName: string,
  aliases: string[],
  patterns: string[]
): { success: boolean; message: string } {
  // Normaliser la clé
  const normalizedKey = normalizeSearchTerm(key);

  // Vérifier si le fournisseur existe déjà
  if (SUPPLIER_ALIASES[normalizedKey]) {
    return {
      success: false,
      message: `❌ Le fournisseur "${primaryName}" existe déjà avec la clé "${normalizedKey}"`
    };
  }

  // S'assurer que le nom principal est dans les aliases
  if (!aliases.includes(primaryName)) {
    aliases.unshift(primaryName);
  }

  // Créer le nouveau fournisseur
  const newSupplier: SupplierAlias = {
    aliases: aliases.map(a => a.toLowerCase()),
    patterns: patterns.map(p => normalizeSearchTerm(p))
  };

  // Ajouter à la base
  SUPPLIER_ALIASES[normalizedKey] = newSupplier;

  // Sauvegarder
  if (saveSupplierAliases(SUPPLIER_ALIASES)) {
    return {
      success: true,
      message: `✅ Fournisseur "${primaryName}" ajouté avec succès !\n\nClé: ${normalizedKey}\nAliases: ${newSupplier.aliases.join(', ')}\nPatterns: ${newSupplier.patterns.join(', ')}`
    };
  } else {
    delete SUPPLIER_ALIASES[normalizedKey]; // Rollback
    return {
      success: false,
      message: `❌ Erreur lors de la sauvegarde du fournisseur`
    };
  }
}

/**
 * Liste tous les fournisseurs
 */
export function listSuppliers(): string {
  const suppliers = Object.entries(SUPPLIER_ALIASES);

  if (suppliers.length === 0) {
    return '📋 Aucun fournisseur configuré.';
  }

  let message = `📋 *Liste des fournisseurs (${suppliers.length})*\n\n`;

  suppliers.forEach(([key, supplier]) => {
    const displayName = supplier.aliases[0]
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');

    message += `• *${displayName}*\n`;
    message += `  └ Clé: \`${key}\`\n`;
    message += `  └ Aliases: ${supplier.aliases.slice(0, 3).join(', ')}${supplier.aliases.length > 3 ? '...' : ''}\n\n`;
  });

  return message;
}

/**
 * Supprime un fournisseur
 */
export function deleteSupplier(key: string): { success: boolean; message: string } {
  const normalizedKey = normalizeSearchTerm(key);

  // Chercher le fournisseur
  let foundKey: string | null = null;
  for (const k of Object.keys(SUPPLIER_ALIASES)) {
    if (normalizeSearchTerm(k) === normalizedKey) {
      foundKey = k;
      break;
    }
  }

  if (!foundKey || !SUPPLIER_ALIASES[foundKey]) {
    return {
      success: false,
      message: `❌ Fournisseur non trouvé: "${key}"`
    };
  }

  const supplier = SUPPLIER_ALIASES[foundKey];
  const displayName = supplier.aliases[0]
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

  // Supprimer
  delete SUPPLIER_ALIASES[foundKey];

  // Sauvegarder
  if (saveSupplierAliases(SUPPLIER_ALIASES)) {
    return {
      success: true,
      message: `✅ Fournisseur "${displayName}" supprimé avec succès !`
    };
  } else {
    // Rollback
    SUPPLIER_ALIASES[foundKey] = supplier;
    return {
      success: false,
      message: `❌ Erreur lors de la suppression du fournisseur`
    };
  }
}

/**
 * Recharge les fournisseurs depuis le fichier (après modifications externes)
 */
export function reloadSuppliers(): number {
  const suppliers = loadSupplierAliases();
  // Mettre à jour les entrées existantes
  Object.assign(SUPPLIER_ALIASES, suppliers);
  return Object.keys(SUPPLIER_ALIASES).length;
}
