/**
 * Vérifier TOUS les fournisseurs et leurs alias pour détecter les problèmes potentiels
 */

const { SUPPLIER_ALIASES } = require('./dist/supplier-aliases');

// Mots génériques connus pour causer des problèmes
const PROBLEMATIC_WORDS = new Set([
  'belgium', 'belgian', 'belgi', 'belgië', 'belgique',
  'sa', 'srl', 'nv', 'bvba', 'sprl',
  'fast', 'food', 'pack', 'eats',
  'europacific', 'partners', 'europe',
  'services', 'service', 'group', 'company'
]);

// Mots trop courts (généralement problématiques)
const MIN_ALIAS_LENGTH = 4;

console.log('🔍 VÉRIFICATION DE TOUS LES ALIAS FOURNISSEURS\n');
console.log('==============================================\n');

const suppliers = Object.entries(SUPPLIER_ALIASES);
console.log(`Total fournisseurs: ${suppliers.length}\n`);

let issuesFound = 0;
const problematicSuppliers = [];

suppliers.forEach(([name, supplier], index) => {
  const aliases = supplier.aliases || [];
  const patterns = supplier.patterns || [];

  // Identifier les alias problématiques
  const problematicAliases = aliases.filter(alias => {
    const normalized = alias.toLowerCase().trim();

    // Vérifier si c'est un mot problématique connu
    if (PROBLEMATIC_WORDS.has(normalized)) {
      return true;
    }

    // Vérifier si trop court (sauf si c'est le nom complet)
    if (normalized.length < MIN_ALIAS_LENGTH && normalized !== name.toLowerCase()) {
      return true;
    }

    return false;
  });

  if (problematicAliases.length > 0) {
    issuesFound++;
    problematicSuppliers.push({
      name,
      aliases,
      problematic: problematicAliases
    });

    console.log(`⚠️  ${index + 1}. ${name}`);
    console.log(`   Total aliases: ${aliases.length}`);
    console.log(`   ❌ Alias problématiques: ${problematicAliases.join(', ')}`);
    console.log(`   ✅ Alias OK: ${aliases.filter(a => !problematicAliases.includes(a)).join(', ')}`);
    console.log('');
  }
});

console.log('\n================================================');
console.log('📊 RÉSUMÉ DE LA VÉRIFICATION');
console.log('================================================\n');

if (issuesFound === 0) {
  console.log('✅ Tous les fournisseurs ont des alias corrects !');
  console.log('   Aucun alias problématique détecté.');
} else {
  console.log(`⚠️  ${issuesFound} fournisseur(s) ont des alias potentiellement problématiques\n`);

  console.log('📝 RECOMMANDATIONS:\n');
  console.log('Les fournisseurs suivants devraient être ajoutés à la liste manuelle');
  console.log('dans src/reload-suppliers.ts avec des alias spécifiques:\n');

  problematicSuppliers.forEach(supplier => {
    console.log(`  • ${supplier.name}`);
    console.log(`    Aliases à retirer: ${supplier.problematic.join(', ')}`);
    console.log(`    Aliases à garder: ${supplier.aliases.filter(a => !supplier.problematic.includes(a)).join(', ')}`);
    console.log('');
  });
}

console.log('\n💡 CRITÈRES DE VÉRIFICATION:');
console.log('   - Mots génériques connus (belgium, fast, food, pack, eats, etc.)');
console.log('   - Alias trop courts (< 4 caractères)');
console.log('   - Formes juridiques (SA, SRL, NV, BVBA, SPRL)');
console.log('\n');
