/**
 * Supprimer les employés en double
 */

import db, { deleteEmployeePermanently } from './src/database';

console.log('='.repeat(60));
console.log('🗑️  SUPPRESSION DES DOUBLONS');
console.log('='.repeat(60));

// Liste des doublons à supprimer (IDs des mauvaises versions)
const duplicatesToRemove = [
  'Madidihassan',  // Doublon de "Hassan Madidi"
  'Madidisoufiane', // Doublon de "Soufiane Madidi"
];

console.log('\n📋 Doublons à supprimer:\n');

for (const name of duplicatesToRemove) {
  const emp = db.prepare('SELECT * FROM employees WHERE name = ? AND is_active = 1').get(name) as any;

  if (emp) {
    console.log(`🗑️  "${emp.name}" (ID: ${emp.id})`);
    const success = deleteEmployeePermanently(emp.id);

    if (success) {
      console.log(`   ✅ Supprimé`);
    } else {
      console.log(`   ❌ Échec`);
    }
  } else {
    console.log(`✓ "${name}" n'existe pas ou est déjà supprimé`);
  }
  console.log('');
}

console.log('='.repeat(60));
console.log('✅ Nettoyage des doublons terminé');
console.log('='.repeat(60));
