/**
 * Test de la liste des employés
 */

import { SUPPLIER_ALIASES, getSupplierDisplayName } from './src/supplier-aliases';

// Liste des employés
const EMPLOYEE_KEYS = [
  'kalidechami', 'zamounlamya', 'elbarnoussi', 'krimfatima', 'mahjoub',
  'eljaouhari', 'azzabi', 'aboukhalid', 'elbalghiti', 'ourimchi',
  'benyamoune', 'kharbouche', 'afkir', 'ellalouimohamed', 'madidijawad',
  'samat', 'barilyagoubi', 'taglina', 'turbatu', 'qibouz', 'mrabet',
  'madidihassan', 'elmouden', 'satti', 'jamhounmokhlis'
];

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('👥 TEST - LISTE DES EMPLOYÉS');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// Filtrer uniquement les employés depuis le dictionnaire
const allSuppliers = Object.entries(SUPPLIER_ALIASES);
const employees = allSuppliers.filter(([key]) => EMPLOYEE_KEYS.includes(key));

console.log(`📊 Total dans dictionnaire: ${allSuppliers.length}`);
console.log(`👥 Employés trouvés: ${employees.length}\n`);

// Trier par ordre alphabétique
const sortedEmployees = employees.sort((a, b) => {
  const nameA = a[1].aliases[0].toLowerCase();
  const nameB = b[1].aliases[0].toLowerCase();
  return nameA.localeCompare(nameB);
});

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('👥 LISTE DES EMPLOYÉS');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

sortedEmployees.forEach(([key, employee], idx) => {
  const mainName = getSupplierDisplayName(employee.aliases[0]);

  console.log(`${idx + 1}. ${mainName}`);

  // Afficher les autres aliases s'il y en a
  if (employee.aliases.length > 1) {
    const otherAliases = employee.aliases.slice(1).join(', ');
    console.log(`   🏷️  Alias: ${otherAliases}`);
  }
  console.log('');
});

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`📊 Total: ${sortedEmployees.length} employé(s)`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
