# 🤖 Analyse Automatique des Fournisseurs

## 📋 Vue d'ensemble

Trois scripts ont été créés pour **analyser automatiquement** vos transactions bancaires et identifier les fournisseurs récurrents.

---

## 🔧 Scripts disponibles

### 1. **`analyze-suppliers-auto.ts`** - Analyse sans interaction ✅

Analyse et affiche tous les fournisseurs récurrents détectés.

```bash
npx ts-node analyze-suppliers-auto.ts
```

**Résultat :**
- Liste complète des fournisseurs récurrents (≥2 transactions)
- Stats par fournisseur (nombre, montant total, type)
- Exemples de transactions
- Indique quels fournisseurs sont déjà configurés

**Parfait pour :** Voir un aperçu rapide sans rien modifier

---

### 2. **`analyze-suppliers.ts`** - Analyse interactive 🎯

Analyse les transactions et vous guide pour ajouter les fournisseurs.

```bash
npx ts-node analyze-suppliers.ts
```

**Étapes :**
1. Choisissez la période (1 mois, 3 mois, 6 mois, tout)
2. Le script analyse les transactions
3. Affiche les fournisseurs trouvés
4. Demande confirmation avant d'ajouter

**Parfait pour :** Contrôle total sur ce qui est ajouté

---

### 3. **`auto-add-top-suppliers.ts`** - Ajout automatique des TOP 🚀

Ajoute automatiquement les fournisseurs les plus importants selon des critères.

```bash
npx ts-node auto-add-top-suppliers.ts
```

**Critères de sélection :**
- Au moins **5 transactions** dans les 3 derniers mois
- OU montant total **≥ 5 000 €**

**Résultat :**
- Ajoute automatiquement les fournisseurs majeurs
- Ignore les fournisseurs déjà configurés
- Trie par montant total (du plus grand au plus petit)

**Parfait pour :** Mise à jour rapide du dictionnaire

---

## 📊 Exemple de résultats (3 derniers mois)

```
📊 FOURNISSEURS RÉCURRENTS IDENTIFIÉS
══════════════════════════════════════════════════════════════════════

1. 💵 EDENRED - ✅ Déjà configuré
   Type: Rentrée
   Transactions: 86 | Total: 8 681,66 €

2. 💸 FOSTERFASTFOOD - 🆕 Nouveau
   Type: Sortie
   Transactions: 29 | Total: 110 289,93 €

3. 💸 ONSS - 🆕 Nouveau
   Type: Sortie
   Transactions: 3 | Total: 14 586,41 €

[... 23 autres fournisseurs ...]
```

---

## 🎯 Workflow recommandé

### **Première configuration** (une seule fois)

```bash
# 1. Analyser toutes les transactions disponibles
npx ts-node auto-add-top-suppliers.ts

# 2. Redémarrer le bot
npm run build && pm2 restart billit-bot

# 3. Vérifier
npx ts-node list-suppliers.ts
```

### **Mise à jour mensuelle**

```bash
# Ajouter les nouveaux fournisseurs importants
npx ts-node auto-add-top-suppliers.ts
npm run build && pm2 restart billit-bot
```

### **Analyse détaillée ponctuelle**

```bash
# Voir tous les fournisseurs sans rien modifier
npx ts-node analyze-suppliers-auto.ts
```

---

## 🔍 Comment ça fonctionne ?

### Étape 1 : Extraction des noms

Le script détecte les patterns courants dans les descriptions :

```
"VIREMENT EN FAVEUR DE foster fast food BE5123..."
→ Extrait: "foster fast food"

"EDENRED BELGIUM SA/NV 31347257..."
→ Extrait: "EDENRED"

"VIREMENT PAR COLLIBRY BV BE7773..."
→ Extrait: "COLLIBRY"
```

### Étape 2 : Normalisation

```
"foster fast food" → Clé: "fosterfastfood"
"EDENRED BELGIUM" → Clé: "edenred"
"el jaouhari lina" → Clé: "eljaouharilina"
```

### Étape 3 : Agrégation

Pour chaque fournisseur :
- Compte le nombre de transactions
- Calcule le montant total
- Identifie le type (rentrée/sortie)
- Garde des exemples de descriptions

### Étape 4 : Sélection (auto-add-top uniquement)

Filtre selon les critères :
- **≥ 5 transactions** OU **≥ 5 000 €**
- Ignore les doublons déjà dans le dictionnaire

### Étape 5 : Ajout au dictionnaire

```json
{
  "fosterfastfood": {
    "aliases": ["fosterfastfood"],
    "patterns": ["fosterfastfood"]
  }
}
```

---

## 📈 Statistiques actuelles

Après l'exécution de `auto-add-top-suppliers.ts` :

| Métrique | Valeur |
|----------|--------|
| **Fournisseurs configurés** | 13 |
| **Période analysée** | 3 derniers mois |
| **Transactions analysées** | 910 |
| **Top fournisseur (sortie)** | Foster Fast Food (110k€) |
| **Top fournisseur (rentrée)** | EDENRED (8.6k€) |

---

## 🎨 Personnalisation

### Modifier les critères de sélection

Éditez `auto-add-top-suppliers.ts` ligne ~75 :

```typescript
// Actuellement : 5 trans OU 5000€
.filter(([_, data]) => data.count >= 5 || data.totalAmount >= 5000)

// Exemple : Plus strict (10 trans OU 10000€)
.filter(([_, data]) => data.count >= 10 || data.totalAmount >= 10000)
```

### Modifier la période d'analyse

```typescript
// Actuellement : 3 mois
startDate.setMonth(startDate.getMonth() - 3);

// Exemple : 6 mois
startDate.setMonth(startDate.getMonth() - 6);
```

---

## 🚨 Limitations connues

### Patterns non détectés

Le script ne détecte **PAS** :
- Paiements par carte sans nom clair
- Transactions bancaires génériques (VISA-UID, MC-UID)
- Descriptions trop courtes (< 3 caractères)

### Solutions :

Pour les paiements carte, ajoutez manuellement :

```bash
npx ts-node add-supplier.ts
```

---

## 🔄 Automatisation future

### Cron job (optionnel)

Ajoutez un cron pour analyser automatiquement chaque mois :

```bash
# Éditer crontab
crontab -e

# Ajouter cette ligne (1er jour du mois à 2h du matin)
0 2 1 * * cd /home/ubuntu/Billit && npx ts-node auto-add-top-suppliers.ts && npm run build && pm2 restart billit-bot
```

---

## 📝 Exemples de résultats

### Fournisseurs identifiés automatiquement :

✅ **Foster Fast Food** - 29 trans, 110k€  
✅ **ONSS** - 3 trans, 14.5k€  
✅ **Sogle** - 3 trans, 10.8k€  
✅ **Vivaqua** - 1 trans, 8k€  
✅ **Team Précompte Prof** - 3 trans, 7.9k€  
✅ **EDENRED** - 86 trans, 8.6k€ (déjà configuré)  

---

## 🎯 Résumé des commandes

```bash
# Analyse complète sans modifier
npx ts-node analyze-suppliers-auto.ts

# Analyse interactive avec confirmation
npx ts-node analyze-suppliers.ts

# Ajout automatique des TOP
npx ts-node auto-add-top-suppliers.ts

# Lister les fournisseurs configurés
npx ts-node list-suppliers.ts

# Redémarrer le bot
npm run build && pm2 restart billit-bot
```

---

**✅ Le système d'analyse automatique est opérationnel !**

Vous n'avez plus besoin d'ajouter manuellement les fournisseurs - le bot les détecte automatiquement ! 🚀
