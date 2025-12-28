/**
 * Script pour recharger tous les fournisseurs depuis l'API Billit
 *
 * Ce script:
 * 1. Supprime TOUS les fournisseurs existants dans la BD
 * 2. Récupère toutes les factures depuis Billit
 * 3. Extrait les noms de fournisseurs uniques
 * 4. Crée des alias automatiques pour chaque fournisseur
 * 5. Les ajoute dans la base de données SQLite
 */

import { BillitClient } from './billit-client';
import { deleteAllSuppliers, addSupplier } from './database';
import { normalizeSearchTerm } from './utils/string-utils';

/**
 * Fournisseurs supplémentaires connus (non présents dans les factures Billit)
 * mais qui apparaissent dans les transactions bancaires
 */
const ADDITIONAL_KNOWN_SUPPLIERS: Array<{name: string; aliases: string[]; replaceAutoAliases?: boolean}> = [
  {
    name: 'Clavie',
    aliases: ['clavie', 'clavie s.a.', 'clavie sa', 'claviesa']
  },
  {
    name: 'Monizze',
    aliases: ['monizze', 'moniz', 'epsmonizze']
  },
  {
    name: 'Edenred',
    aliases: ['edenred', 'edenredbelgium', 'edenred belgium', 'eden red']
  },
  {
    name: 'Pluxee Belgium',
    aliases: ['pluxee', 'pluxee belgium', 'pluxeebelgium', 'pluxi']
  },
  {
    name: 'Collibry',
    aliases: ['collibry', 'colibri', 'collibri']
  },
  {
    name: 'Engie',
    aliases: ['engie', 'engie electrabel']
  },
  {
    name: 'Vivaqua',
    aliases: ['vivaqua', 'vivaqua sa']
  },
  {
    name: 'Proximus',
    aliases: ['proximus', 'proximus sa', 'proximus belgium']
  },
  {
    name: 'Colruyt',
    aliases: ['colruyt', 'colruyt group']
  },
  {
    name: 'Makro',
    aliases: ['makro', 'makro belgium']
  },
  {
    name: 'Metro',
    aliases: ['metro', 'metro belgium', 'metro cash']
  },
  {
    name: 'Transgourmet',
    aliases: ['transgourmet', 'transgourmet belgium']
  },
  {
    // OVERRIDE Coca-Cola avec alias manuels (les alias auto sont trop larges)
    name: 'COCA-COLA EUROPACIFIC PARTNERS BELGIUM SRL',
    aliases: ['coca-cola', 'cocacola', 'coca cola', 'coca-cola europacific', 'cocacolaeuropacific'],
    replaceAutoAliases: true  // Remplacer les alias auto-générés
  },
  {
    // OVERRIDE Foster avec alias manuels (auto-generated "fast" and "food" are too generic)
    name: 'FOSTER FAST FOOD SA',
    aliases: ['foster', 'foster fast food', 'fosterfastfood', 'foster fast food sa', 'fosterfastfoodsa'],
    replaceAutoAliases: true
  },
  {
    // OVERRIDE Sligro avec alias manuels (auto-generated "belgium" is too generic)
    name: 'Sligro-MFS Belgium SA',
    aliases: ['sligro', 'sligro-mfs', 'sligromfs', 'sligro mfs', 'sligro belgium'],
    replaceAutoAliases: true
  },
  {
    // OVERRIDE Uber Eats avec alias manuels (auto-generated "belgium" and "eats" are too generic)
    name: 'Uber Eats Belgium SRL',
    aliases: ['uber', 'uber eats', 'ubereats', 'uber eats belgium', 'ubereatsbelgium'],
    replaceAutoAliases: true
  },
  {
    // OVERRIDE Wibra België avec alias manuels (auto-generated "belgi" is too generic, matches belgium/belgian)
    name: 'Wibra België',
    aliases: ['wibra', 'wibra belgië', 'wibra belgie', 'wibrabelgie'],
    replaceAutoAliases: true
  },
  {
    // OVERRIDE AHLAS PACK SRL avec alias manuels (auto-generated "pack" is too generic)
    name: 'AHLAS PACK SRL',
    aliases: ['ahlas', 'ahlas pack', 'ahlaspacksrl', 'ahlas pack srl'],
    replaceAutoAliases: true
  }
];

