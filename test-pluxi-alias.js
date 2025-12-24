const { matchesSupplier, getSupplierDisplayName, getSupplierPatterns, SUPPLIER_ALIASES } = require('./dist/supplier-aliases');

console.log("=== Test de l'alias 'Pluxi' ===\n");

// 1. Vérifier si pluxee existe dans les aliases
console.log("1. Fournisseur 'pluxee' dans SUPPLIER_ALIASES?");
console.log("   ", SUPPLIER_ALIASES['pluxee'] ? "✅ OUI" : "❌ NON");
if (SUPPLIER_ALIASES['pluxee']) {
  console.log("   Aliases:", SUPPLIER_ALIASES['pluxee'].aliases);
  console.log("   Patterns:", SUPPLIER_ALIASES['pluxee'].patterns);
}
console.log("");

// 2. Test de getSupplierPatterns avec "pluxi"
console.log("2. getSupplierPatterns('pluxi'):");
const patterns = getSupplierPatterns('pluxi');
console.log("   ", patterns);
console.log("");

// 3. Test de getSupplierDisplayName avec "pluxi"
console.log("3. getSupplierDisplayName('pluxi'):");
const displayName = getSupplierDisplayName('pluxi');
console.log("   ", displayName);
console.log("");

// 4. Test de matchesSupplier avec différentes descriptions et "pluxi"
console.log("4. Test matchesSupplier avec 'pluxi' comme searchTerm:");
const testDescriptions = [
  "N.V. Pluxee Belgium S.A.",
  "Pluxee Belgium",
  "NV Pluxee Belgium"
];

testDescriptions.forEach(desc => {
  const matches = matchesSupplier(desc, "pluxi");
  console.log(`   "${desc}" → ${matches ? "✅ MATCH" : "❌ NO MATCH"}`);
});
console.log("");

// 5. Test avec "Pluxee" complet
console.log("5. Test matchesSupplier avec 'pluxee' complet:");
testDescriptions.forEach(desc => {
  const matches = matchesSupplier(desc, "pluxee");
  console.log(`   "${desc}" → ${matches ? "✅ MATCH" : "❌ NO MATCH"}`);
});
