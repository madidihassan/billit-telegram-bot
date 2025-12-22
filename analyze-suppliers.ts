#!/usr/bin/env ts-node
/**
 * Analyse toutes les transactions bancaires pour identifier les fournisseurs
 * et les ajouter automatiquement au dictionnaire
 */

import { BankClient } from './src/bank-client';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query: string): Promise<string> {
  return new Promise(resolve => rl.question(query, resolve));
}

interface SupplierCandidate {
  pattern: string;
  count: number;
  totalAmount: number;
  isCredit: boolean;
  examples: string[];
}

/**
 * Extrait le nom du fournisseur d'une description de transaction
 */
function extractSupplierName(description: string): string | null {
  // Patterns courants dans les transactions
  const patterns = [
    // "VIREMENT EN FAVEUR DE [fournisseur]"
    /VIREMENT EN FAVEUR DE\s+([A-Za-z0-9\s]+?)(?:\s+BE\d|$)/i,
    // "VIREMENT PAR [fournisseur]"
    /VIREMENT PAR\s+([A-Za-z0-9\s]+?)(?:\s+BE\d|$)/i,
    // "[Nom] SA/NV" ou "[Nom] BELGIUM"
    /^([A-Za-z0-9\s]+?)\s+(?:SA\/NV|BELGIUM|BV|NV)/i,
    // Paiement carte (moins fiable)
    /Paiement\s+(?:Bancontact|Debit|Mastercard)\s+(.+?)(?:\s+\d{2}\/\d{2}|$)/i,
  ];

  for (const pattern of patterns) {
    const match = description.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }

  return null;
}

/**
 * Normalise un nom de fournisseur pour créer une clé
 */
function normalizeKey(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
    .substring(0, 20); // Limiter la longueur
}

/**
 * Normalise pour créer un pattern de recherche
 */
function normalizePattern(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s\-_\.\/\\]/g, '');
}

async function analyzeSuppliers() {
  console.log('🔍 ANALYSE DES TRANSACTIONS BANCAIRES\n');
  console.log('='.repeat(70));

  const bankClient = new BankClient();
  
  // Demander la période d'analyse
  console.log('\n📅 Période d\'analyse:');
  console.log('1. Dernier mois');
  console.log('2. 3 derniers mois');
  console.log('3. 6 derniers mois');
  console.log('4. Depuis le début (toutes les transactions disponibles)');
  
  const choice = await question('\nVotre choix (1-4): ');
  
  let startDate: Date;
  const endDate = new Date();
  
  switch (choice) {
    case '1':
      startDate = new Date();
      startDate.setMonth(startDate.getMonth() - 1);
      break;
    case '2':
      startDate = new Date();
      startDate.setMonth(startDate.getMonth() - 3);
      break;
    case '3':
      startDate = new Date();
      startDate.setMonth(startDate.getMonth() - 6);
      break;
    case '4':
      startDate = new Date('2024-01-01'); // Début arbitraire
      break;
    default:
      console.log('❌ Choix invalide');
      rl.close();
      return;
  }

  console.log(`\n🔄 Récupération des transactions depuis ${startDate.toLocaleDateString('fr-BE')}...\n`);

  try {
    const transactions = await bankClient.getTransactionsByPeriod(startDate, endDate);
    console.log(`✓ ${transactions.length} transaction(s) récupérée(s)\n`);

    // Analyser les transactions
    const suppliers = new Map<string, SupplierCandidate>();

    transactions.forEach(tx => {
      const supplierName = extractSupplierName(tx.description);
      
      if (supplierName && supplierName.length > 3) { // Ignorer les noms trop courts
        const key = normalizeKey(supplierName);
        
        if (!suppliers.has(key)) {
          suppliers.set(key, {
            pattern: normalizePattern(supplierName),
            count: 0,
            totalAmount: 0,
            isCredit: tx.type === 'Credit',
            examples: []
          });
        }

        const candidate = suppliers.get(key)!;
        candidate.count++;
        candidate.totalAmount += Math.abs(tx.amount);
        
        // Garder quelques exemples de descriptions
        if (candidate.examples.length < 3) {
          candidate.examples.push(tx.description.substring(0, 60));
        }
      }
    });

    // Filtrer les fournisseurs récurrents (au moins 2 transactions)
    const recurringSuppliers = Array.from(suppliers.entries())
      .filter(([_, data]) => data.count >= 2)
      .sort((a, b) => b[1].count - a[1].count);

    console.log('📊 FOURNISSEURS IDENTIFIÉS\n');
    console.log('='.repeat(70));
    console.log(`✓ ${recurringSuppliers.length} fournisseur(s) récurrent(s) trouvé(s)\n`);

    if (recurringSuppliers.length === 0) {
      console.log('❌ Aucun fournisseur récurrent identifié');
      rl.close();
      return;
    }

    // Afficher les candidats
    recurringSuppliers.forEach(([key, data], idx) => {
      const emoji = data.isCredit ? '💵' : '💸';
      const type = data.isCredit ? 'Rentrée' : 'Sortie';
      
      console.log(`${idx + 1}. ${emoji} ${key.toUpperCase()}`);
      console.log(`   ${type} | ${data.count} transaction(s) | ${data.totalAmount.toFixed(2)} €`);
      console.log(`   Pattern: ${data.pattern}`);
      console.log(`   Exemple: ${data.examples[0]}`);
      console.log('');
    });

    // Demander confirmation
    console.log('='.repeat(70));
    const confirm = await question('\n💾 Voulez-vous ajouter ces fournisseurs au dictionnaire ? (y/n): ');
    
    if (confirm.toLowerCase() !== 'y') {
      console.log('❌ Opération annulée');
      rl.close();
      return;
    }

    // Charger le dictionnaire existant
    const aliasesPath = path.join(__dirname, 'supplier-aliases.json');
    let existingSuppliers: any = {};
    
    if (fs.existsSync(aliasesPath)) {
      const content = fs.readFileSync(aliasesPath, 'utf-8');
      existingSuppliers = JSON.parse(content);
    }

    let addedCount = 0;
    let skippedCount = 0;

    // Ajouter les nouveaux fournisseurs
    for (const [key, data] of recurringSuppliers) {
      if (existingSuppliers[key]) {
        console.log(`⏭️  Ignoré: ${key} (déjà existant)`);
        skippedCount++;
        continue;
      }

      // Créer les aliases
      const aliases = [key];
      
      // Ajouter des variantes si le nom contient plusieurs mots
      const words = key.match(/[a-z]+/g);
      if (words && words.length > 1) {
        // Ajouter le nom complet avec espaces
        aliases.push(words.join(' '));
      }

      existingSuppliers[key] = {
        aliases: aliases,
        patterns: [data.pattern]
      };

      console.log(`✅ Ajouté: ${key}`);
      addedCount++;
    }

    // Sauvegarder
    fs.writeFileSync(aliasesPath, JSON.stringify(existingSuppliers, null, 2), 'utf-8');

    console.log('\n' + '='.repeat(70));
    console.log(`✅ ${addedCount} fournisseur(s) ajouté(s)`);
    console.log(`⏭️  ${skippedCount} fournisseur(s) déjà existant(s)`);
    console.log('\n💡 Redémarrez le bot pour appliquer les changements:');
    console.log('   npm run build && pm2 restart billit-bot');
    console.log('='.repeat(70));

  } catch (error: any) {
    console.error('❌ Erreur:', error.message);
  }

  rl.close();
}

analyzeSuppliers().catch(console.error);
