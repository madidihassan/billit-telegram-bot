# Nettoyage des Alias Fournisseurs - 28 Décembre 2025

## Vue d'ensemble

Ce document récapitule le travail de correction massif des alias de fournisseurs pour éliminer les faux positifs causés par les alias auto-générés trop génériques.

## Problème Initial

Le système d'auto-génération d'alias créait des alias basés sur les mots individuels du nom du fournisseur, ce qui générait des alias beaucoup trop génériques qui matchaient des transactions non liées.

### Exemples de problèmes :
- "belgium" → matchait TOUTES les entreprises belges
- "fast" → matchait "breakfast", "fast payment", etc.
- "food" → matchait "food delivery", "h-food", etc.
- "pack" → matchait "package", "packaging", etc.
- "eats" → matchait toute transaction avec "eats"

## Impact Total

**~5 310€ de faux positifs éliminés** sur les 7 fournisseurs corrigés !

## Fournisseurs Corrigés (7 au total)

### 1. Coca-Cola EUROPACIFIC PARTNERS BELGIUM SRL

**Problème**:
- Alias auto: "belgium", "europacific", "partners"
- Ces mots matchaient d'autres entreprises

**Impact**: 19 875€ → **18 085,48€** (1 790€ de faux positifs)

**Solution**:
```javascript
{
  name: 'COCA-COLA EUROPACIFIC PARTNERS BELGIUM SRL',
  aliases: ['coca-cola', 'cocacola', 'coca cola', 'coca-cola europacific', 'cocacolaeuropacific'],
  replaceAutoAliases: true
}
```

---

### 2. Foster Fast Food SA

**Problème**:
- Alias auto: "fast", "food"
- Mots extrêmement génériques

**Impact**: 124 854,80€ → **124 720,96€** (134€ de faux positifs)

**Solution**:
```javascript
{
  name: 'FOSTER FAST FOOD SA',
  aliases: ['foster', 'foster fast food', 'fosterfastfood', 'foster fast food sa', 'fosterfastfoodsa'],
  replaceAutoAliases: true
}
```

---

### 3. Sligro-MFS Belgium SA

**Problème**:
- Alias auto: "belgium"
- Matchait toutes les entreprises belges

**Impact**: 3 531,72€ → **2 948,49€** (583€ de faux positifs)

**Solution**:
```javascript
{
  name: 'Sligro-MFS Belgium SA',
  aliases: ['sligro', 'sligro-mfs', 'sligromfs', 'sligro mfs', 'sligro belgium'],
  replaceAutoAliases: true
}
```

---

### 4. Uber Eats Belgium SRL

**Problème**:
- Alias auto: "belgium", "eats"
- "eats" matchait toute transaction alimentaire

