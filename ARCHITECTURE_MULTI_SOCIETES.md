# Architecture Multi-Sociétés - Billit Bot

## Vue d'ensemble

Ce système gère **deux sociétés différentes** avec le **même code source** et la **même infrastructure Billit**.

## 🏢 Les deux sociétés

### 1. Tonton202
- **Bot Telegram** : `@HM205_bot`
- **Token** : `7796037845:AAE4t4zs80j7F8a0G7sAH01WxD4_J6xS8UM`
- **Chemin projet** : `/home/ubuntu/Billit/bot_tonton202`
- **Utilisateurs autorisés** :
  - Hassan (Chat ID: 7887749968)
  - Soufiane (Chat ID: 8006682970)
  - Loubna (Chat ID: 6542906157)
- **Fournisseurs** : 81 fournisseurs enregistrés
- **Base de données** : `/home/ubuntu/Billit/bot_tonton202/supplier-aliases.json`

### 2. MustFood
- **Bot Telegram** : `@MustFood_bot`
- **Token** : `7582823949:AAFb-MP7UVX7f-JgO8aKwoilHw5yy2AxIuI`
- **Chemin projet** : `/home/ubuntu/Billit/bot_mustfood`
- **Utilisateurs autorisés** :
  - Smail (Chat ID: 1082592606)
  - Hassan (Chat ID: 7887749968)
  - Yousra (Chat ID: 7896989437)
- **Fournisseurs** : 96 fournisseurs enregistrés
- **Base de données** : `/home/ubuntu/Billit/bot_mustfood/supplier-aliases.json`

## 🔗 Éléments partagés

### ✅ Identiques dans les deux projets
1. **Code source** : Fichiers `src/` 100% identiques
2. **Scripts utilitaires** : 62 scripts dans chaque projet
3. **API Billit** : Même clé API (`3091375b-f9cc-431c-9ca1-8d2399f1b4a7`)
4. **Party ID Billit** : `37979038` (commun aux deux sociétés)
5. **Structure de projet** : Même organisation
6. **Fonctionnalités** : 24 outils IA identiques

### 📊 Éléments spécifiques à chaque société
1. **Bot Telegram** : Token et nom différents
2. **Utilisateurs autorisés** : Chat IDs différents
3. **Base de données fournisseurs** : Adaptée à chaque société
4. **Fichiers .env** : Configuration spécifique
5. **Logs et données** : Stockés indépendamment

## 🔄 Synchronisation du code

### Quand modifier le code ?

Le code source étant partagé, toute modification doit être **répliquée** dans les deux projets.

### Processus de mise à jour

```bash
# 1. Modifier le code dans UN des projets (ex: tonton202)
cd /home/ubuntu/Billit/bot_tonton202/src
# ... faire les modifications ...

# 2. Compiler
npm run build

# 3. Copier les modifications vers l'autre projet
cp -r src/*.ts /home/ubuntu/Billit/bot_mustfood/src/

# 4. Compiler l'autre projet
cd /home/ubuntu/Billit/bot_mustfood
npm run build

# 5. Redémarrer les deux bots
# Sur @HM205_bot : "Redémarre le bot"
# Sur @MustFood_bot : "Redémarre le bot"
```

### Fichiers à synchroniser

- **Tous les fichiers TypeScript** dans `src/` :
  - `telegram-bot.ts`
  - `command-handler.ts`
  - `ai-agent-service-v2.ts`
  - `billit-client.ts`
  - `bank-client.ts`
  - `voice-service.ts`
  - etc.

- **Fichiers à NE PAS synchroniser** :
  - `.env` (configuration spécifique)
  - `supplier-aliases.json` (fournisseurs spécifiques)
  - `data/` (données locales spécifiques)
  - `bot.log` (logs spécifiques)

## 🛠️ G quotidienne

### Démarrage des bots

**Tonton202 (@HM205_bot)** :
```bash
cd /home/ubuntu/Billit/bot_tonton202
./start-bot-wrapper.sh > bot.log 2>&1 &
```

**MustFood (@MustFood_bot)** :
```bash
cd /home/ubuntu/Billit/bot_mustfood
./start-bot-wrapper.sh > bot.log 2>&1 &
```

### Arrêt des bots

