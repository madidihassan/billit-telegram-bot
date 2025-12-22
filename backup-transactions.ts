#!/usr/bin/env ts-node
/**
 * Script de backup des transactions bancaires
 * À exécuter régulièrement pour conserver l'historique complet
 */

import { BankClient } from './src/bank-client';
import * as fs from 'fs';
import * as path from 'path';

async function backupTransactions() {
  console.log('💾 BACKUP DES TRANSACTIONS BANCAIRES\n');
  console.log('='.repeat(70));

  const bankClient = new BankClient();
  const backupDir = path.join(__dirname, 'backups');
  
  // Créer le dossier backups s'il n'existe pas
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir);
    console.log('✓ Dossier backups/ créé');
  }

  try {
    // Récupérer les 3 derniers mois (maximum disponible)
    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - 3);

    console.log(`📅 Période: ${startDate.toLocaleDateString('fr-BE')} - ${endDate.toLocaleDateString('fr-BE')}\n`);

    const transactions = await bankClient.getTransactionsByPeriod(startDate, endDate);
    console.log(`✓ ${transactions.length} transactions récupérées\n`);

    // Nom du fichier avec date
    const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const filename = `transactions_${timestamp}.json`;
    const filepath = path.join(backupDir, filename);

    // Sauvegarder
    fs.writeFileSync(filepath, JSON.stringify(transactions, null, 2), 'utf-8');

    console.log(`✓ Backup sauvegardé: ${filename}`);
    console.log(`   Chemin: ${filepath}`);
    console.log(`   Taille: ${(fs.statSync(filepath).size / 1024).toFixed(2)} KB`);

    // Garder seulement les 30 derniers backups
    const files = fs.readdirSync(backupDir)
      .filter(f => f.startsWith('transactions_') && f.endsWith('.json'))
      .sort()
      .reverse();

    if (files.length > 30) {
      const toDelete = files.slice(30);
      toDelete.forEach(file => {
        fs.unlinkSync(path.join(backupDir, file));
        console.log(`🗑️  Ancien backup supprimé: ${file}`);
      });
    }

    console.log('\n' + '='.repeat(70));
    console.log('✅ Backup terminé avec succès !');
    console.log('='.repeat(70));

  } catch (error: any) {
    console.error('❌ Erreur:', error.message);
  }
}

backupTransactions().catch(console.error);
