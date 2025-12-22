#!/usr/bin/env ts-node
/**
 * Script pour ajouter facilement un nouveau fournisseur au dictionnaire
 * Usage: npx ts-node add-supplier.ts
 */

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

async function addSupplier() {
  console.log('🔧 AJOUT D\'UN NOUVEAU FOURNISSEUR\n');
  console.log('='.repeat(70));

  const aliasesPath = path.join(__dirname, 'supplier-aliases.json');
  
  // Charger le fichier existant
  let suppliers: any = {};
  if (fs.existsSync(aliasesPath)) {
    const content = fs.readFileSync(aliasesPath, 'utf-8');
    suppliers = JSON.parse(content);
    console.log(`✓ ${Object.keys(suppliers).length} fournisseur(s) existant(s) chargé(s)\n`);
  }

  // Demander les informations
  console.log('📝 Entrez les informations du nouveau fournisseur:\n');
  
  const key = await question('1. Clé unique (ex: "foster", "edenred"): ');
  if (!key) {
    console.log('❌ La clé est obligatoire');
    rl.close();
    return;
  }

  if (suppliers[key.toLowerCase()]) {
    console.log(`⚠️  Le fournisseur "${key}" existe déjà. Souhaitez-vous le remplacer ? (y/n)`);
    const replace = await question('> ');
    if (replace.toLowerCase() !== 'y') {
      console.log('❌ Opération annulée');
      rl.close();
      return;
    }
  }

  const aliases = await question('2. Aliases (séparés par des virgules, ex: "foster, foster fast food"): ');
  if (!aliases) {
    console.log('❌ Au moins un alias est requis');
    rl.close();
    return;
  }

  const patterns = await question('3. Patterns à chercher (séparés par des virgules, ex: "foster, fosterfastfood"): ');
  if (!patterns) {
    console.log('❌ Au moins un pattern est requis');
    rl.close();
    return;
  }

  // Créer l'entrée
  const aliasesList = aliases.split(',').map(a => a.trim()).filter(a => a);
  const patternsList = patterns.split(',').map(p => p.trim()).filter(p => p);

  suppliers[key.toLowerCase()] = {
    aliases: aliasesList,
    patterns: patternsList
  };

  // Sauvegarder
  fs.writeFileSync(aliasesPath, JSON.stringify(suppliers, null, 2), 'utf-8');
  
  console.log('\n' + '='.repeat(70));
  console.log('✅ Fournisseur ajouté avec succès !\n');
  console.log('Détails:');
  console.log(`  Clé: ${key.toLowerCase()}`);
  console.log(`  Aliases: ${aliasesList.join(', ')}`);
  console.log(`  Patterns: ${patternsList.join(', ')}`);
  console.log('\n💡 Redémarrez le bot pour appliquer les changements:');
  console.log('   npm run build && pm2 restart billit-bot');
  console.log('='.repeat(70));

  rl.close();
}

addSupplier().catch(console.error);
