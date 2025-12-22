/**
 * Fusion des nouveaux fournisseurs avec le dictionnaire existant
 */

import * as fs from 'fs';
import * as path from 'path';

const currentPath = path.join(__dirname, 'supplier-aliases.json');
const newPath = path.join(__dirname, 'new-suppliers-to-add.json');

const current = JSON.parse(fs.readFileSync(currentPath, 'utf-8'));
const newSuppliers = JSON.parse(fs.readFileSync(newPath, 'utf-8'));

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🔄 FUSION DES FOURNISSEURS');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

console.log(`📋 Fournisseurs actuels: ${Object.keys(current).length}`);
console.log(`🆕 Nouveaux fournisseurs: ${Object.keys(newSuppliers).length}\n`);

// Fusionner
const merged = { ...current, ...newSuppliers };

// Trier alphabétiquement
const sorted = Object.keys(merged)
  .sort()
  .reduce((acc, key) => {
    acc[key] = merged[key];
    return acc;
  }, {} as any);

console.log(`✅ Total après fusion: ${Object.keys(sorted).length}\n`);

// Afficher les nouveaux
console.log('🆕 Nouveaux fournisseurs ajoutés:\n');
Object.keys(newSuppliers).forEach((key, idx) => {
  const supplier = newSuppliers[key];
  console.log(`${idx + 1}. ${supplier.aliases[0]}`);
});

// Sauvegarder
const backupPath = path.join(__dirname, 'supplier-aliases.backup.json');
fs.writeFileSync(backupPath, JSON.stringify(current, null, 2));
console.log(`\n💾 Sauvegarde créée: supplier-aliases.backup.json`);

fs.writeFileSync(currentPath, JSON.stringify(sorted, null, 2));
console.log(`✅ Dictionnaire mis à jour: supplier-aliases.json`);

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`📊 RÉSUMÉ`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`Avant: ${Object.keys(current).length} fournisseurs`);
console.log(`Après: ${Object.keys(sorted).length} fournisseurs`);
console.log(`Ajoutés: ${Object.keys(newSuppliers).length} nouveaux`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
