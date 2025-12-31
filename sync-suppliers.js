/**
 * Script pour synchroniser les fournisseurs de tonton202 vers mustfood
 * Garde les employés de mustfood intacts
 */

const Database = require('better-sqlite3');

const tontonDB = new Database('/home/ubuntu/Billit/tonton202/data/billit.db');
const mustfoodDB = new Database('/home/ubuntu/Billit/mustfood/data/billit.db');

console.log('🔄 Synchronisation des fournisseurs tonton202 → mustfood\n');

// 1. Compter les employés de mustfood (pour vérification après)
console.log('📋 Vérification des employés de mustfood...');
const mustfoodEmployees = mustfoodDB.prepare('SELECT COUNT(*) as count FROM employees').get();
console.log(`  ✓ ${mustfoodEmployees.count} employé(s) dans mustfood`);

// 2. Supprimer UNIQUEMENT les fournisseurs de mustfood (pas les employés)
console.log('\n🗑️  Suppression des anciens fournisseurs...');
mustfoodDB.prepare('DELETE FROM supplier_aliases').run();
mustfoodDB.prepare('DELETE FROM suppliers').run();
console.log('  ✓ Fournisseurs supprimés');

// 3. Copier les fournisseurs de tonton202
console.log('\n📥 Copie des fournisseurs de tonton202...');
const tontonSuppliers = tontonDB.prepare('SELECT * FROM suppliers').all();
const tontonAliases = tontonDB.prepare('SELECT * FROM supplier_aliases').all();

const insertSupplier = mustfoodDB.prepare(`
  INSERT INTO suppliers (id, name, type, is_active, created_at)
  VALUES (?, ?, ?, ?, ?)
`);

const insertAlias = mustfoodDB.prepare(`
  INSERT INTO supplier_aliases (supplier_id, alias, created_at)
  VALUES (?, ?, ?)
`);

tontonSuppliers.forEach(s => {
  insertSupplier.run(s.id, s.name, s.type, s.is_active, s.created_at);
});

tontonAliases.forEach(a => {
  insertAlias.run(a.supplier_id, a.alias, a.created_at);
});

console.log(`  ✓ ${tontonSuppliers.length} fournisseur(s) copié(s)`);
console.log(`  ✓ ${tontonAliases.length} alias copié(s)`);

// 4. Vérifier que les employés sont toujours là
const checkEmployees = mustfoodDB.prepare('SELECT COUNT(*) as count FROM employees').get();
console.log(`\n✅ Vérification : ${checkEmployees.count} employé(s) dans mustfood (inchangé)`);

tontonDB.close();
mustfoodDB.close();

console.log('\n✅ Synchronisation terminée !');
console.log('\n📊 Résumé :');
console.log(`  • Fournisseurs : ${tontonSuppliers.length} (copiés de tonton202)`);
console.log(`  • Employés : ${checkEmployees.count} (conservés de mustfood)`);