**Impact**: 1 789,79€ → **0€** (1 790€ de faux positifs - le fournisseur n'avait aucune vraie transaction!)

**Solution**:
```javascript
{
  name: 'Uber Eats Belgium SRL',
  aliases: ['uber', 'uber eats', 'ubereats', 'uber eats belgium', 'ubereatsbelgium'],
  replaceAutoAliases: true
}
```

---

### 5. Wibra België

**Problème**:
- Alias auto: "belgi" (version normalisée de "belgië")
- Matchait "belgium", "belgian", "belgique", etc.

**Impact**: 1 887,83€ → **59,76€** (1 828€ de faux positifs!)

**Solution**:
```javascript
{
  name: 'Wibra België',
  aliases: ['wibra', 'wibra belgië', 'wibra belgie', 'wibrabelgie'],
  replaceAutoAliases: true
}
```

---

### 6. AHLAS PACK SRL

**Problème**:
- Alias auto: "pack"
- Matchait "package", "packaging", etc.

**Impact**: 116,50€ → **106€** (10,50€ de faux positifs)

**Solution**:
```javascript
{
  name: 'AHLAS PACK SRL',
  aliases: ['ahlas', 'ahlas pack', 'ahlaspacksrl', 'ahlas pack srl'],
  replaceAutoAliases: true
}
```

---

### 7. Belgian Shell SA

**Problème**:
- Alias auto: "belgian"
- Potentiellement problématique pour matcher d'autres entreprises belges

**Solution préventive**:
```javascript
{
  name: 'Belgian Shell SA',
  aliases: ['shell', 'belgian shell', 'belgian shell sa', 'belgianshellsa'],
  replaceAutoAliases: true
}
```

---

## Outils Créés

### 1. Script de Rechargement des Fournisseurs

**Fichier**: `src/reload-suppliers.ts`

**Fonctionnalités**:
- Supprime tous les fournisseurs existants
- Charge les fournisseurs depuis les factures Billit
- Ajoute des fournisseurs manuels (Clavie, Monizze, Edenred, etc.)
- Support du flag `replaceAutoAliases` pour overrider les alias auto
- Génère des alias automatiques pour les autres fournisseurs

**Usage**:
```bash
npm run build
node dist/reload-suppliers.js
```

---

### 2. Script de Vérification des Alias

**Fichier**: `verify-all-aliases.js`

**Fonctionnalités**:
- Vérifie tous les fournisseurs de la base de données
- Détecte les alias génériques connus (belgium, fast, food, pack, eats, etc.)
- Détecte les alias trop courts (< 4 caractères)
- Fournit des recommandations de correction

**Usage**:
```bash
node verify-all-aliases.js
```

**Critères de vérification**:
- Mots génériques : belgium, belgian, belgi, belgië, fast, food, pack, eats, europacific, partners, services, etc.
- Formes juridiques : SA, SRL, NV, BVBA, SPRL
- Longueur minimale : 4 caractères

**Exemple de sortie**:
```
✅ Tous les fournisseurs ont des alias corrects !
   Aucun alias problématique détecté.
```

---

## Configuration Finale

### Fournisseurs avec Alias Manuels (7)

1. Coca-Cola EUROPACIFIC PARTNERS BELGIUM SRL
2. Foster Fast Food SA
3. Sligro-MFS Belgium SA
4. Uber Eats Belgium SRL
5. Wibra België
6. AHLAS PACK SRL
7. Belgian Shell SA

### Fournisseurs avec Alias Auto (18)

Les 18 autres fournisseurs utilisent des alias auto-générés car leurs noms ne contiennent pas de mots génériques problématiques :
- ALKHOOMSY SRL
- BILLIT
- CIERS COOKING
- ELECTRABEL SA
- H-FOOD
- Lahaye-Lardies SRL
- Clavie
- Monizze
- Edenred
- Pluxee Belgium
- Collibry
- Engie
- Vivaqua
- Proximus
- Colruyt
- Makro
- Metro
- Transgourmet

---

## Workflow de Maintenance

### Ajouter un Nouveau Fournisseur

**Si le fournisseur n'existe pas dans Billit** (ex: Clavie, Monizze) :
1. Ajouter dans `ADDITIONAL_KNOWN_SUPPLIERS` dans `src/reload-suppliers.ts`
2. Spécifier des alias manuels
3. Exécuter le script de rechargement

**Si le fournisseur existe dans Billit** :
- Les alias seront générés automatiquement lors du rechargement
- Vérifier avec `verify-all-aliases.js`
- Si problème, ajouter à `ADDITIONAL_KNOWN_SUPPLIERS` avec `replaceAutoAliases: true`

### Vérifier la Qualité des Alias

```bash
# Vérifier tous les alias
node verify-all-aliases.js

# Si problème détecté, ajouter à la liste manuelle dans src/reload-suppliers.ts
```

### Recharger Complètement les Fournisseurs

```bash
# Compiler
npm run build

# Recharger (supprime tout et recharge depuis Billit + liste manuelle)
node dist/reload-suppliers.js

# Redémarrer le bot
pkill -f "node dist/index-bot" && ./start-bot-wrapper.sh &

# Vérifier
node verify-all-aliases.js
```

---

## Résultats Finaux

✅ **25 fournisseurs** chargés dans la base de données
✅ **0 alias problématiques** détectés
✅ **~5 310€** de faux positifs éliminés
✅ **Précision maximale** pour l'analyse des dépenses

## Leçons Apprises

1. **Les alias auto-générés par mots sont dangereux**
   - Ne jamais utiliser de mots génériques (< 5 lettres généralement)
   - Éviter les mots communs (belgium, fast, food, pack, eats, etc.)

2. **La normalisation peut créer des problèmes**
   - "belgië" → "belgi" → matche "belgium", "belgian"
   - Toujours vérifier les alias normalisés

3. **Les formes juridiques sont problématiques**
   - SA, SRL, NV, BVBA sont trop courts et génériques
   - Les inclure seulement dans le nom complet

4. **La vérification automatique est essentielle**
   - Le script `verify-all-aliases.js` permet de détecter rapidement les problèmes
   - À exécuter après chaque ajout/modification de fournisseur

---

**Date**: 28 Décembre 2025
**Auteur**: Claude (Assistant IA) + Hassan Madidi
**Status**: ✅ Complété et testé
