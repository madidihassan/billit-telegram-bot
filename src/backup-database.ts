/**
 * Script de backup automatique de la base de données SQLite
 * Peut être exécuté manuellement ou via cron
 */

import * as fs from 'fs';
import * as path from 'path';
import { createBackup } from './database';

const BACKUP_DIR = path.join(__dirname, '..', 'data', 'backups');
const MAX_BACKUPS = 7; // Garder les 7 derniers backups

/**
 * Nettoyer les anciens backups (garder seulement les MAX_BACKUPS plus récents)
 */
function cleanOldBackups(): void {
  console.log('\n🧹 Nettoyage des anciens backups...');

  if (!fs.existsSync(BACKUP_DIR)) {
    console.log('⚠️  Aucun répertoire de backup trouvé');
    return;
  }

  // Lister tous les fichiers de backup
  const files = fs.readdirSync(BACKUP_DIR)
    .filter(file => file.startsWith('billit-') && file.endsWith('.db'))
    .map(file => ({
      name: file,
      path: path.join(BACKUP_DIR, file),
      mtime: fs.statSync(path.join(BACKUP_DIR, file)).mtime.getTime(),
    }))
    .sort((a, b) => b.mtime - a.mtime); // Trier du plus récent au plus ancien

  // Supprimer les fichiers au-delà de MAX_BACKUPS
  const filesToDelete = files.slice(MAX_BACKUPS);

  if (filesToDelete.length === 0) {
    console.log(`✅ Aucun backup à supprimer (${files.length} backups présents)`);
    return;
  }

  let deleted = 0;
  for (const file of filesToDelete) {
    try {
      fs.unlinkSync(file.path);
      console.log(`  🗑️  Supprimé: ${file.name}`);
      deleted++;
    } catch (error: any) {
      console.error(`  ❌ Erreur lors de la suppression de ${file.name}:`, error.message);
    }
  }

  console.log(`✅ Nettoyage terminé: ${deleted} backups supprimés, ${files.length - deleted} conservés`);
}

/**
 * Afficher les statistiques des backups
 */
function displayBackupStats(): void {
  console.log('\n📊 STATISTIQUES DES BACKUPS');
  console.log('='.repeat(60));

  if (!fs.existsSync(BACKUP_DIR)) {
    console.log('⚠️  Aucun backup trouvé');
    return;
  }

  const files = fs.readdirSync(BACKUP_DIR)
    .filter(file => file.startsWith('billit-') && file.endsWith('.db'))
    .map(file => {
      const filePath = path.join(BACKUP_DIR, file);
      const stats = fs.statSync(filePath);
      return {
        name: file,
        size: stats.size,
        date: stats.mtime,
      };
    })
    .sort((a, b) => b.date.getTime() - a.date.getTime());

  if (files.length === 0) {
    console.log('⚠️  Aucun backup trouvé');
    return;
  }

  console.log(`\n📦 Total de backups: ${files.length}`);
  console.log('\nDerniers backups:');

  files.slice(0, 5).forEach((file, index) => {
    const sizeKB = (file.size / 1024).toFixed(2);
    const dateStr = file.date.toLocaleString('fr-FR');
    console.log(`  ${index + 1}. ${file.name}`);
    console.log(`     Taille: ${sizeKB} KB | Date: ${dateStr}`);
  });

  if (files.length > 5) {
    console.log(`  ... et ${files.length - 5} autres`);
  }

  const totalSize = files.reduce((sum, f) => sum + f.size, 0);
  const totalSizeMB = (totalSize / (1024 * 1024)).toFixed(2);
  console.log(`\n💾 Taille totale: ${totalSizeMB} MB`);
  console.log('='.repeat(60));
}

/**
 * Fonction principale
 */
async function main(): Promise<void> {
  console.log('='.repeat(60));
  console.log('💾 BACKUP DE LA BASE DE DONNÉES BILLIT');
  console.log('='.repeat(60));

  try {
    // Créer le backup
    const backupPath = createBackup();
    console.log(`✅ Backup créé avec succès: ${backupPath}`);

    // Nettoyer les anciens backups
    cleanOldBackups();

    // Afficher les statistiques
    displayBackupStats();

    console.log('\n✅ Processus de backup terminé avec succès !');
  } catch (error: any) {
    console.error('❌ Erreur lors du backup:', error.message);
    process.exit(1);
  }
}

// Exécuter le backup
main();
