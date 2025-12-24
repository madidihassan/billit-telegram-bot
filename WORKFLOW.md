# Workflow Multi-Bots Billit

## 📋 Vue d'ensemble

Ce projet utilise **Git avec des branches** pour gérer deux bots Telegram séparés :
- **tonton202** (branche `main`)
- **mustfood** (branche `mustfood`)

Le code source est partagé, mais chaque bot a sa propre configuration.

## 🚀 Workflow quotidien

### 1. Travailler sur Tonton202

```bash
# S'assurer d'être sur la branche main
git checkout main

# Faire vos modifications
vim src/telegram-bot.ts

# Tester localement
npm run build
npm run start:bot

# Commiter
git add .
git commit -m "feat: nouvelle fonctionnalité"

# Déployer
./deploy-all.sh
```

### 2. Travailler sur Mustfood

```bash
# Basculer sur la branche mustfood
git checkout mustfood

# Faire vos modifications spécifiques à mustfood
vim src/config.ts

# Tester localement
npm run build
npm run start:bot

# Commiter
git add .
git commit -m "feat: fonctionnalité mustfood"

# Déployer
./deploy-all.sh
```

### 3. Partager du code entre les bots

```bash
# Exemple: Vous avez développé une nouvelle fonctionnalité sur main
# et vous voulez la partager avec mustfood

# 1. Sur main (tonton202)
git checkout main
git add .
git commit -m "feat: nouvelle fonctionnalité partagée"
git push origin main

# 2. Merger dans mustfood
git checkout mustfood
git merge main

# 3. Adapter la configuration si nécessaire
vim .env  # Adapter les valeurs spécifiques à mustfood

# 4. Déployer
./deploy-all.sh
```

## 📂 Structure des fichiers

### Partagés (dans Git)
- `src/` - Tout le code source
- `package.json` - Dépendances
- `tsconfig.json` - Configuration TypeScript
- `*.md` - Documentation
- `.env.example` - Template de configuration

### Spécifiques à chaque instance (exclus de Git)
- `.env` - Configuration de l'instance
- `data/` - Données locales (conversations, factures traitées)
- `supplier-aliases.json` - Alias fournisseurs
- `*.log` - Logs

## 🔧 Scripts disponibles

### `deploy-all.sh`
Déploie les modifications sur toutes les instances (dev + production)

```bash
./deploy-all.sh
```

**Fonctions:**
- Compile le code
- Copie vers l'instance de développement
- Propose le déploiement en production
- Propose le redémarrage du bot

### `deploy-to-mustfood.sh`
Déploie uniquement vers l'instance mustfood de développement

```bash
./deploy-to-mustfood.sh
```

### `start-bot-wrapper.sh`
Démarre le bot avec auto-redémarrage

```bash
./start-bot-wrapper.sh &
```

## 📝 Bonnes pratiques

### 1. Commits clairs
```bash
# ✅ Bon
git commit -m "feat: add invoice search by date range"

# ❌ Mauvais
git commit -m "update"
```

### 2. Tester avant de déployer
```bash
# Toujours tester en local
npm run build
npm run start:bot

# Puis déployer
./deploy-all.sh
```

### 3. Ne jamais commit les fichiers sensibles
```bash
# Ces fichiers sont dans .gitignore
.env
data/
*.log
```

### 4. Synchroniser régulièrement
```bash
# Avant de travailler, mettre à jour
git pull origin main

# Après avoir travaillé, pousser
git push origin main
```

## 🔄 Branches Git

### `main` (Tonton202)
- Bot principal pour Hassan
- Configuration: `.env`
- Chat IDs: 7887749968, 8006682970, 6542906157

### `mustfood` (Mustfood)
- Bot pour Mustfood
- Configuration: `.env.mustfood` (à créer)
- Chat IDs: (à configurer)

## 🚨 Dépannage

### Le bot ne démarre pas
```bash
# Vérifier s'il y a déjà une instance
ps aux | grep "dist/index-bot"

# Tuer l'ancienne instance
pkill -f "npm run start:bot"

# Redémarrer
./start-bot-wrapper.sh &
```

### Conflits Git lors du merge
```bash
# Résoudre les conflits manuellement
vim src/fichier_conflit.ts

# Marquer comme résolu
git add src/fichier_conflit.ts
git commit -m "chore: resolve merge conflicts"
```

### .env manquant
```bash
# Copier le template
cp .env.example .env

# Éditer avec les bonnes valeurs
vim .env
```

## 📖 Commandes Git essentielles

```bash
# Voir la branche actuelle
git branch

# Changer de branche
git checkout main  # ou mustfood

# Créer une nouvelle branche
git checkout -b nouvelle-fonctionnalite

# Voir les modifications
git status
git diff

# Annuler des modifications locales
git restore fichier.ts

# Voir l'historique
git log --oneline --graph --all
```

## 🎯 Tips

1. **Toujours compiler** avant de déployer: `npm run build`
2. **Vérifier les logs** après déploiement
3. **Tester sur Telegram** avant de considérer le déploiement terminé
4. **Sauvegarder sur GitHub** régulièrement: `git push`
5. **Documenter les changements** dans les commits

---

**Dernière mise à jour**: 24 décembre 2025
**Version**: 1.0