/**
 * Génère des alias automatiques pour un nom de fournisseur
 */
function generateAliases(supplierName: string): string[] {
  const aliases: Set<string> = new Set();

  // Alias 1: Le nom original
  aliases.add(supplierName.toLowerCase());

  // Alias 2: Version normalisée (sans espaces, accents, etc.)
  const normalized = normalizeSearchTerm(supplierName);
  if (normalized) {
    aliases.add(normalized);
  }

  // Alias 3: Sans espaces
  const noSpaces = supplierName.replace(/\s+/g, '').toLowerCase();
  if (noSpaces && noSpaces !== supplierName.toLowerCase()) {
    aliases.add(noSpaces);
  }

  // Alias 4: Mots individuels (si > 1 mot et mot >= 4 caractères)
  const words = supplierName.split(/\s+/);
  if (words.length > 1) {
    words.forEach(word => {
      const cleanWord = word.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (cleanWord.length >= 4) {
        aliases.add(cleanWord);
      }
    });
  }

  // Alias 5: Premiers mots (pour noms composés)
  if (words.length >= 2) {
    const firstTwo = words.slice(0, 2).join(' ').toLowerCase();
    if (firstTwo) {
      aliases.add(firstTwo);
    }
  }

  // Alias 6: Version sans "SA", "SPRL", "SRL", "BVBA", etc.
  const cleanedName = supplierName
    .replace(/\s+(SA|SPRL|SRL|BVBA|NV|BV|SAS|SARL|GmbH|Ltd|Inc|Corp)\.?$/i, '')
    .trim()
    .toLowerCase();
  if (cleanedName && cleanedName !== supplierName.toLowerCase()) {
    aliases.add(cleanedName);
  }

  return Array.from(aliases);
}

/**
 * Recharge tous les fournisseurs depuis Billit
 */
