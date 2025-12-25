/**
 * Script de migration des données vers SQLite
 * Migre les utilisateurs depuis .env et les fournisseurs depuis supplier-aliases.json
 */

import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import {
  addAuthorizedUser,
  addSupplier,
  addEmployee,
  getAllAuthorizedUsers,
  getAllSuppliers,
} from './database';

// Charger les variables d'environnement
dotenv.config();

/**
 * Migrer les utilisateurs depuis .env
 */
function migrateUsers(): void {
  console.log('\n🔄 Migration des utilisateurs depuis .env...');

  const allowedChatIds = process.env.TELEGRAM_ALLOWED_CHAT_IDS || '';
  const chatIds = allowedChatIds.split(',').map(id => id.trim()).filter(id => id.length > 0);

  // Mapping des noms connus
  const knownUsers: { [key: string]: { username: string; role: 'owner' | 'admin' | 'user' } } = {
    '7887749968': { username: 'Hassan', role: 'owner' },
    '8006682970': { username: 'Soufiane', role: 'user' },
  };

  let added = 0;
  let skipped = 0;

  for (const chatId of chatIds) {
    const userInfo = knownUsers[chatId] || { username: 'Inconnu', role: 'user' as const };

    const success = addAuthorizedUser(
      chatId,
      userInfo.username,
      userInfo.role,
      'migration'
    );

    if (success) {
      console.log(`  ✅ Ajouté: ${chatId} (${userInfo.username})`);
      added++;
    } else {
      console.log(`  ⚠️  Déjà existant: ${chatId}`);
      skipped++;
    }
  }

  console.log(`✅ Migration utilisateurs terminée: ${added} ajoutés, ${skipped} ignorés`);
}

/**
 * Migrer les fournisseurs depuis supplier-aliases.json
 */
function migrateSuppliers(): void {
  console.log('\n🔄 Migration des fournisseurs depuis supplier-aliases.json...');

  const suppliersPath = path.join(__dirname, '..', 'supplier-aliases.json');

  if (!fs.existsSync(suppliersPath)) {
    console.log('⚠️  Fichier supplier-aliases.json non trouvé, migration ignorée');
    return;
  }

  const suppliersData = JSON.parse(fs.readFileSync(suppliersPath, 'utf-8'));

  let added = 0;
  let skipped = 0;

  for (const [supplierKey, supplierInfo] of Object.entries(suppliersData)) {
    const info = supplierInfo as { aliases: string[]; patterns: string[] };

    // La clé est le nom du fournisseur (ex: "aboukhalid", "amazon marketplace")
    const supplierName = supplierKey;

    // Combiner les alias et patterns pour une recherche complète, puis dédupliquer
    const allAliases = [...new Set([...(info.aliases || []), ...(info.patterns || [])])];

    const supplierId = addSupplier(supplierName, allAliases, 'fournisseur');

    if (supplierId) {
      console.log(`  ✅ Ajouté: ${supplierName} (${allAliases.length} alias)`);
      added++;
    } else {
      console.log(`  ⚠️  Déjà existant: ${supplierName}`);
      skipped++;
    }
  }

  console.log(`✅ Migration fournisseurs terminée: ${added} ajoutés, ${skipped} ignorés`);
}

/**
 * Migrer les employés connus
 */
function migrateEmployees(): void {
  console.log('\n🔄 Migration des employés connus...');

  const knownEmployees = [
    { name: 'Hassan Madidi', chat_id: '7887749968', position: 'Propriétaire' },
    { name: 'Soufiane Madidi', chat_id: '8006682970', position: 'Employé' },
    { name: 'Jamhoun Mokhlis', chat_id: null, position: 'Employé' },
  ];

  let added = 0;

  for (const emp of knownEmployees) {
    const empId = addEmployee(emp.name, emp.chat_id, emp.position);

    if (empId) {
      console.log(`  ✅ Ajouté: ${emp.name} (${emp.position})`);
      added++;
    } else {
      console.log(`  ⚠️  Déjà existant: ${emp.name}`);
    }
  }

  console.log(`✅ Migration employés terminée: ${added} ajoutés`);
}

/**
 * Afficher un résumé de la migration
 */
function displaySummary(): void {
  console.log('\n' + '='.repeat(60));
  console.log('📊 RÉSUMÉ DE LA MIGRATION');
  console.log('='.repeat(60));

  const users = getAllAuthorizedUsers();
  console.log(`\n👥 Utilisateurs autorisés: ${users.length}`);
  users.forEach(user => {
    console.log(`  - ${user.chat_id} (${user.username || 'Inconnu'}) [${user.role}]`);
  });

  const suppliers = getAllSuppliers();
  console.log(`\n📦 Fournisseurs: ${suppliers.length}`);
  suppliers.slice(0, 10).forEach(supplier => {
    console.log(`  - ${supplier.name}`);
  });
  if (suppliers.length > 10) {
    console.log(`  ... et ${suppliers.length - 10} autres`);
  }

  console.log('\n' + '='.repeat(60));
  console.log('✅ Migration terminée avec succès !');
  console.log('='.repeat(60) + '\n');
}

/**
 * Fonction principale de migration
 */
async function main(): Promise<void> {
  console.log('='.repeat(60));
  console.log('🚀 DÉMARRAGE DE LA MIGRATION VERS SQLITE');
  console.log('='.repeat(60));

  try {
    migrateUsers();
    migrateSuppliers();
    migrateEmployees();
    displaySummary();
  } catch (error) {
    console.error('❌ Erreur lors de la migration:', error);
    process.exit(1);
  }
}

// Exécuter la migration
main();
