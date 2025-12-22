/**
 * Extraction automatique des fournisseurs depuis les transactions bancaires
 */

import { BankClient } from './src/bank-client';
import * as fs from 'fs';
import * as path from 'path';

interface SupplierCandidate {
  name: string;
  count: number;
  totalAmount: number;
  type: 'debit' | 'credit' | 'mixed';
  firstSeen: string;
  lastSeen: string;
}

async function extractSuppliersFromBank() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔍 EXTRACTION DES FOURNISSEURS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const bankClient = new BankClient();

  try {
    // Récupérer toutes les transactions (on va chercher loin dans le passé)
    console.log('📥 Récupération des transactions bancaires...\n');

    // Date de début : 1 an en arrière
    const startDate = new Date();
    startDate.setFullYear(startDate.getFullYear() - 1);

    const endDate = new Date();

    const transactions = await bankClient.getTransactionsByPeriod(startDate, endDate);

    console.log(`✅ ${transactions.length} transactions récupérées\n`);

    // Analyser les descriptions pour extraire les fournisseurs potentiels
    const supplierMap = new Map<string, SupplierCandidate>();

    transactions.forEach(tx => {
      if (!tx.description || tx.description.trim().length === 0) return;

      // Extraire le nom potentiel du fournisseur
      // La description contient souvent: "NOM_FOURNISSEUR quelque chose"
      const description = tx.description.trim();

      // Enlever les numéros de référence, dates, etc.
      let supplierName = description
        .split(/[0-9]{2}\/[0-9]{2}/)[0] // Enlever les dates DD/MM
        .split(/[0-9]{4}-[0-9]{2}-[0-9]{2}/)[0] // Enlever les dates YYYY-MM-DD
        .split(/REF:/)[0] // Enlever les références
        .split(/COMMUNICATION:/)[0]
        .trim();

      // Normaliser (enlever espaces multiples, caractères spéciaux)
      supplierName = supplierName
        .replace(/\s+/g, ' ')
        .replace(/[^a-zA-Z0-9\s\-]/g, '')
        .trim();

      // Ignorer si trop court ou trop long
      if (supplierName.length < 3 || supplierName.length > 50) return;

      // Ignorer certains mots-clés communs
      const ignoredKeywords = [
        'virement', 'paiement', 'domiciliation', 'retrait', 'depot',
        'bancontact', 'carte', 'commission', 'frais', 'transfer'
      ];

      const lowerName = supplierName.toLowerCase();
      if (ignoredKeywords.some(kw => lowerName.includes(kw))) return;

      // Normaliser en minuscules pour le regroupement
      const normalizedName = supplierName.toLowerCase();

      if (!supplierMap.has(normalizedName)) {
        supplierMap.set(normalizedName, {
          name: supplierName,
          count: 0,
          totalAmount: 0,
          type: tx.type === 'Credit' ? 'credit' : 'debit',
          firstSeen: tx.date,
          lastSeen: tx.date
        });
      }

      const supplier = supplierMap.get(normalizedName)!;
      supplier.count++;
      supplier.totalAmount += Math.abs(tx.amount);

      // Mettre à jour le type si mixte
      if (supplier.type !== 'mixed') {
        if ((supplier.type === 'credit' && tx.type === 'Debit') ||
            (supplier.type === 'debit' && tx.type === 'Credit')) {
          supplier.type = 'mixed';
        }
      }

      // Mettre à jour les dates
      if (new Date(tx.date) < new Date(supplier.firstSeen)) {
        supplier.firstSeen = tx.date;
      }
      if (new Date(tx.date) > new Date(supplier.lastSeen)) {
        supplier.lastSeen = tx.date;
      }
    });

    // Trier par nombre de transactions (fournisseurs les plus fréquents d'abord)
    const sortedSuppliers = Array.from(supplierMap.values())
      .filter(s => s.count >= 2) // Au moins 2 transactions
      .sort((a, b) => b.count - a.count);

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📊 ${sortedSuppliers.length} fournisseurs potentiels trouvés`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Charger le dictionnaire actuel
    const aliasesPath = path.join(__dirname, 'supplier-aliases.json');
    const currentAliases = JSON.parse(fs.readFileSync(aliasesPath, 'utf-8'));
    const currentSupplierNames = Object.keys(currentAliases).map(k => k.toLowerCase());

    // Afficher les fournisseurs trouvés
    sortedSuppliers.forEach((supplier, idx) => {
      const typeEmoji = supplier.type === 'debit' ? '💸' : supplier.type === 'credit' ? '💵' : '💰';
      const amount = new Intl.NumberFormat('fr-BE', { style: 'currency', currency: 'EUR' }).format(supplier.totalAmount);

      // Vérifier si déjà dans le dictionnaire
      const normalized = supplier.name.toLowerCase().replace(/\s+/g, '');
      const isInDict = currentSupplierNames.some(name => {
        const currentNormalized = name.replace(/\s+/g, '');
        return normalized.includes(currentNormalized) || currentNormalized.includes(normalized);
      });

      const statusEmoji = isInDict ? '✅' : '🆕';

      console.log(`${idx + 1}. ${statusEmoji} ${typeEmoji} ${supplier.name}`);
      console.log(`   📊 ${supplier.count} transaction(s) | ${amount}`);
      console.log(`   📅 Vu du ${new Date(supplier.firstSeen).toLocaleDateString('fr-BE')} au ${new Date(supplier.lastSeen).toLocaleDateString('fr-BE')}`);

      if (!isInDict) {
        console.log(`   ⚠️  NON PRÉSENT dans le dictionnaire`);
      }

      console.log('');
    });

    // Compter les nouveaux
    const newSuppliers = sortedSuppliers.filter(s => {
      const normalized = s.name.toLowerCase().replace(/\s+/g, '');
      return !currentSupplierNames.some(name => {
        const currentNormalized = name.replace(/\s+/g, '');
        return normalized.includes(currentNormalized) || currentNormalized.includes(normalized);
      });
    });

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`🆕 ${newSuppliers.length} nouveaux fournisseurs à ajouter`);
    console.log(`✅ ${sortedSuppliers.length - newSuppliers.length} déjà dans le dictionnaire`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    if (newSuppliers.length > 0) {
      console.log('💡 Nouveaux fournisseurs à ajouter manuellement:\n');
      newSuppliers.forEach(s => {
        const key = s.name.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '');
        console.log(`  "${key}": {`);
        console.log(`    "aliases": ["${s.name.toLowerCase()}"],`);
        console.log(`    "patterns": ["${key}"]`);
        console.log(`  },`);
      });
    }

  } catch (error: any) {
    console.error('❌ Erreur:', error.message);
  }
}

extractSuppliersFromBank().catch(console.error);