```bash
# Arrêter UN bot spécifique
pkill -f "7796037845"  # Arrêter @HM205_bot
pkill -f "7582823949"  # Arrêter @MustFood_bot

# OU arrêter tous les bots d'un projet
pkill -9 -f "/home/ubuntu/Billit/bot_tonton202.*dist/index-bot"
pkill -9 -f "/home/ubuntu/Billit/bot_mustfood.*dist/index-bot"
```

### Vérifier si les bots tournent

```bash
# Tonton202
ps aux | grep "tonton202.*dist/index-bot"

# MustFood
ps aux | grep "mustfood.*dist/index-bot"

# OU vérifier les deux
pgrep -f "dist/index-bot" -a
```

## 📝 Notes importantes

### API Billit partagée
Les deux sociétés utilisent le **même compte Billit** :
- Même API Key
- Même Party ID
- **Conséquence** : Les deux bots voient les **mêmes factures et transactions** Billit

Cela signifie que :
- Hassan peut voir les mêmes données sur les deux bots
- Les fournisseurs ajoutés par une société sont visibles par l'autre
- Les transactions bancaires sont partagées

### Indépendance des bots
Malgré le code partagé, les bots sont **totalement indépendants** :
- Chaque bot a son propre processus
- Chaque bot gère ses propres utilisateurs
- Chaque bot a sa propre base de conversations IA
- Un plantage de l'un n'affecte pas l'autre

### Gestion des fournisseurs

Chaque société peut ajouter ses propres fournisseurs :

**Tonton202** :
```bash
cd /home/ubuntu/Billit/bot_tonton202
npx ts-node add-supplier.ts "Nouveau Fournisseur"
```

**MustFood** :
```bash
cd /home/ubuntu/Billit/bot_mustfood
npx ts-node add-supplier.ts "Nouveau Fournisseur"
```

Les bases de données fournisseurs sont **indépendantes**.

## 🔧 Maintenance

### Mise à jour d'une nouvelle fonctionnalité

1. Développer et tester dans **un** projet
2. Une fois validé, copier le code vers l'autre projet
3. Compiler les deux projets
4. Redémarrer les deux bots

### Résolution de problèmes

Si un bot a un problème :
1. Vérifier les logs du bot concerné
2. Le problème est **spécifique** à ce bot (configuration, utilisateurs, etc.)
3. Si c'est un bug de code, le corriger **dans les deux projets**

### Sauvegardes

**À sauvegarder régulièrement** :
- `supplier-aliases.json` (fournisseurs)
- `.env` (configuration)
- `data/processed-invoices.json` (historique)

## 📊 Statistiques actuelles

| Métrique | Tonton202 | MustFood |
|----------|-----------|----------|
| Fournisseurs | 81 | 96 |
| Utilisateurs | 3 | 3 |
| Scripts utilitaires | 62 | 62 |
| Outils IA | 24 | 24 |
| Lignes de code TypeScript | ~6000 | ~6000 |

## 🚀 Évolutions futures

### Ajouter une troisième société

Pour ajouter un nouveau bot pour une autre société :

1. **Créer le nouveau bot Telegram**
   - Contacter @BotFather
   - Créer un nouveau bot
   - Copier le token

2. **Dupliquer le projet**
   ```bash
   cp -r /home/ubuntu/Billit/bot_tonton202 /home/ubuntu/Billit/nouvelle-societe
   cd /home/ubuntu/Billit/nouvelle-societe
   ```

3. **Configurer l'environnement**
   - Modifier `.env` avec le nouveau token
   - Définir les Chat IDs autorisés
   - Adapter la base de données fournisseurs

4. **Compiler et démarrer**
   ```bash
   npm run build
   ./start-bot-wrapper.sh > bot.log 2>&1 &
   ```

5. **Personnaliser**
   - Ajouter les fournisseurs spécifiques
   - Configurer les utilisateurs

## 📞 Support

- **Développeur** : Hassan (Chat ID: 7887749968)
- **Documentation** : Ce fichier + `CLAUDE.md`
- **Projets** :
  - Tonton202 : `/home/ubuntu/Billit/bot_tonton202`
  - MustFood : `/home/ubuntu/Billit/bot_mustfood`

---

**Dernière mise à jour** : 24 décembre 2025
**Version** : 2.5 (Agent IA autonome V2)
**Statut** : Production ✅
