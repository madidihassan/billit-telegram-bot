/**
 * Inspecter les noms d'employés dans la base de données
 */

import { getAllEmployees } from './src/database';

console.log('='.repeat(60));
console.log('👥 INSPECTION DES EMPLOYÉS');
console.log('='.repeat(60));

const employees = getAllEmployees();

console.log(`\nTotal: ${employees.length} employés\n`);

employees.forEach((emp, index) => {
  console.log(`${index + 1}. "${emp.name}"`);
  console.log(`   Position: ${emp.position || 'N/A'}`);
  console.log(`   Chat ID: ${emp.chat_id || 'N/A'}`);
  console.log('');
});

console.log('='.repeat(60));
