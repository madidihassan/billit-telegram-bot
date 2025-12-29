/**
 * Détection automatique des nouveaux fournisseurs dans les transactions bancaires
 *
 * Ce script analyse les transactions bancaires et identifie les fournisseurs
 * qui ne sont pas encore dans la base de données.
 */

import { BankClient } from './bank-client';
import { matchesSupplier, SUPPLIER_ALIASES, extractPotentialSupplierNames } from './supplier-aliases';
import { normalizeSearchTerm } from './utils/string-utils';

interface UnknownSupplier {
  description: string;
  normalizedDescription: string;
  potentialNames: string[];
  count: number;
  totalAmount: number;
  transactions: Array<{
    date: string;
    amount: number;
    description: string;
  }>;
}

/**
 * Détecte les transactions qui ne correspondent à aucun fournisseur connu
 */
async function detectNewSuppliers() {
  console.log('🔍 DÉTECTION DES NOUVEAUX FOURNISSEURS\n');
  console.log('======================================\n');

  const bankClient = new BankClient();
  const transactions = await bankClient.getAllTransactions();

  console.log(`📊 ${transactions.length} transactions bancaires analysées\n`);

  // Mots-clés à exclure (salaires, taxes, paiements récurrents)
  const EXCLUDED_KEYWORDS = [
    // Salaires et employés
    'salaire', 'salary', 'avance', 'solde salaire',

    // Taxes et charges sociales
    'onss', 'tva', 'precompte', 'fiscal', 'impot',

    // Loyer et charges récurrentes
    'loyer', 'rent', 'ordre permanent', 'standing order',

    // Virements internes
    'tonton chami', 'bureau', 'compte',

    // Autres
    'indexation', 'sogle', 'team precompte'
  ];

  // Filtrer les transactions Debit qui ne matchent aucun fournisseur connu
  const suppliers = Object.keys(SUPPLIER_ALIASES);
  const unmatchedTransactions = transactions.filter(tx => {
    if (tx.type !== 'Debit') return false;

    const description = tx.description || '';
    const descLower = description.toLowerCase();

    // Ignorer les transactions vides ou trop courtes
    if (description.length < 10) return false;

    // Ignorer les mots-clés exclus (salaires, taxes, etc.)
    if (EXCLUDED_KEYWORDS.some(keyword => descLower.includes(keyword))) {
      return false;
    }

    // Vérifier si matche un fournisseur connu
    const matchesKnownSupplier = suppliers.some(supplier =>
      matchesSupplier(description, supplier)
    );

    return !matchesKnownSupplier;
  });

  console.log(`❓ ${unmatchedTransactions.length} transaction(s) non matchée(s) avec un fournisseur connu\n`);

  if (unmatchedTransactions.length === 0) {
    console.log('✅ Toutes les transactions correspondent à des fournisseurs connus !\n');
    return [];
  }

  // Regrouper les transactions par description similaire
  const grouped = new Map<string, UnknownSupplier>();

  unmatchedTransactions.forEach(tx => {
    const description = tx.description || '';
    const normalized = normalizeSearchTerm(description);

    // Extraire les noms potentiels
    const potentialNames = extractPotentialSupplierNames(description);

    // Utiliser la description normalisée comme clé de regroupement
    const key = normalized.substring(0, 30); // Premiers 30 caractères normalisés

    if (grouped.has(key)) {
      const existing = grouped.get(key)!;
      existing.count++;
      existing.totalAmount += Math.abs(tx.amount);
      existing.transactions.push({
        date: tx.date,
        amount: Math.abs(tx.amount),
        description: description
      });
    } else {
      grouped.set(key, {
        description: description,
        normalizedDescription: normalized,
        potentialNames: potentialNames,
        count: 1,
        totalAmount: Math.abs(tx.amount),
        transactions: [{
          date: tx.date,
          amount: Math.abs(tx.amount),
          description: description
        }]
      });
    }
  });

  // Convertir en tableau et trier par montant total décroissant
  const unknownSuppliers = Array.from(grouped.values())
    .sort((a, b) => b.totalAmount - a.totalAmount);

  console.log(`📋 ${unknownSuppliers.length} fournisseur(s) potentiel(s) détecté(s)\n`);
  console.log('='.repeat(80) + '\n');

  // Afficher les résultats
  unknownSuppliers.forEach((supplier, index) => {
    console.log(`${index + 1}. 💰 ${supplier.totalAmount.toFixed(2)}€ (${supplier.count} transaction${supplier.count > 1 ? 's' : ''})`);
    console.log(`   Description: ${supplier.description.substring(0, 80)}`);

    if (supplier.potentialNames.length > 0) {
      console.log(`   🏷️  Noms potentiels: ${supplier.potentialNames.slice(0, 5).join(', ')}`);
    }

    // Afficher quelques transactions exemples
    console.log(`   📅 Transactions:`);
    supplier.transactions.slice(0, 3).forEach(tx => {
      console.log(`      - ${tx.date}: ${tx.amount.toFixed(2)}€`);
    });

    if (supplier.transactions.length > 3) {
      console.log(`      ... et ${supplier.transactions.length - 3} autre(s)`);
    }

    console.log('');
  });

  console.log('='.repeat(80) + '\n');
  console.log('💡 RECOMMANDATIONS:\n');
  console.log('Pour ajouter un fournisseur, modifiez src/reload-suppliers.ts:');
  console.log('');
  console.log('const ADDITIONAL_KNOWN_SUPPLIERS = [');
  console.log('  // ... fournisseurs existants ...');
  console.log('  {');
  console.log('    name: "Nom du Fournisseur",');
  console.log('    aliases: ["alias1", "alias2", "alias3"]');
  console.log('  }');
  console.log('];\n');
  console.log('Puis exécutez: npm run build && node dist/reload-suppliers.js\n');

  return unknownSuppliers;
}

// Exécuter le script
if (require.main === module) {
  detectNewSuppliers()
    .then((suppliers) => {
      if (suppliers.length > 0) {
        console.log(`✅ Détection terminée: ${suppliers.length} fournisseur(s) potentiel(s) trouvé(s)\n`);
        process.exit(0);
      } else {
        console.log('✅ Détection terminée: Aucun nouveau fournisseur détecté\n');
        process.exit(0);
      }
    })
    .catch((error) => {
      console.error('❌ Erreur:', error.message);
      process.exit(1);
    });
}

export { detectNewSuppliers };
