/**
 * Test du système d'aliases pour les fournisseurs
 */

import { 
  getSupplierPatterns, 
  matchesSupplier, 
  getSupplierDisplayName,
  normalizeSearchTerm 
} from './src/supplier-aliases';

console.log('🧪 TEST SYSTÈME D\'ALIASES\n');
console.log('='.repeat(70));

// Test 1: Normalisation
console.log('\n📝 TEST 1: Normalisation');
console.log('-'.repeat(70));
const testCases = [
  'Eden Red',
  'EDENRED',
  'eden-red',
  'Eden_Red',
  'Foster',
  'foster fast food',
  'Collibry'
];

testCases.forEach(term => {
  console.log(`"${term}" → "${normalizeSearchTerm(term)}"`);
});

// Test 2: Patterns de recherche
console.log('\n\n🔍 TEST 2: Patterns de recherche');
console.log('-'.repeat(70));
const suppliers = ['Eden Red', 'Foster', 'Collibry', 'Unknown Supplier'];

suppliers.forEach(supplier => {
  const patterns = getSupplierPatterns(supplier);
  console.log(`"${supplier}" → Patterns: [${patterns.join(', ')}]`);
});

// Test 3: Correspondance avec descriptions
console.log('\n\n✅ TEST 3: Correspondance avec descriptions réelles');
console.log('-'.repeat(70));

const descriptions = [
  'EDENRED BELGIUM SA/NV 31347257 629914ETR171225',
  'VIREMENT EN FAVEUR DE foster fast food BE51230053829562',
  'VIREMENT PAR COLLIBRY BV BE77736040514742',
  'VISA-UID: 149028 01 DD. 2025-nov-28 BRUT',
  'MC-UID: 149028 01 DD. 2025-oct-31'
];

const searchTerms = [
  'Eden Red',
  'eden',
  'Foster',
  'foster fast food',
  'Collibry',
  'colibri'
];

searchTerms.forEach(term => {
  console.log(`\n🔎 Recherche: "${term}"`);
  descriptions.forEach(desc => {
    const matches = matchesSupplier(desc, term);
    if (matches) {
      console.log(`  ✅ ${desc.substring(0, 60)}...`);
    }
  });
});

// Test 4: Noms d'affichage
console.log('\n\n💼 TEST 4: Noms d\'affichage');
console.log('-'.repeat(70));

const inputNames = [
  'eden red',
  'EDEN RED',
  'Eden_Red',
  'foster',
  'FOSTER FAST FOOD',
  'collibry',
  'ticket restaurant',
  'Unknown Supplier'
];

inputNames.forEach(name => {
  const displayName = getSupplierDisplayName(name);
  console.log(`"${name}" → "${displayName}"`);
});

console.log('\n\n' + '='.repeat(70));
console.log('✅ Tests terminés !');
