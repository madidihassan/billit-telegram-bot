/**
 * Fusion des employés avec le dictionnaire de fournisseurs
 */

import * as fs from 'fs';
import * as path from 'path';

const currentPath = path.join(__dirname, 'supplier-aliases.json');
const employeesPath = path.join(__dirname, 'employees-to-add.json');

const current = JSON.parse(fs.readFileSync(currentPath, 'utf-8'));
const employees = JSON.parse(fs.readFileSync(employeesPath, 'utf-8'));

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('👥 AJOUT DES EMPLOYÉS');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

console.log(`📋 Fournisseurs actuels: ${Object.keys(current).length}`);
console.log(`👥 Employés à ajouter: ${Object.keys(employees).length}\n`);

// Fusionner
const merged = { ...current, ...employees };

// Trier alphabétiquement
const sorted = Object.keys(merged)
  .sort()
  .reduce((acc, key) => {
    acc[key] = merged[key];
    return acc;
  }, {} as any);

console.log(`✅ Total après fusion: ${Object.keys(sorted).length}\n`);

// Afficher les employés ajoutés
console.log('👥 EMPLOYÉS AJOUTÉS:\n');
Object.keys(employees).forEach((key, idx) => {
  const employee = employees[key];
  console.log(`${idx + 1}. ${employee.aliases[0]}`);
});

// Sauvegarder
fs.writeFileSync(currentPath, JSON.stringify(sorted, null, 2));
console.log(`\n✅ Dictionnaire mis à jour: supplier-aliases.json`);

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`📊 RÉSUMÉ FINAL`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`Avant: ${Object.keys(current).length} entrées`);
console.log(`Après: ${Object.keys(sorted).length} entrées`);
console.log(`   🏢 Fournisseurs: ~33`);
console.log(`   👥 Employés: ${Object.keys(employees).length}`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
