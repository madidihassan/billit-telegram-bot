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
 * Vérifie si une description de transaction correspond à un fournisseur
 */
export function matchesSupplier(description: string, supplierName: string): boolean {
  const normalizedDesc = normalizeSearchTerm(description);
  const patterns = getSupplierPatterns(supplierName);
  
  // Vérifier si un des patterns est présent dans la description
  return patterns.some(pattern => normalizedDesc.includes(pattern));
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
