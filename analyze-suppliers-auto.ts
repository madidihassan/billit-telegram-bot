#!/usr/bin/env ts-node
/**
 * Version automatique : Analyse et affiche les fournisseurs sans interaction
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

async function analyzeSuppliers() {
  console.log('🔍 ANALYSE AUTOMATIQUE DES FOURNISSEURS\n');
  console.log('='.repeat(70));

  const bankClient = new BankClient();
  
  // Analyser les 3 derniers mois
  const endDate = new Date();
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - 3);

  console.log(`📅 Période: ${startDate.toLocaleDateString('fr-BE')} - ${endDate.toLocaleDateString('fr-BE')}\n`);

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
            examples: []
          });
        }

        const candidate = suppliers.get(key)!;
        candidate.count++;
        candidate.totalAmount += Math.abs(tx.amount);
        
        if (candidate.examples.length < 3) {
          candidate.examples.push(tx.description.substring(0, 70));
        }
      }
    });

    // Filtrer les fournisseurs récurrents
    const recurringSuppliers = Array.from(suppliers.entries())
      .filter(([_, data]) => data.count >= 2)
      .sort((a, b) => b[1].count - a[1].count);

    console.log('📊 FOURNISSEURS RÉCURRENTS IDENTIFIÉS\n');
    console.log('='.repeat(70));
    
    if (recurringSuppliers.length === 0) {
      console.log('❌ Aucun fournisseur récurrent trouvé');
      return;
    }

    // Charger les fournisseurs existants
    const aliasesPath = path.join(__dirname, 'supplier-aliases.json');
    let existingSuppliers: any = {};
    
    if (fs.existsSync(aliasesPath)) {
      const content = fs.readFileSync(aliasesPath, 'utf-8');
      existingSuppliers = JSON.parse(content);
    }

    let newCount = 0;
    let existingCount = 0;

    recurringSuppliers.forEach(([key, data], idx) => {
      const emoji = data.isCredit ? '💵' : '💸';
      const type = data.isCredit ? 'Rentrée' : 'Sortie';
      const status = existingSuppliers[key] ? '✅ Déjà configuré' : '🆕 Nouveau';
      
      if (!existingSuppliers[key]) {
        newCount++;
      } else {
        existingCount++;
      }
      
      console.log(`${idx + 1}. ${emoji} ${key.toUpperCase()} - ${status}`);
      console.log(`   Type: ${type}`);
      console.log(`   Transactions: ${data.count} | Total: ${data.totalAmount.toFixed(2)} €`);
      console.log(`   Pattern: "${data.pattern}"`);
      console.log(`   Exemples:`);
      data.examples.forEach((ex, i) => {
        console.log(`     ${i + 1}. ${ex}`);
      });
      console.log('');
    });

    console.log('='.repeat(70));
    console.log(`📊 RÉSUMÉ:`);
    console.log(`   Total: ${recurringSuppliers.length} fournisseur(s) récurrent(s)`);
    console.log(`   🆕 Nouveaux: ${newCount}`);
    console.log(`   ✅ Déjà configurés: ${existingCount}`);
    console.log('\n💡 Pour ajouter les nouveaux fournisseurs, exécutez:');
    console.log('   npx ts-node analyze-suppliers.ts');
    console.log('='.repeat(70));

  } catch (error: any) {
    console.error('❌ Erreur:', error.message);
  }
}

analyzeSuppliers().catch(console.error);