async function reloadSuppliers() {
  console.log('🔄 RECHARGEMENT DES FOURNISSEURS DEPUIS BILLIT');
  console.log('================================================\n');

  try {
    // Étape 1: Supprimer tous les fournisseurs existants
    console.log('📋 Étape 1/5: Suppression des fournisseurs existants...');
    const deletedCount = deleteAllSuppliers();
    console.log(`✅ ${deletedCount} fournisseur(s) supprimé(s)\n`);

    // Étape 2: Récupérer toutes les factures depuis Billit
    console.log('📋 Étape 2/4: Récupération des factures depuis Billit...');
    const billitClient = new BillitClient();

    // Récupérer le maximum de factures (120 = limite API Billit)
    const invoices = await billitClient.getInvoices({ limit: 120 });
    console.log(`✅ ${invoices.length} facture(s) récupérée(s)\n`);

    // Étape 3: Extraire les noms de fournisseurs uniques depuis les factures
    console.log('📋 Étape 3/4: Extraction des fournisseurs depuis factures...');
    const supplierNamesSet = new Set<string>();

    // Depuis les factures Billit
    invoices.forEach(invoice => {
      const supplierName = invoice.supplier_name?.trim();
      if (supplierName && supplierName !== 'Inconnu' && supplierName !== '') {
        supplierNamesSet.add(supplierName);
      }
    });

    console.log(`✅ ${supplierNamesSet.size} fournisseur(s) trouvé(s) dans les factures\n`);

    // Ajouter les fournisseurs connus supplémentaires
    console.log('📋 Ajout des fournisseurs supplémentaires connus...');
    const additionalSuppliers: Array<{name: string; manualAliases: string[]; replace?: boolean}> = [];
    const suppliersToReplace = new Set<string>();

    ADDITIONAL_KNOWN_SUPPLIERS.forEach(supplier => {
      if (supplier.replaceAutoAliases) {
        // Marquer ce fournisseur pour remplacement (on va le skip dans la génération auto)
        suppliersToReplace.add(supplier.name);
        additionalSuppliers.push({
          name: supplier.name,
          manualAliases: supplier.aliases,
          replace: true
        });
      } else if (!supplierNamesSet.has(supplier.name)) {
        additionalSuppliers.push({
          name: supplier.name,
          manualAliases: supplier.aliases,
          replace: false
        });
      }
    });

    console.log(`✅ ${additionalSuppliers.length} fournisseur(s) supplémentaire(s) ajouté(s)\n`);

    // Filtrer les fournisseurs à remplacer
    const uniqueSuppliers = Array.from(supplierNamesSet)
      .filter(name => !suppliersToReplace.has(name))
      .sort();
    const totalSuppliers = uniqueSuppliers.length + additionalSuppliers.length;
    console.log(`✅ TOTAL: ${totalSuppliers} fournisseur(s) à ajouter\n`);

    // Afficher les 10 premiers fournisseurs
    console.log('📋 Aperçu des fournisseurs trouvés (premiers 10):');
    uniqueSuppliers.slice(0, 10).forEach((supplier, i) => {
      console.log(`   ${i + 1}. ${supplier}`);
    });
    console.log('');

    // Étape 4: Générer les alias et ajouter dans la BD
    console.log('📋 Étape 4/4: Ajout des fournisseurs dans la base de données...');
    let addedCount = 0;
    let skippedCount = 0;

    // Ajouter les fournisseurs depuis les factures Billit (avec alias auto-générés)
    for (const supplierName of uniqueSuppliers) {
      const aliases = generateAliases(supplierName);

      const supplierId = addSupplier(supplierName, aliases, 'fournisseur');

      if (supplierId) {
        addedCount++;
        console.log(`   ✅ ${supplierName} (${aliases.length} alias auto)`);
      } else {
        skippedCount++;
        console.log(`   ⚠️  ${supplierName} (déjà existant ou erreur)`);
      }
    }

    // Ajouter les fournisseurs supplémentaires connus (avec alias manuels)
    for (const supplier of additionalSuppliers) {
      const supplierId = addSupplier(supplier.name, supplier.manualAliases, 'fournisseur');

      if (supplierId) {
        addedCount++;
        console.log(`   ✅ ${supplier.name} (${supplier.manualAliases.length} alias manuels)`);
      } else {
        skippedCount++;
        console.log(`   ⚠️  ${supplier.name} (déjà existant ou erreur)`);
      }
    }

    console.log('');
    console.log(`✅ ${addedCount} fournisseur(s) ajouté(s)`);
    if (skippedCount > 0) {
      console.log(`⚠️  ${skippedCount} fournisseur(s) ignoré(s)`);
    }

    // Vérification finale
    console.log('\n📋 Vérification finale...');

    // Recharger le cache supplier-aliases
    const { reloadSuppliers: reloadCache } = await import('./supplier-aliases');
    const cacheCount = reloadCache();

    console.log(`✅ Cache rechargé: ${cacheCount} fournisseur(s) en mémoire`);

    console.log('\n================================================');
    console.log('✅ RECHARGEMENT TERMINÉ AVEC SUCCÈS');
    console.log('================================================\n');

    console.log('📊 RÉSUMÉ:');
    console.log(`   • Fournisseurs supprimés: ${deletedCount}`);
    console.log(`   • Factures Billit analysées: ${invoices.length}`);
    console.log(`   • Fournisseurs depuis factures: ${uniqueSuppliers.length}`);
    console.log(`   • Fournisseurs supplémentaires: ${additionalSuppliers.length}`);
    console.log(`   • TOTAL fournisseurs ajoutés: ${addedCount}`);
    console.log(`   • Cache en mémoire: ${cacheCount}`);
    console.log('');

  } catch (error: any) {
    console.error('\n❌ ERREUR lors du rechargement des fournisseurs:');
    console.error(error.message);
    throw error;
  }
}

// Exécuter le script
if (require.main === module) {
  reloadSuppliers()
    .then(() => {
      console.log('✅ Script terminé avec succès');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Script terminé avec erreur:', error);
      process.exit(1);
    });
}

export { reloadSuppliers };
