/**
 * Supprimer l'employé de test "Claude"
 */

import { deleteEmployeePermanently, employeeExistsByName } from './src/database';

console.log('🧹 Suppression de l\'employé de test "Claude"...');

const claude = employeeExistsByName('Claude');
if (claude) {
  const success = deleteEmployeePermanently(claude.id);
  if (success) {
    console.log(`✅ Employé "${claude.name}" (ID: ${claude.id}) supprimé`);
  } else {
    console.log(`❌ Échec de la suppression`);
  }
} else {
  console.log('✅ Aucun employé "Claude" à supprimer');
}
