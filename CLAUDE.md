# Billit Telegram Bot - Documentation pour Claude

## Vue d'ensemble

Bot Telegram interactif pour gérer les factures Billit avec IA autonome, reconnaissance vocale et support multi-utilisateurs.

## ⚠️ IMPORTANT - Structure du projet

### 📱 Bots Telegram (répertoire `/home/ubuntu/Billit/`)
- **tonton202** : Bot Telegram pour le compte "tonton202"
- **mustfood** : Bot Telegram pour Mustfood
- **Ces bots sont gérés avec les scripts `sync.sh` et `start-bot-wrapper.sh`**

### 🌐 Autres applications (répertoire `/home/ubuntu/tonton.app/apps/production/`)
- **tonton202, mustfood, testing, portail** : Applications web/services différents (gérés par PM2)
- **⚠️ NE PAS Y TOUCHER** quand on travaille sur les bots Telegram et inversement
- Ce sont des applications complètement séparées

## Stack technique

- **Runtime**: Node.js 18+
- **Langage**: TypeScript
- **API**: Billit API, Telegram Bot API, OpenRouter/Groq (IA)
- **Déploiement**: VPS Linux (Ubuntu), PM2 ou scripts manuels

## Commandes essentielles

### Développement
```bash
npm run dev          # Mode développement avec rechargement
npm run build        # Compiler TypeScript
npm run start:bot    # Démarrer le bot (production)
npm run start        # Démarrer le notifier uniquement
```

### Déploiement
```bash
./start-bot.sh       # Démarrage simple
./start-bot-wrapper.sh  # Démarrage avec auto-redémarrage
```

### Git
```bash
git status           # Voir les modifications
git add .            # Ajouter tous les fichiers
git commit -m "msg"  # Commiter
git push origin main # Pousser sur GitHub
```

### Gestion des processus
```bash
# Voir les processus des bots Telegram
ps aux | grep "node dist/index-bot" | grep -v grep

# Identifier quel bot tourne (tonton202 ou mustfood)
pwdx <PID>  # Affiche le répertoire de travail du processus

# Tuer un bot spécifique
pkill -f "/home/ubuntu/Billit/tonton202.*node.*dist/index-bot"  # Tonton202
pkill -f "/home/ubuntu/Billit/mustfood.*node.*dist/index-bot"   # Mustfood

# Tuer tous les bots Telegram
pkill -f "/home/ubuntu/Billit.*node.*dist/index-bot"
```

## Architecture du projet

### Fichiers principaux

```
src/
├── index-bot.ts              # Point d'entrée du bot interactif
├── index.ts                  # Point d'entrée du notifier
├── telegram-bot.ts           # Bot Telegram interactif (MAIN)
├── command-handler.ts        # Gestionnaire de commandes
├── config.ts                 # Configuration centralisée
├── ai-agent-service-v2.ts    # Agent IA autonome avec function calling
├── ai-conversation-service.ts # Service de conversation IA
├── voice-service.ts          # Service de reconnaissance vocale
├── bank-client.ts            # Client Billit Bank
├── billit-client.ts          # Client API Billit principal
├── invoice-monitoring-service.ts # Monitoring automatique des factures
├── intent-service.ts         # Classification des intentions
├── supplier-aliases.ts       # Gestion des alias fournisseurs
└── utils/
    ├── security.ts           # Utilitaires de sécurité
    ├── validation.ts         # Validation des entrées
    ├── rate-limiter.ts       # Rate limiting
    └── string-utils.ts       # Utilitaires de chaînes
```

### Fichiers de configuration

```
.env                    # Variables d'environnement (NE PAS COMMIT)
.env.example           # Template de configuration
package.json           # Dépendances npm
tsconfig.json          # Configuration TypeScript
supplier-aliases.json  # Alias des fournisseurs
```

## Fonctionnalités clés

### 1. Support Multi-Utilisateurs ✅
- **Chaque utilisateur reçoit ses propres réponses**
- Whitelist via `TELEGRAM_ALLOWED_CHAT_IDS` dans `.env`
- Chat IDs configurés (pour tonton202):
  - Hassan (propriétaire): 7887749968
  - Soufiane: 8006682970
  - Loubna: 6542906157

**Implementation**: `currentChatId` dans `telegram-bot.ts` (ligne ~20)

### 2. Agent IA Autonome V2
- **Function calling** avec OpenRouter (gpt-4o-mini)
- 24 outils disponibles (factures, paiements, recherche, etc.)
- Compréhension contextuelle des requêtes
- **Fichier**: `src/ai-agent-service-v2.ts`

### 3. Reconnaissance Vocale
- Transcription via Groq Whisper
- Compréhension IA des commandes vocales
- Support des messages vocaux Telegram

