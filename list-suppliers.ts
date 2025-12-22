#!/usr/bin/env ts-node
/**
 * Script pour lister tous les fournisseurs du dictionnaire
 * Usage: npx ts-node list-suppliers.ts
 */

import * as fs from 'fs';
import * as path from 'path';

function listSuppliers() {
  console.log('📋 LISTE DES FOURNISSEURS CONFIGURÉS\n');
  console.log('='.repeat(70));

  const aliasesPath = path.join(__dirname, 'supplier-aliases.json');
  
  if (!fs.existsSync(aliasesPath)) {
    console.log('❌ Fichier supplier-aliases.json non trouvé');
    return;
  }

  const content = fs.readFileSync(aliasesPath, 'utf-8');
  const suppliers = JSON.parse(content);

  const count = Object.keys(suppliers).length;
  console.log(`✓ ${count} fournisseur(s) configuré(s)\n`);

  Object.entries(suppliers).forEach(([key, data]: [string, any], idx) => {
    console.log(`${idx + 1}. 🏢 ${key.toUpperCase()}`);
    console.log(`   Aliases: ${data.aliases.join(', ')}`);
    console.log(`   Patterns: ${data.patterns.join(', ')}`);
    console.log('');
  });

  console.log('='.repeat(70));
  console.log('💡 Pour ajouter un fournisseur: npx ts-node add-supplier.ts');
  console.log('💡 Pour modifier: éditez supplier-aliases.json');
  console.log('='.repeat(70));
}

listSuppliers();
