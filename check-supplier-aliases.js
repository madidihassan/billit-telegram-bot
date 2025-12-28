/**
 * Vérifier les alias de Foster et Sligro
 */

const { SUPPLIER_ALIASES } = require('./dist/supplier-aliases');

console.log('🔍 VÉRIFICATION DES ALIAS FOSTER ET SLIGRO\n');
console.log('==========================================\n');

// Foster
console.log('📦 FOSTER FAST FOOD SA:');
const foster = SUPPLIER_ALIASES['FOSTER FAST FOOD SA'];
if (foster) {
  console.log('  Aliases:', foster.aliases);
  console.log('  Patterns:', foster.patterns);
} else {
  console.log('  ❌ Non trouvé dans SUPPLIER_ALIASES');
}

console.log('\n');

// Sligro
console.log('📦 SLIGRO-MFS BELGIUM SA:');
const sligro = SUPPLIER_ALIASES['Sligro-MFS Belgium SA'];
if (sligro) {
  console.log('  Aliases:', sligro.aliases);
  console.log('  Patterns:', sligro.patterns);
} else {
  console.log('  ❌ Non trouvé dans SUPPLIER_ALIASES');
}

console.log('\n\nℹ️  Recherche avec variations...\n');

// Chercher toutes les clés contenant "foster"
console.log('Clés contenant "foster":');
Object.keys(SUPPLIER_ALIASES).forEach(key => {
  if (key.toLowerCase().includes('foster')) {
    console.log(`  - ${key}`);
  }
});

console.log('\nClés contenant "sligro":');
Object.keys(SUPPLIER_ALIASES).forEach(key => {
  if (key.toLowerCase().includes('sligro')) {
    console.log(`  - ${key}`);
  }
});
