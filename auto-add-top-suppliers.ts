#!/usr/bin/env ts-node
/**
 * Ajoute automatiquement les fournisseurs les plus importants au dictionnaire
 * Critères: Au moins 5 transactions OU montant total > 5000€
 */

import { BankClient } from './src/bank-client';
import * as fs from 'fs';
import * as path from 'path';

interface SupplierCandidate {
  pattern: string;
  count: number;
  totalAmount: number;
  isCredit: boolean;
  examples: string[];
  originalName: string;
}

function extractSupplierName(description: string): string | null {
  const patterns = [
    /VIREMENT EN FAVEUR DE\s+([A-Za-z0-9\s]+?)(?:\s+BE\d|$)/i,
    /VIREMENT PAR\s+([A-Za-z0-9\s]+?)(?:\s+BE\d|$)/i,
    /^([A-Za-z0-9\s]+?)\s+(?:SA\/NV|BELGIUM|BV|NV)/i,
  ];

  for (const pattern of patterns) {
    const match = description.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }

  return null;
}

function normalizeKey(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
    .substring(0, 20);
}

function normalizePattern(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s\-_\.\/\\]/g, '');
}

async function autoAddTopSuppliers() {
  console.log('🤖 AJOUT AUTOMATIQUE DES TOP FOURNISSEURS\n');
  console.log('='.repeat(70));

  const bankClient = new BankClient();
  
  const endDate = new Date();
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - 3);

  console.log(`📅 Période: 3 derniers mois\n`);

  try {
    const transactions = await bankClient.getTransactionsByPeriod(startDate, endDate);
    console.log(`✓ ${transactions.length} transaction(s) analysée(s)\n`);

    const suppliers = new Map<string, SupplierCandidate>();

    transactions.forEach(tx => {
      const supplierName = extractSupplierName(tx.description);
      
      if (supplierName && supplierName.length > 3) {
        const key = normalizeKey(supplierName);
        
        if (!suppliers.has(key)) {
          suppliers.set(key, {
            pattern: normalizePattern(supplierName),
            count: 0,
            totalAmount: 0,
            isCredit: tx.type === 'Credit',
            examples: [],
            originalName: supplierName
          });
        }

        const candidate = suppliers.get(key)!;
        candidate.count++;
        candidate.totalAmount += Math.abs(tx.amount);
        
        if (candidate.examples.length < 2) {
          candidate.examples.push(tx.description.substring(0, 70));
        }
      }
    });

    // Filtrer les TOP fournisseurs : au moins 5 transactions OU > 5000€
    const topSuppliers = Array.from(suppliers.entries())
      .filter(([_, data]) => data.count >= 5 || data.totalAmount >= 5000)
      .sort((a, b) => b[1].totalAmount - a[1].totalAmount); // Trier par montant

    console.log(`🎯 Critères de sélection:`);
    console.log(`   - Au moins 5 transactions`);
    console.log(`   - OU montant total ≥ 5 000 €\n`);

    // Charger le dictionnaire existant
    const aliasesPath = path.join(__dirname, 'supplier-aliases.json');
    let existingSuppliers: any = {};
    
    if (fs.existsSync(aliasesPath)) {
      const content = fs.readFileSync(aliasesPath, 'utf-8');
      existingSuppliers = JSON.parse(content);
    }

    let addedCount = 0;
    let skippedCount = 0;

    console.log('📊 FOURNISSEURS SÉLECTIONNÉS\n');
    console.log('='.repeat(70));

    for (const [key, data] of topSuppliers) {
      const emoji = data.isCredit ? '💵' : '💸';
      const type = data.isCredit ? 'Rentrée' : 'Sortie';
      
      if (existingSuppliers[key]) {
        console.log(`⏭️  ${emoji} ${key.toUpperCase()} - Déjà configuré`);
        skippedCount++;
        continue;
      }

      // Créer les aliases
      const aliases = [key];
      
      // Ajouter le nom original si différent
      const originalNormalized = normalizeKey(data.originalName);
      if (originalNormalized !== key) {
        aliases.push(data.originalName.toLowerCase());
      }
      
      // Ajouter une version avec espaces
      const words = key.match(/[a-z]+/g);
      if (words && words.length > 1) {
        aliases.push(words.join(' '));
      }

      existingSuppliers[key] = {
        aliases: [...new Set(aliases)], // Enlever les doublons
        patterns: [data.pattern]
      };

      console.log(`✅ ${emoji} ${key.toUpperCase()} - Ajouté`);
      console.log(`   ${type} | ${data.count} trans. | ${data.totalAmount.toFixed(2)} €`);
      addedCount++;
    }

    // Sauvegarder
    if (addedCount > 0) {
      fs.writeFileSync(aliasesPath, JSON.stringify(existingSuppliers, null, 2), 'utf-8');
    }

    console.log('\n' + '='.repeat(70));
    console.log(`✅ ${addedCount} fournisseur(s) ajouté(s)`);
    console.log(`⏭️  ${skippedCount} fournisseur(s) déjà configuré(s)`);
    console.log(`📊 Total dans le dictionnaire: ${Object.keys(existingSuppliers).length}`);
    
    if (addedCount > 0) {
      console.log('\n💡 Redémarrez le bot pour appliquer les changements:');
      console.log('   npm run build && pm2 restart billit-bot');
    }
    console.log('='.repeat(70));

  } catch (error: any) {
    console.error('❌ Erreur:', error.message);
  }
}

autoAddTopSuppliers().catch(console.error);
