/**
 * Analyse détaillée de toutes les transactions par catégorie
 */

import { BankClient } from './src/bank-client';

async function analyzeCategories() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 ANALYSE DES 939 TRANSACTIONS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const bankClient = new BankClient();

  const startDate = new Date();
  startDate.setFullYear(startDate.getFullYear() - 1);
  const endDate = new Date();

  const transactions = await bankClient.getTransactionsByPeriod(startDate, endDate);

  // Catégoriser les transactions
  const categories = {
    salaires: [] as any[],      // Virements vers employés
    foster: [] as any[],         // Foster (déjà connu)
    fournisseurs: [] as any[],   // VIREMENT EN FAVEUR DE + Vers:
    bancontact: [] as any[],     // Paiements Bancontact
    mastercard: [] as any[],     // Paiements Mastercard
    domiciliations: [] as any[], // Domiciliations
    recettes: [] as any[],       // Versements (crédits)
    ordres: [] as any[],         // Ordres permanents
    autres: [] as any[]
  };

  transactions.forEach(tx => {
    const desc = tx.description || '';

    // Salaires (virements vers personnes physiques)
    if (desc.match(/VIREMENT EN FAVEUR DE [a-z\s\-]+ BE[0-9]+/i) &&
        !desc.toLowerCase().includes('foster') &&
        !desc.toLowerCase().includes('onss') &&
        !desc.toLowerCase().includes('tva') &&
        !desc.toLowerCase().includes('company') &&
        !desc.toLowerCase().includes('srl') &&
        !desc.toLowerCase().includes('sprl') &&
        !desc.toLowerCase().includes('sa ') &&
        !desc.toLowerCase().includes('fonds') &&
        !desc.toLowerCase().includes('team') &&
        !desc.toLowerCase().includes('sogle') &&
        !desc.toLowerCase().includes('project')) {
      categories.salaires.push(tx);
    }
    // Foster
    else if (desc.toLowerCase().includes('foster')) {
      categories.foster.push(tx);
    }
    // Autres fournisseurs (virements)
    else if (desc.match(/VIREMENT EN FAVEUR DE|Vers:/i)) {
      categories.fournisseurs.push(tx);
    }
    // Bancontact
    else if (desc.includes('Bancontact')) {
      categories.bancontact.push(tx);
    }
    // Mastercard
    else if (desc.includes('Mastercard')) {
      categories.mastercard.push(tx);
    }
    // Domiciliations
    else if (desc.includes('DOMICILIATION')) {
      categories.domiciliations.push(tx);
    }
    // Recettes
    else if (tx.type === 'Credit') {
      categories.recettes.push(tx);
    }
    // Ordres permanents
    else if (desc.includes('ORDRE PERMANENT')) {
      categories.ordres.push(tx);
    }
    // Autres
    else {
      categories.autres.push(tx);
    }
  });

  // Afficher le résumé
  const total = transactions.length;

  console.log('📊 RÉPARTITION PAR CATÉGORIE:\n');

  Object.entries(categories).forEach(([cat, txs]) => {
    const count = txs.length;
    const percent = ((count / total) * 100).toFixed(1);
    const totalAmount = txs.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
    const amount = new Intl.NumberFormat('fr-BE', { style: 'currency', currency: 'EUR' }).format(totalAmount);

    const emoji = cat === 'salaires' ? '👥' :
                  cat === 'foster' ? '🍔' :
                  cat === 'fournisseurs' ? '🏢' :
                  cat === 'bancontact' ? '💳' :
                  cat === 'mastercard' ? '💳' :
                  cat === 'recettes' ? '💵' :
                  cat === 'ordres' ? '🔄' :
                  cat === 'domiciliations' ? '📋' : '📦';

    console.log(`${emoji} ${cat.toUpperCase()}`);
    console.log(`   ${count} transactions (${percent}%) | ${amount}`);
    console.log('');
  });

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📊 TOTAL: ${total} transactions`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Détail des salaires
  console.log('👥 DÉTAIL DES SALAIRES:\n');
  const salaireMap = new Map<string, number>();
  categories.salaires.forEach(tx => {
    const match = tx.description.match(/VIREMENT EN FAVEUR DE ([a-z\s\-]+) BE/i);
    if (match) {
      const name = match[1].trim();
      salaireMap.set(name, (salaireMap.get(name) || 0) + 1);
    }
  });

  Array.from(salaireMap.entries())
    .sort((a, b) => b[1] - a[1])
    .forEach(([name, count]) => {
      console.log(`   ${name}: ${count} paiement(s)`);
    });

  console.log(`\n   Total: ${salaireMap.size} employés différents`);

  // Détail des fournisseurs
  console.log('\n\n🏢 DÉTAIL DES VRAIS FOURNISSEURS:\n');
  const fournisseurMap = new Map<string, number>();
  categories.fournisseurs.forEach(tx => {
    const desc = tx.description;
    let name = '';

    const matchVirement = desc.match(/VIREMENT EN FAVEUR DE ([^\s]+)/i);
    const matchVers = desc.match(/Vers:\s*([^-\n]+)/i);

    if (matchVirement) {
      name = matchVirement[1].trim();
    } else if (matchVers) {
      name = matchVers[1].trim();
    }

    if (name) {
      fournisseurMap.set(name, (fournisseurMap.get(name) || 0) + 1);
    }
  });

  Array.from(fournisseurMap.entries())
    .sort((a, b) => b[1] - a[1])
    .forEach(([name, count]) => {
      console.log(`   ${name}: ${count} paiement(s)`);
    });

  console.log(`\n   Total: ${fournisseurMap.size} fournisseurs par virement`);

  // Détail Bancontact (magasins)
  console.log('\n\n💳 DÉTAIL DES PAIEMENTS BANCONTACT (magasins):\n');
  const magasinMap = new Map<string, number>();
  categories.bancontact.forEach(tx => {
    const lines = tx.description.split('\n');
    if (lines.length > 1) {
      const magasin = lines[1].split('-')[0].trim();
      magasinMap.set(magasin, (magasinMap.get(magasin) || 0) + 1);
    }
  });

  Array.from(magasinMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20) // Top 20
    .forEach(([name, count]) => {
      console.log(`   ${name}: ${count} paiement(s)`);
    });

  console.log(`\n   Total: ${magasinMap.size} magasins différents`);
}

analyzeCategories().catch(console.error);
