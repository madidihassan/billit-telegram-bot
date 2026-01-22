# 🧪 Système de Benchmark IA

## Vue d'ensemble

Ce système de benchmark teste **vitesse ET exactitude** du bot IA sur 20 questions représentatives.

### Métriques mesurées :
- ✅ **Exactitude** : % de tests réussis, score moyen (0-100%)
- ⏱️ **Vitesse** : Temps de réponse moyen et médian
- 🎯 **Précision** : Validation automatique des réponses (mots-clés, outils appelés, etc.)

## 📋 Les 20 questions de test

Les questions couvrent tous les cas d'usage critiques :

### Factures (8 tests)
- Factures d'un fournisseur spécifique
- Toutes les factures (avec/sans filtre)
- Factures par période
- Factures impayées
- Questions naturelles ("Montre-moi ce qu'on a payé...")

### Salaires/Employés (5 tests)
- Salaires d'un employé
- Recherche avec nom partiel
- Top X employés
- Comparaisons
- Périodes multi-mois

### Fournisseurs/Dépenses (5 tests)
- Top X fournisseurs
- Analyse de dépenses
- Factures par catégorie
- Comparaisons
- Questions naturelles

### Transactions/Analytics (2 tests)
- Dernière transaction
- Prédictions

## 🚀 Utilisation

### 1. Benchmark AVANT optimisations

```bash
npm run benchmark:before
```

**Résultat** : Fichier `data/benchmarks/benchmark-before-{timestamp}.json`

### 2. Benchmark APRÈS optimisations

```bash
npm run benchmark:after
```

**Résultat** : Fichier `data/benchmarks/benchmark-after-{timestamp}.json`

### 3. Comparer les résultats

```bash
npm run benchmark:compare benchmark-before-{timestamp}.json benchmark-after-{timestamp}.json
```

**Affiche** :
- Delta d'exactitude (%)
- Delta de vitesse (ms et %)
- Tests qui ont changé de statut
- Verdict final

## 📊 Critères de validation

Chaque question a des critères spécifiques :

### Exemple : "Factures de Foster"

```typescript
{
  mustContain: ['Foster'],           // Mot-clé obligatoire
  expectedTool: 'get_recent_invoices', // Outil attendu
  minDataPoints: 1                    // Minimum 1 facture retournée
}
```

### Scoring

- **Mots-clés présents** : 30 points
- **Mots-clés interdits absents** : 20 points
- **Patterns regex matchés** : 20 points
- **Outil correct appelé** : 20 points
- **Données suffisantes** : 10 points

**Seuil de réussite** : 70%

## 📁 Structure des fichiers

```
src/
├── benchmark.ts                 # Point d'entrée principal
└── benchmark/
    ├── test-questions.ts        # 20 questions avec critères
    ├── validator.ts             # Logique de validation
    ├── runner.ts                # Exécution des tests
    └── compare.ts               # Comparaison avant/après

data/benchmarks/
├── benchmark-before-*.json      # Résultats AVANT
└── benchmark-after-*.json       # Résultats APRÈS
```

## 🎯 Objectifs d'optimisation

### Cibles attendues :

| Métrique | Avant | Cible Après | Gain |
|----------|-------|-------------|------|
| Temps moyen | 2500ms | 1000ms | **60% plus rapide** |
| Temps médian | 2200ms | 900ms | **59% plus rapide** |
| Exactitude | 60-70% | 90-95% | **+25-35%** |
| Score moyen | 75% | 90% | **+15 points** |

## 💡 Interprétation des résultats

### Score < 70% (échec)
- Réponse incorrecte ou incomplète
- Outil inapproprié utilisé
- Données manquantes

### Score 70-85% (partiel)
- Réponse globalement correcte
- Quelques mots-clés manquants
- Outil correct mais paramètres sous-optimaux

### Score > 85% (succès)
- Réponse précise et complète
- Bon outil avec bons paramètres
- Toutes les données présentes

## 🔧 Ajouter de nouveaux tests

Modifier `src/benchmark/test-questions.ts` :

```typescript
{
  id: 'NEW-001',
  category: 'Votre catégorie',
  question: 'Votre question',
  expectedBehavior: 'Description du comportement attendu',
  validationCriteria: {
    mustContain: ['mot1', 'mot2'],
    expectedTool: 'nom_outil',
    minDataPoints: 5
  }
}
```

## 📈 Workflow recommandé

1. **Baseline** : `npm run benchmark:before`
2. **Optimiser** le code (supprimer classification, hints, etc.)
3. **Tester** : `npm run benchmark:after`
4. **Comparer** : `npm run benchmark:compare before.json after.json`
5. **Valider** : Si score > 90% ET vitesse > +50%, merge !

## ⚠️ Notes importantes

- Les tests font de **vrais appels API** (Billit, OpenRouter)
- Pause de 500ms entre chaque test (rate limiting)
- Durée totale : ~15-20 minutes pour 20 tests
- Coût estimé : ~$0.05 par run (GPT-4o-mini)

## 🐛 Dépannage

**Erreur "Aucun provider IA disponible"**
→ Vérifier `.env` : `OPENROUTER_API_KEY` ou `GROQ_API_KEY`

**Tests échouent tous**
→ Vérifier les credentials Billit dans `.env`

**Timeout**
→ Augmenter le timeout dans `runner.ts` (ligne ~150)

---

**Dernière mise à jour** : 22 janvier 2026
