// Test du matching de KBC
const { matchesSupplier, reloadSuppliers, SUPPLIER_ALIASES, getSupplierDisplayName } = require('./dist/supplier-aliases');

console.log('🔄 Rechargement du cache des fournisseurs...');
const count = reloadSuppliers();
console.log(`✅ ${count} fournisseur(s) chargé(s) en mémoire\n`);

// Obtenir tous les fournisseurs
console.log('📋 Fournisseurs contenant "KBC":');
const kbcSuppliers = Object.keys(SUPPLIER_ALIASES).filter(key => {
  const supplier = SUPPLIER_ALIASES[key];
  return key.toLowerCase().includes('kbc') ||
         supplier.aliases.some(a => a.toLowerCase().includes('kbc'));
});
console.log(kbcSuppliers.map(key => `${key} (${SUPPLIER_ALIASES[key].aliases.length} alias)`));

// Afficher les alias de KBC
if (kbcSuppliers.length > 0) {
  kbcSuppliers.forEach(key => {
    const supplier = SUPPLIER_ALIASES[key];
    console.log(`  Alias de "${key}":`);
    console.log(`    ${supplier.aliases.join(', ')}`);
  });
}
console.log('');

// Tester le matching
const testQueries = ['kbc', 'KBC', 'kbc bank', 'KBC Bank SA', 'recouvrement européen kbc'];

console.log('🧪 Tests de matching:');
testQueries.forEach(query => {
  const match = matchesSupplier('RECOUVREMENT EUROPÉEN KBC BANK NV 0001', query);
  console.log(`  "${query}" → ${match ? '✅ MATCH' : '❌ NO MATCH'}`);
});

console.log('\n🧪 Test avec descriptions de transactions:');
const txDescriptions = [
  'RECOUVREMENT EUROPÉEN KBC BANK NV 0001 0001 BE',
  'KBC Bank SA',
  'kbc brussels'
];

txDescriptions.forEach(desc => {
  const match = matchesSupplier(desc, 'kbc');
  console.log(`  "${desc}" + "kbc" → ${match ? '✅ MATCH' : '❌ NO MATCH'}`);
});
