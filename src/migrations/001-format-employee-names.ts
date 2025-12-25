/**
 * Migration: Correction du formatage des noms d'employés
 * Ajoute des espaces dans les noms mal formatés
 */

import db from '../database';

export function migrate(): void {
  console.log('🔄 Migration: Formatage des noms d\'employés...');

  // Mapping des noms mal formatés vers les noms corrects
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

  const employees = db.prepare('SELECT * FROM employees WHERE is_active = 1').all() as any[];
  let correctedCount = 0;

  for (const emp of employees) {
    const currentName = emp.name;
    const correctedName = nameCorrections[currentName];

    if (correctedName && correctedName !== currentName) {
      try {
        // Vérifier si le nom corrigé existe déjà (pour éviter les doublons)
        const existing = db.prepare('SELECT * FROM employees WHERE name = ?').get(correctedName);

        if (existing) {
          console.log(`   ⚠️  Doublon détecté: "${currentName}" vs "${correctedName}" - Suppression du doublon`);
          db.prepare('DELETE FROM employees WHERE id = ?').run(emp.id);
        } else {
          db.prepare('UPDATE employees SET name = ? WHERE id = ?').run(correctedName, emp.id);
          correctedCount++;
        }
      } catch (error: any) {
        console.log(`   ❌ Erreur pour "${currentName}": ${error.message}`);
      }
    }
  }

  console.log(`✅ ${correctedCount} nom(s) corrigé(s)`);
}

// Exécuter si appelé directement
if (require.main === module) {
  migrate();
}