### 4. Monitoring Automatique des Factures
- Vérification toutes les 5 minutes (configurable)
- Détection des nouvelles factures (payées et impayées)
- Stockage des factures traitées dans `data/processed-invoices.json`
- Notifications automatiques

### 5. Commandes Disponibles

#### Commandes de base
- `/start` - Menu principal
- `/help` - Aide
- `/unpaid` - Factures impayées
- `/overdue` - Factures en retard
- `/stats` - Statistiques

#### Commandes de recherche
- `/search <mot-clé>` - Rechercher des factures
- `/supplier <nom>` - Filtrer par fournisseur
- `/lastinvoice <n>` - Dernières factures

#### Commandes admin
- `/adduser <chat_id>` - Ajouter un utilisateur autorisé
- `/removeuser <chat_id>` - Supprimer un utilisateur
- `/listusers` - Lister les utilisateurs autorisés
- `/restart_bot` - Redémarrer le bot (AI tool)

### 6. Sécurité
- **Whitelist** des Chat IDs autorisés
- **Rate limiting** par catégorie (general, AI, voice)
- **Validation** des entrées utilisateur
- **Sanitization** des messages d'erreur
- **Protection** contre les injections

## Configuration

### Variables d'environnement essentielles

```bash
# Billit API
BILLIT_API_URL=https://api.billit.be
BILLIT_API_KEY=votre_api_key
BILLIT_PARTY_ID=votre_party_id

# Telegram
TELEGRAM_BOT_TOKEN=votre_token
TELEGRAM_CHAT_ID=chat_id_par_défaut
TELEGRAM_ALLOWED_CHAT_IDS=id1,id2,id3  # Multi-utilisateurs

# IA (Groq ou OpenRouter)
GROQ_API_KEY=votre_key_groq
OPENROUTER_API_KEY=votre_key_openrouter
OPENROUTER_MODEL=openai/gpt-4o-mini

# Sécurité
VERBOSE_ERRORS=false
MAX_INPUT_LENGTH=500

# Monitoring
INVOICE_MONITORING_ENABLED=true
INVOICE_MONITORING_INTERVAL=5
```

## Workflow de développement

### 1. Modifications du code
```bash
# Éditer les fichiers TypeScript
# Compiler
npm run build

# Si erreurs TypeScript, corriger et recompiler
npm run build
```

### 2. Tests
```bash
# Démarrer le bot
npm run start:bot

# Tester depuis Telegram avec les commandes
# Vérifier les logs en temps réel
```

### 3. Déploiement
```bash
# Tuer les anciens processus
pkill -f "npm run start:bot"

# Commiter les changements
git add .
git commit -m "description"
git push origin main
```

---

## 🔄 WORKFLOW MULTI-BOTS (SYSTÈME DE SYNCHRONISATION)

### Vue d'ensemble

Ce projet utilise **Git avec des branches** pour gérer **deux bots Telegram séparés** :

- **tonton202** (branche `main`) - Bot Telegram pour le compte "tonton202"
- **mustfood** (branche `mustfood`) - Bot Telegram pour Mustfood

**Le code source est partagé**, mais chaque bot a sa propre configuration (`.env`).

**⚠️ IMPORTANT** : Les bots Telegram dans `/home/ubuntu/Billit/` sont différents des applications web dans `/home/ubuntu/tonton.app/apps/production/` gérées par PM2.

### 🚀 Synchronisation automatique

La commande magique pour synchroniser les deux bots :

```bash
# OPTION 1: Depuis le répertoire du bot
cd /home/ubuntu/Billit/tonton202
sync

# OPTION 2: Depuis n'importe où
synchronise
```

#### Ce que fait la commande `sync`

Le script détecte automatiquement votre branche et synchronise vers l'autre bot :

| Vous êtes sur | Il synchronise vers |
|--------------|-------------------|
| `main` (Tonton202) | `mustfood` |
| `mustfood` | `main` (Tonton202) |

**Le workflow automatique (8 étapes)** :

