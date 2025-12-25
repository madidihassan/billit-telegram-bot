/**
 * Script pour corriger la BD : déplacer les employés de suppliers vers employees
 */

import { getAllSuppliers, removeSupplier, addEmployee, findSupplierByNameOrAlias } from './database';

console.log('='.repeat(60));
console.log('🔧 CORRECTION DE LA BASE DE DONNÉES');
console.log('Déplacement des employés vers la table employees');
console.log('='.repeat(60));

// Liste des noms qui sont des employés (pas des fournisseurs)
const employeeNames = [
  'aboukhalid',
  'afkir',
  'azzabi',
  'barilyagoubi',
  'benyamoune',
  'elbalghiti',
  'elbarnoussi',
  'eljaouhari',
  'ellallaouiyasmina',
  'ellalouimohamed',
  'elmouden',
  'jamhounmokhlis',
  'kalidechami',
  'kharbouche',
  'krimfatima',
  'madidihassan',
  'madidijawad',
  'madidisoufiane',
  'mahjoub',
  'mrabet',
  'ourimchi',
  'qibouz',
  'samat',
  'satti',
  'zamounlamya'
];

console.log(`\n📋 Employés à déplacer: ${employeeNames.length}\n`);

let moved = 0;
let errors = 0;

for (const name of employeeNames) {
  try {
    // Trouver le fournisseur
    const supplier = findSupplierByNameOrAlias(name);

    if (!supplier) {
      console.log(`  ⚠️  Non trouvé: ${name}`);
      errors++;
      continue;
    }

    // Formater le nom pour l'employé (capitaliser)
    const employeeName = name
      .split(/(?=[A-Z])|[\s\-_]/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');

    // Ajouter comme employé
    const empId = addEmployee(employeeName, null, 'Employé');

    if (empId) {
      // Supprimer de suppliers
      const removed = removeSupplier(supplier.id);

      if (removed) {
        console.log(`  ✅ ${name} → Déplacé vers employees (${employeeName})`);
        moved++;
      } else {
        console.log(`  ⚠️  ${name} → Ajouté aux employees mais échec suppression de suppliers`);
      }
    } else {
      console.log(`  ⚠️  ${name} → Échec d'ajout aux employees (peut-être déjà existant)`);
    }
  } catch (error: any) {
    console.error(`  ❌ ${name} → Erreur: ${error.message}`);
    errors++;
  }
}

console.log('\n' + '='.repeat(60));
console.log('📊 RÉSUMÉ');
console.log('='.repeat(60));
console.log(`✅ Déplacés: ${moved}`);
console.log(`⚠️  Erreurs: ${errors}`);

// Afficher le résultat final
const suppliers = getAllSuppliers();
console.log(`\n📦 Fournisseurs restants: ${suppliers.length}`);

console.log('\n✅ Correction terminée !');
console.log('='.repeat(60));
