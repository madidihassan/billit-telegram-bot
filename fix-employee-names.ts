/**
 * Script pour corriger le formatage des noms d'employés
 */

import db from './src/database';

console.log('='.repeat(60));
console.log('🔧 CORRECTION DES NOMS D\'EMPLOYÉS');
console.log('='.repeat(60));

// Mapping manuel des noms mal formatés vers les noms corrects
const nameCorrections: Record<string, string> = {
  'Aboukhalid': 'Abou Khalid',
  'Afkir': 'Afkir',
  'Azzabi': 'Azzabi',
  'Barilyagoubi': 'Barily Agoubi',
  'Benyamoune': 'Ben Yamoune',
  'Elbalghiti': 'El Balghiti',
  'Elbarnoussi': 'El Barnoussi',
  'Eljaouhari': 'El Jaouhari',
  'Ellallaouiyasmina': 'Yasmina El Lalaoui',
  'Ellalouimohamed': 'Mohamed El Lalaoui',
  'Elmouden': 'El Mouden',
  'Krimfatima': 'Fatima Krim',
  'Madidihassan': 'Hassan Madidi',
  'Madidijawad': 'Jawad Madidi',
  'Madidisoufiane': 'Soufiane Madidi',
  'Mahjoub': 'Mahjoub',
  'Mrabet': 'Mrabet',
  'Ourimchi': 'Ourimchi',
  'Qibouz': 'Qibouz',
  'Satti': 'Satti',
  'Zamounlamya': 'Lamya Zamoun',
  'Kharbouche': 'Kharbouche',
};

console.log('\n📋 Noms à corriger:\n');

const employees = db.prepare('SELECT * FROM employees WHERE is_active = 1').all() as any[];

let correctedCount = 0;
let skippedCount = 0;

for (const emp of employees) {
  const currentName = emp.name;
  const correctedName = nameCorrections[currentName];

  if (correctedName && correctedName !== currentName) {
    console.log(`${correctedCount + 1}. "${currentName}" → "${correctedName}"`);

    try {
      db.prepare('UPDATE employees SET name = ? WHERE id = ?').run(correctedName, emp.id);
      correctedCount++;
    } catch (error: any) {
      console.log(`   ❌ Erreur: ${error.message}`);
    }
  } else if (!correctedName) {
    // Le nom est déjà bien formaté
    console.log(`✓ "${currentName}" (déjà correct)`);
    skippedCount++;
  }
}

console.log('\n' + '='.repeat(60));
console.log(`✅ ${correctedCount} noms corrigés`);
console.log(`✓ ${skippedCount} noms déjà corrects`);
console.log('='.repeat(60));