1. ✅ **Vérification** des modifications non commitées
2. ✅ **Commit** automatique (demande le message si nécessaire)
3. ✅ **Compilation** du code
4. ✅ **Push** vers GitHub (branche actuelle)
5. ✅ **Merge** vers l'autre branche
6. ✅ **Push** de l'autre branche
7. ✅ **Déploiement** sur l'instance de développement
8. ✅ **Redémarrage** du bot cible (uniquement le bot spécifique, pas l'autre)
9. ✅ **Retour** à votre branche de travail

**⚠️ Correctif important** : Le script `sync.sh` utilise maintenant `pgrep` + `pwdx` pour identifier précisément les processus à tuer en fonction de leur répertoire de travail. Cette approche :
- Trouve tous les PIDs de `node dist/index-bot`
- Vérifie le répertoire de travail avec `pwdx`
- Tue uniquement les processus qui tournent dans le répertoire cible
- **Évite les doublons** et permet aux deux bots de tourner en parallèle sans se perturber

### 📋 Exemple d'utilisation

#### Scénario 1 : Travailler sur Tonton202 → partager vers Mustfood

```bash
# 1. Faire vos modifications
cd /home/ubuntu/Billit/tonton202
vim src/telegram-bot.ts

# 2. Tester localement
npm run build && npm run start:bot

# 3. Synchroniser vers Mustfood
sync

# ✨ C'est tout ! Tout est fait automatiquement
```

#### Scénario 2 : Travailler sur Mustfood → partager vers Tonton202

```bash
# 1. Basculer vers mustfood
git checkout mustfood

# 2. Faire vos modifications
vim src/config.ts

# 3. Tester
npm run build && npm run start:bot

# 4. Synchroniser vers Tonton202
sync

# Terminé !
```

### 📁 Structure des répertoires

```
/home/ubuntu/Billit/
├── tonton202/          # Espace de travail principal (main)
│   ├── src/            # Code source
│   ├── .env            # Config Tonton202
│   ├── sync.sh         # Script de synchronisation
│   ├── deploy-all.sh   # Déploiement global
│   └── WORKFLOW.md     # Documentation détaillée
│
└── mustfood/           # Instance Mustfood (mustfood)
    ├── src/            # Code source synchronisé
    └── .env            # Config Mustfood (différente)

/home/ubuntu/tonton.app/apps/production/
├── tonton202/          # Production Tonton202
└── mustfood/           # Production Mustfood
```

### 🔧 Scripts disponibles

| Script | Description |
|--------|-------------|
| `sync` ou `synchronise` | **Synchronisation automatique complète** entre les deux bots |
| `./deploy-all.sh` | Déploie sur dev + production de la branche actuelle |
| `./deploy-to-mustfood.sh` | Copie uniquement vers mustfood dev |
| `./start-bot-wrapper.sh` | Démarre le bot avec auto-redémarrage |

### 💡 Bonnes pratiques

1. **Toujours tester avant de sync**
   ```bash
   npm run build && npm run start:bot
   sync  # Seulement après avoir testé
   ```

2. **Messages de commit clairs**
   ```bash
   git commit -m "feat: add invoice search by date"
   ```

3. **Travailler sur une seule branche à la fois**
   - Préférez travailler sur `main` pour le développement principal
   - Utilisez `git checkout mustfood` uniquement pour les modifications spécifiques à Mustfood

4. **Vérifier les branches**
   ```bash
   git branch          # Voir la branche actuelle
   git status          # Voir l'état
   ```

### 🎯 Commandes Git essentielles

```bash
# Voir la branche actuelle
git branch

# Changer de branche
git checkout main      # ou mustfood

# Créer une nouvelle branche
git checkout -b nouvelle-fonctionnalite

# Voir les modifications
git status
git diff

# Commiter
git add .
git commit -m "message"

# Pousser
git push origin main
git push origin mustfood

# Merger manuellement (si sync ne fonctionne pas)
git checkout mustfood
git merge main
```

### 📖 Documentation détaillée

- **`WORKFLOW.md`** - Guide complet du workflow multi-bots
- **`SYNC_GUIDE.md`** - Guide d'utilisation de la commande `sync`
- **`CLAUDE.md`** - Ce fichier (documentation générale)

### 🚨 Dépannage

**Conflits Git lors du merge** :
```bash
# Résoudre les conflits manuellement
vim src/fichier_conflit.ts

# Marquer comme résolu
git add src/fichier_conflit.ts
git commit -m "chore: resolve merge conflicts"
```

**Le bot ne redémarre pas après sync** :
```bash
# Vérifier s'il y a déjà une instance
ps aux | grep "dist/index-bot"

# Tuer l'ancienne instance
pkill -f "npm run start:bot"

# Redémarrer manuellement
cd /home/ubuntu/Billit/mustfood
./start-bot-wrapper.sh &
```

**.env manquant sur mustfood** :
```bash
# Copier le template
cp /home/ubuntu/Billit/tonton202/.env.example /home/ubuntu/Billit/mustfood/.env

# Éditer avec les valeurs Mustfood
vim /home/ubuntu/Billit/mustfood/.env
```

### ⚡ Raccourcis

```bash
# Voir l'historique des commits
git log --oneline --graph --all

# Annuler des modifications locales
git restore fichier.ts

# Voir les fichiers modifiés
git status --short

# Annuler le dernier commit (garder les modifications)
git reset --soft HEAD~1

# Revenir au commit précédent (annuler les modifications)
git reset --hard HEAD~1
```

### 📊 Résumé du workflow

```
┌─────────────────────────────────────────┐
│  1. Travailler sur main (tonton202)     │
│     vim src/fichier.ts                  │
└─────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────┐
│  2. Tester localement                   │
│     npm run build && npm start          │
└─────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────┐
│  3. Synchroniser avec Mustfood          │
│     sync                                │
└─────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────┐
│  ✅ Tout est fait automatiquement :     │
│     - Commit → Push → Merge             │
│     - Déploiement → Redémarrage         │
└─────────────────────────────────────────┘
```

---

## Fichiers à ne JAMAIS commit

- `.env` (contient des secrets)
- `data/*.json` (données locales)
- `dist/` (généré)
- `node_modules/` (dépendances)
- Fichiers avec des API keys

## Debugging

### Vérifier si le bot tourne
```bash
pgrep -f "dist/index-bot"
ps aux | grep "npm"
```

### Voir les logs en direct
```bash
# Si lancé avec background
tail -f /dev/null  # Pas de fichier log, utiliser la sortie stdout

# Depuis le shell actif
# Les logs apparaissent directement dans la console
```

### Problèmes fréquents

**Erreur 409 Conflict**:
- Plusieurs instances du bot tournent
- Solution: `pkill -9 -f "npm run start:bot"` puis redémarrer

**Les deux bots s'arrêtent quand on en démarre un** ou **Doublons de processus**:
- Correctif appliqué dans commit bd2555e
- Le script `sync.sh` utilise `pgrep` + `pwdx` pour identifier le processus exact à tuer
- Chaque processus est vérifié par son répertoire de travail avant d'être tué

**Réponses vont au mauvais utilisateur**:
- Bug multi-user corrigé dans commit 38d52a6
- Vérifier que `currentChatId` est utilisé dans `telegram-bot.ts`

**Bot ne répond pas**:
- Vérifier que le Chat ID est dans la whitelist
- Vérifier `.env` pour les bons tokens
- Redémarrer le bot

## Structure des données

### Facture Billit
```typescript
{
  id: string,
  supplierId: string,
  number: string,
  invoiceDate: string,
  dueDate: string,
  totalAmount: number,
  currency: string,
  status: 'paid' | 'pending' | 'overdue',
  pdfUrl?: string
}
```

### État de conversation IA
```typescript
{
  messages: Array<{
    role: 'user' | 'assistant' | 'system',
    content: string,
    timestamp: number
  }>,
  lastSaved: number
}
```

## Historique des versions récentes

### Commit bd2555e (25 déc 2025)
- **FIX**: Amélioration de la détection des processus bot avec `pgrep` + `pwdx`
- Prévention des instances dupliquées lors de la synchronisation
- Le script vérifie maintenant le répertoire de travail de chaque processus pour tuer uniquement le bot cible
- **Plus de doublons** lors du redémarrage des bots

### Commit 9924383 (25 déc 2025)
- **FIX**: Première tentative de correction du script sync.sh
- Utilisation de `pkill -f "$DEV_PATH.*node.*dist/index-bot"` (partiellement efficace)

### Commit 38d52a6 (24 déc 2025)
- **FIX**: Support multi-utilisateur corrigé
- Ajout de `currentChatId` pour suivre l'utilisateur actuel
- Correction de tous les handlers et sendMessage

### Commit 535f6d9 (précédent)
- Agent IA autonome V2.5
- 24 outils function calling
- Monitoring automatique des factures
- Script d'auto-redémarrage

## Contact et support

- **Propriétaire**: Hassan (Chat ID: 7887749968)
- **Utilisateurs**: Soufiane (8006682970), Loubna (6542906157)
- **Repository**: GitHub (privé)
- **Documentation**: Voir fichiers `.md` dans le projet

## Notes importantes

1. **Toujours compiler** avant de committer: `npm run build`
2. **Ne jamais exposer** les API keys dans le code ou Git
3. **Tester avec tous les utilisateurs** après modifications multi-user
4. **Sauvegarder sur GitHub** après chaque correction importante
5. **Vérifier les logs** en cas de comportement inattendu
6. **Utiliser `sync`** pour synchroniser les modifications entre Tonton202 et Mustfood

---

**Dernière mise à jour**: 25 décembre 2025
**Version du bot**: 2.5 avec IA autonome + Système multi-bots
**Statut**: Production ✅
**Nouveau**:
- Synchronisation automatique avec commande `sync` 🔄
- Correctif: Les deux bots peuvent tourner en parallèle sans se perturber 🔧
