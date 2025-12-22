/**
 * Test de la fonctionnalité de liste des fournisseurs depuis le dictionnaire
 */

import { SUPPLIER_ALIASES, getSupplierDisplayName } from './src/supplier-aliases';

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📋 TEST - LISTE DES FOURNISSEURS');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// Récupérer les fournisseurs depuis le dictionnaire
const suppliers = Object.entries(SUPPLIER_ALIASES);

console.log(`✓ ${suppliers.length} fournisseur(s) trouvé(s) dans le dictionnaire\n`);

// Trier par ordre alphabétique du premier alias
const sortedSuppliers = suppliers.sort((a, b) => {
  const nameA = a[1].aliases[0].toLowerCase();
  const nameB = b[1].aliases[0].toLowerCase();
  return nameA.localeCompare(nameB);
});

// Afficher chaque fournisseur
sortedSuppliers.forEach(([key, supplier], idx) => {
  // Nom principal (premier alias avec capitalization)
  const mainName = getSupplierDisplayName(supplier.aliases[0]);

  console.log(`${idx + 1}. ${mainName}`);

  // Afficher les autres aliases s'il y en a
  if (supplier.aliases.length > 1) {
    const otherAliases = supplier.aliases.slice(1).join(', ');
    console.log(`   🏷️  Alias: ${otherAliases}`);
  }

  // Afficher les patterns
  if (supplier.patterns && supplier.patterns.length > 0) {
    console.log(`   🔍 Patterns: ${supplier.patterns.join(', ')}`);
  }

  console.log('');
});

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`📊 Total: ${sortedSuppliers.length} fournisseur(s)`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
