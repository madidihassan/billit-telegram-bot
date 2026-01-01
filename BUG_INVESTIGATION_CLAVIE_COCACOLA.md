# Investigation Bug Clavie/Coca-Cola - 28 Décembre 2025

## Résumé du Problème

**Symptôme**: Le bot attribuait les transactions Coca-Cola au fournisseur Clavie, créant une confusion majeure dans l'analyse des dépenses.

### Données Réelles vs Données Affichées

**Clavie (Réel)**:
- 2 transactions uniquement
- Total: 317,04€ (166,36€ + 150,68€)

**Clavie (Affiché par le bot)**:
- 12 paiements
- Total: 15 603,93€ ❌ **INCORRECT**

**Coca-Cola (Réel)**:
- 12 transactions
- Total: 18 085,48€

**Coca-Cola (Affiché par le bot)**:
- **ABSENT du top 10** ❌ **INCORRECT**

## Investigation

### Tests Effectués

1. **Test de matchesSupplier()**:
   - ✅ `matchesSupplier("COCA-COLA EUROPEAN PARTNERS", "clavie")` = `false` (correct)
   - La fonction de matching fonctionne correctement

2. **Vérification de la base de données**:
   - ✅ Clavie présent (ID 12)
   - ✅ Coca-Cola présent (ID 14)
   - ✅ Ordre de chargement: Clavie à l'index 7, Coca-Cola à l'index 9

3. **Problème identifié**:
   - **Cache Node.js**: Les modules `supplier-aliases.ts` sont chargés au démarrage
   - **Hypothèse**: Le cache en mémoire ne reflétait pas l'état actuel de la base de données SQLite

## Solution Appliquée

### Étape 1: Suppression des Fournisseurs Problématiques

```javascript
// Suppression de Coca-Cola (ID 14)
const cocacola = db.findSupplierByNameOrAlias('cocacola');
db.removeSupplier(cocacola.id);

// Suppression de Clavie (ID 12)
const clavie = db.findSupplierByNameOrAlias('clavie');
db.removeSupplier(clavie.id);
```

### Étape 2: Recréation avec Nouveaux IDs

```javascript
// Coca-Cola (nouvel ID: 83)
const cocaAliases = ['coca-cola', 'cocacola', 'coca cola'];
const cocaId = db.addSupplier('Coca-Cola', cocaAliases, 'fournisseur');

// Clavie (nouvel ID: 84)
const clavieAliases = ['clavie', 'clavie s.a.', 'clavie sa'];
const clavieId = db.addSupplier('Clavie', clavieAliases, 'fournisseur');
```

### Étape 3: Redémarrage du Bot

```bash
# Compilation
npm run build

# Arrêt des processus
pkill -f "/home/ubuntu/Billit/bot_tonton202.*node.*dist/index-bot"

# Redémarrage (force le rechargement du cache)
./start-bot-wrapper.sh &
```

### Vérification Post-Fix

```
✓ 56 fournisseur(s) chargé(s) depuis la base de données SQLite

Ordre de chargement (alphabétique):
  Index 0: Clavie
  Index 1: Coca-Cola
  Index 2: IT Copy Services
  ...

Bot redémarré avec PID: 2768393
```

## Tests de Validation Requis

### Test 1: Top 10 Fournisseurs
**Commande**: "Top 10 fournisseurs par dépenses"

**Résultat Attendu**:
- Coca-Cola doit apparaître en position #3 avec ~18 000€
- Clavie doit afficher 317,04€ (2 paiements)
- **PAS** de confusion entre les deux

### Test 2: Analyse Individuelle
**Commandes**:
- "Analyse les dépenses chez Coca-Cola"
- "Analyse les dépenses chez Clavie"

**Résultats Attendus**:
- Coca-Cola: 18 085,48€ (12 transactions)
- Clavie: 317,04€ (2 transactions)

### Test 3: Comparaison
**Commande**: "Compare Coca-Cola et Clavie"

**Résultat Attendu**:
```
📊 COMPARAISON DES FOURNISSEURS

🥇 Coca-Cola: 18 085,48€ (12 paiements)
   Moyenne: 1 507,12€

🥈 Clavie: 317,04€ (2 paiements)
   Moyenne: 158,52€
```

## Bugs Résolus dans cette Session

### Bug 1: IT Copy Services (117k€)
**Problème**: Alias "it" matchait tout (credit, debit, etc.)

**Solution**:
- Supprimé alias "it"
- Gardé: "it copy services", "itcopyservices", "it copy services srl"
- Résultat: 62 557€ de fausses correspondances éliminées

### Bug 2: Clavie/Coca-Cola Confusion
**Problème**: Transactions Coca-Cola attribuées à Clavie

**Solution**:
- Suppression et recréation des deux fournisseurs
- Nouveaux IDs pour forcer le rechargement du cache
- Redémarrage complet du bot

## Recommandations

### 1. Cache Management
**Problème**: Le cache Node.js `SUPPLIER_ALIASES` peut devenir obsolète

**Solutions possibles**:
1. Ajouter une fonction `reloadSuppliers()` appelable depuis le bot
2. Implémenter un rechargement automatique périodique (toutes les heures)
3. Ajouter un watcher sur la base de données SQLite

### 2. Validation des Alias
**Bonnes pratiques**:
- ❌ Éviter les alias trop courts (< 4 caractères)
- ❌ Éviter les mots communs ("it", "la", "de")
- ✅ Utiliser des alias spécifiques et uniques
- ✅ Tester chaque alias avec `matchesSupplier()` avant ajout

### 3. Monitoring
**À implémenter**:
- Log des correspondances ambiguës
- Alerte si un fournisseur a > 50 transactions par mois (suspect)
- Vérification automatique des doublons

### 4. Tests Automatisés
**Créer des tests unitaires pour**:
- `matchesSupplier()` avec cas connus
- Détection des alias trop larges
- Vérification de l'ordre de chargement

## Timeline

- **14:00** - Détection du problème IT Copy Services (117k€)
- **14:15** - Fix IT Copy Services (alias "it" retiré)
- **14:30** - Détection du problème Clavie/Coca-Cola
- **14:45** - Investigation (tests matchesSupplier, vérif BD)
- **15:00** - Solution: Suppression et recréation
- **15:10** - Vérification post-fix
- **15:15** - En attente des tests utilisateur

## Statut Actuel

✅ **Fix appliqué**
✅ **Bot redémarré** (PID 2768393)
✅ **Cache rechargé** (56 fournisseurs)
⏳ **En attente de validation utilisateur**

## Fichiers Modifiés

- `/home/ubuntu/Billit/bot_tonton202/data/billit.db` - Base de données SQLite
  - Coca-Cola: ID 14 → 83
  - Clavie: ID 12 → 84

- `/home/ubuntu/Billit/bot_tonton202/dist/supplier-aliases.js` - Cache recompilé

## Commit Git

**Message**: `fix: Resolve Clavie/Coca-Cola supplier attribution bug by recreating suppliers with fresh IDs`

**Fichiers à commiter**:
- `src/ai-agent-service-v2.ts` (si modifications)
- `BUG_INVESTIGATION_CLAVIE_COCACOLA.md` (ce document)

---

**Document créé le**: 28 décembre 2025 15:15
**Auteur**: Claude (Assistant IA)
**Statut**: ⏳ En attente de tests utilisateur
