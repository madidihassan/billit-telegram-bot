/**
 * Service de catégorisation automatique des dépenses
 * Permet de classifier les fournisseurs et transactions par catégorie
 */

import fs from 'fs';
import path from 'path';

export type ExpenseCategoryType =
  | 'loyers'
  | 'utilities'
  | 'telecom'
  | 'assurance'
  | 'alimentation'
  | 'salaires'
  | 'services'
  | 'taxes'
  | 'autre';

export interface ExpenseCategory {
  name: string;
  description: string;
  keywords: string[];
  suppliers: string[];
  type: 'fixed' | 'variable';
  frequency: 'mensuel' | 'hebdomadaire' | 'annuel' | 'ponctuel';
}

export interface ExpenseCategories {
  categories: {
    [key: string]: ExpenseCategory;
  };
}

export interface CategorizedTransaction {
  category: ExpenseCategoryType;
  confidence: number; // 0-1
  categoryName: string;
}

export class ExpenseCategorizer {
  private categories: ExpenseCategories;
  private categoriesPath: string;

  constructor() {
    this.categoriesPath = path.join(__dirname, '..', 'data', 'expense-categories.json');
    this.categories = this.loadCategories();
  }

  /**
   * Charge les catégories depuis le fichier JSON
   */
  private loadCategories(): ExpenseCategories {
    try {
      if (fs.existsSync(this.categoriesPath)) {
        const data = fs.readFileSync(this.categoriesPath, 'utf-8');
        return JSON.parse(data);
      }
      // Retourner des catégories par défaut si le fichier n'existe pas
      return this.getDefaultCategories();
    } catch (error) {
      console.error('❌ Erreur lors du chargement des catégories:', error);
      return this.getDefaultCategories();
    }
  }

  /**
   * Retourne les catégories par défaut
   */
  private getDefaultCategories(): ExpenseCategories {
    return {
      categories: {
        loyers: {
          name: 'Loyers',
          description: 'Loyers restaurant et bureaux',
          keywords: ['immobilier', 'bail', 'loyer', 'rental', 'propriétaire', 'immo'],
          suppliers: [],
          type: 'fixed',
          frequency: 'mensuel',
        },
        utilities: {
          name: 'Utilities',
          description: 'Électricité, gaz, eau',
          keywords: ['engie', 'luminus', 'sibelga', 'vivaqua', 'eau', 'gaz', 'électricité'],
          suppliers: [],
          type: 'variable',
          frequency: 'mensuel',
        },
        alimentation: {
          name: 'Alimentation',
          description: 'Approvisionnement restaurant',
          keywords: ['sligro', 'colruyt', 'makro', 'metro', 'foster', 'coca-cola'],
          suppliers: [],
          type: 'variable',
          frequency: 'hebdomadaire',
        },
        autre: {
          name: 'Autres',
          description: 'Autres dépenses',
          keywords: [],
          suppliers: [],
          type: 'variable',
          frequency: 'ponctuel',
        },
      },
    };
  }

  /**
   * Catégorise automatiquement un fournisseur
   */
  categorizeSupplier(supplierName: string): CategorizedTransaction {
    const supplierLower = supplierName.toLowerCase();
    let bestMatch: ExpenseCategoryType = 'autre';
    let bestScore = 0;

    for (const [key, category] of Object.entries(this.categories.categories)) {
      let score = 0;

      // Vérifier si le fournisseur est explicitement listé
      if (category.suppliers.some(s => supplierLower.includes(s.toLowerCase()))) {
        score = 100; // Correspondance exacte
      }

      // Vérifier les mots-clés dans le nom du fournisseur
      for (const keyword of category.keywords) {
        if (supplierLower.includes(keyword.toLowerCase())) {
          score += 20;
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = key as ExpenseCategoryType;
      }
    }

    return {
      category: bestMatch,
      confidence: Math.min(bestScore / 100, 1),
      categoryName: this.categories.categories[bestMatch].name,
    };
  }

  /**
   * Retourne toutes les catégories
   */
  getAllCategories(): ExpenseCategory[] {
    return Object.values(this.categories.categories);
  }

  /**
   * Retourne une catégorie spécifique
   */
  getCategory(key: ExpenseCategoryType): ExpenseCategory | undefined {
    return this.categories.categories[key];
  }

  /**
   * Ajoute un fournisseur à une catégorie
   */
  addSupplierToCategory(supplierName: string, category: ExpenseCategoryType): void {
    if (!this.categories.categories[category]) {
      throw new Error(`Catégorie inconnue: ${category}`);
    }

    if (!this.categories.categories[category].suppliers.includes(supplierName)) {
      this.categories.categories[category].suppliers.push(supplierName);
      this.saveCategories();
    }
  }

  /**
   * Sauvegarde les catégories dans le fichier JSON
   */
  private saveCategories(): void {
    try {
      fs.writeFileSync(this.categoriesPath, JSON.stringify(this.categories, null, 2), 'utf-8');
      console.log('💾 Catégories de dépenses sauvegardées');
    } catch (error) {
      console.error('❌ Erreur lors de la sauvegarde des catégories:', error);
    }
  }

  /**
   * Catégorise une transaction bancaire
   */
  categorizeTransaction(description: string): CategorizedTransaction {
    const descriptionLower = description.toLowerCase();
    let bestMatch: ExpenseCategoryType = 'autre';
    let bestScore = 0;

    for (const [key, category] of Object.entries(this.categories.categories)) {
      let score = 0;

      // Vérifier les mots-clés dans la description
      for (const keyword of category.keywords) {
        if (descriptionLower.includes(keyword.toLowerCase())) {
          score += 15;
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = key as ExpenseCategoryType;
      }
    }

    return {
      category: bestMatch,
      confidence: Math.min(bestScore / 100, 1),
      categoryName: this.categories.categories[bestMatch].name,
    };
  }
}
