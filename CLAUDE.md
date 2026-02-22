# Billit Telegram Bot - Documentation pour Claude

## Vue d'ensemble

Bot Telegram interactif pour gérer les factures Billit avec IA autonome, reconnaissance vocale et support multi-utilisateurs.

## ⚠️ IMPORTANT - Structure du projet

### 📱 Bots Telegram (répertoire `/home/ubuntu/Billit/`)
- **bot_tonton202** : Bot Telegram pour le compte "tonton202" (⚠️ avec préfixe "bot_")
- **bot_mustfood** : Bot Telegram pour Mustfood (⚠️ avec préfixe "bot_")
- **Ces bots sont gérés par **PM2** (`bot-tonton202` et `bot-mustfood`) depuis le 22 fév 2026**
- Anciens scripts wrapper (`start-bot-safe.sh`, `start-bot-wrapper.sh`) conservés mais **ne plus utiliser**

### 🌐 Autres applications (répertoire `/home/ubuntu/tonton.app/apps/production/`)
- **tonton202, mustfood, testing, portail** : Applications web/services différents (gérés par PM2, ⚠️ SANS préfixe "bot_")
- **⚠️ NE PAS Y TOUCHER** quand on travaille sur les bots Telegram et inversement
- **⚠️ NE PAS CONFONDRE** : Les bots sont "bot_tonton202" et "bot_mustfood", les apps web sont "tonton202" et "mustfood"
- Ce sont des applications complètement séparées

## Stack technique

- **Runtime**: Node.js 18+
- **Langage**: TypeScript
- **API**: Billit API, Telegram Bot API, OpenRouter/Groq (IA)
- **Déploiement**: VPS Linux (Ubuntu), PM2 ou scripts manuels

## ⚠️ CONTRAINTES API BILLIT

### Limite de pagination
- **Maximum 120 factures par requête** : L'API Billit accepte un maximum de `limit: 120` dans les appels `getInvoices()`
- ⚠️ **NE JAMAIS dépasser cette limite** sous peine d'erreur 400
- Tous les appels à `billitClient.getInvoices()` doivent utiliser `{ limit: 120 }` maximum
- Pour récupérer plus de 120 factures, utiliser la pagination (voir `bank-client.ts` pour exemple)

## Commandes essentielles

### Développement
```bash
npm run dev          # Mode développement avec rechargement
npm run build        # Compiler TypeScript
npm run start:bot    # Démarrer le bot (production)
npm run start        # Démarrer le notifier uniquement
```

### Déploiement (PM2 — depuis le 22 fév 2026)
```bash
# ⭐ COMMANDES PM2 À UTILISER
pm2 restart bot-tonton202   # Redémarrer tonton202
pm2 restart bot-mustfood    # Redémarrer mustfood
pm2 stop bot-tonton202      # Arrêter tonton202
pm2 logs bot-tonton202      # Logs en temps réel
pm2 logs bot-mustfood       # Logs en temps réel
pm2 list                    # Voir l'état de tous les processus

# Config PM2 (ecosystem)
# bot_tonton202/ecosystem-bot.config.js  → name: 'bot-tonton202'
# bot_mustfood/ecosystem-bot.config.js   → name: 'bot-mustfood'

# ⚠️ NE PLUS UTILISER les anciens scripts wrapper :
# ./start-bot-safe.sh, ./start-bot-wrapper.sh (conservés mais obsolètes)
```

**⚠️ IMPORTANT** : PM2 garantit une seule instance par bot — ne jamais lancer `./start-bot-safe.sh` en parallèle

### Git
```bash
git status           # Voir les modifications
git add .            # Ajouter tous les fichiers
git commit -m "msg"  # Commiter
git push origin main # Pousser sur GitHub
```

### Gestion des processus
```bash
# ⭐ AVEC PM2 (méthode recommandée)
pm2 list                        # État de tous les processus
pm2 restart bot-tonton202       # Redémarrer tonton202
pm2 restart bot-mustfood        # Redémarrer mustfood
pm2 logs bot-tonton202 --lines 50  # Dernières lignes de log
pm2 describe bot-tonton202      # Détails du processus

# En cas de problème grave (reset complet)
pm2 delete bot-tonton202
pm2 start /home/ubuntu/Billit/bot_tonton202/ecosystem-bot.config.js
pm2 save
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
- **⚠️ NOTE IMPORTANTE** : La liste des utilisateurs change dynamiquement. Pour connaître la liste ACTUELLE, utiliser l'outil `list_users()` - NE PAS se fier à cette documentation qui peut être obsolète.
- Exemples de Chat IDs (non exhaustif, peut avoir changé) :
  - Hassan (propriétaire): 7887749968
  - Soufiane: 8006682970

**Implementation**: `currentChatId` dans `telegram-bot.ts` (ligne ~20)

### 2. Agent IA Autonome V3.0 🚀
- **Function calling** avec OpenRouter (gpt-4o-mini)
- **49 outils disponibles** (factures, paiements, salaires, fournisseurs, analytics, prédictions, etc.)
- **Chargement dynamique** : Sélection intelligente des outils pertinents (économie ~70% tokens)
- **Hints dynamiques** : Instructions contextuelles pour améliorer la précision
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
# ⭐ AVEC PM2 (méthode recommandée depuis le 22 fév 2026)
npm run build                   # Compiler le code
pm2 restart bot-tonton202       # Redémarrer le bot (PM2 garantit 1 seule instance)

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
cp /home/ubuntu/Billit/bot_tonton202/.env.example /home/ubuntu/Billit/bot_mustfood/.env

# Éditer avec les valeurs Mustfood
vim /home/ubuntu/Billit/bot_mustfood/.env
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

**Erreur 409 Conflict** (plusieurs instances du bot):
- ✅ **RÉSOLU définitivement** (22 fév 2026) : Migration vers PM2
- PM2 garantit une seule instance par nom de processus
- **Diagnostic** :
  ```bash
  pm2 list                    # Voir l'état
  pm2 logs bot-tonton202      # Voir les erreurs
  ```
- **Solution** :
  ```bash
  pm2 restart bot-tonton202   # Redémarrage propre
  # ou en cas de problème grave :
  pm2 delete bot-tonton202
  pm2 start /home/ubuntu/Billit/bot_tonton202/ecosystem-bot.config.js
  pm2 save
  ```

**Les deux bots s'arrêtent quand on en démarre un**:
- ✅ **RÉSOLU** : PM2 gère chaque bot indépendamment par nom (`bot-tonton202`, `bot-mustfood`)

**Réponses vont au mauvais utilisateur**:
- Bug multi-user corrigé dans commit 38d52a6
- Vérifier que `currentChatId` est utilisé dans `telegram-bot.ts`

**Bot ne répond pas**:
- Vérifier que le Chat ID est dans la whitelist
- Vérifier `.env` pour les bons tokens
- Vérifier qu'un seul bot tourne : `ps aux | grep "node dist/index-bot"`
- Redémarrer le bot avec `./start-bot-safe.sh`

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

### Commit (25 jan 2026) - Système anti-doublons définitif ✅
- **FIX CRITIQUE**: Résolution définitive du problème de processus bot multiples
- **Problème identifié** : Race condition dans le système de redémarrage créait des instances multiples
  - Wrappers en boucle infinie relançaient le bot sans vérification
  - Détection défaillante : bot démarrait mais n'était pas détecté → relançage → doublons
  - Lancements simultanés de `start-bot-safe.sh` créaient des wrappers concurrents

#### 🛡️ Solutions implémentées (3 niveaux de protection) :

1. **Système de fichier PID** (`.bot-wrapper.pid`)
   - Track le PID du wrapper actif
   - Vérifie et tue le wrapper existant avant de démarrer un nouveau
   - Cleanup automatique avec `trap` à la sortie

2. **Système de verrouillage** (`.bot-start.lock`)
   - Empêche plusieurs lancements simultanés de `start-bot-safe.sh`
   - Vérifie si un processus de démarrage est déjà en cours
   - Abandon automatique pour éviter les doublons

3. **Détection améliorée du bot**
   - ❌ Avant : `pgrep -f "$BOT_DIR.*dist/index-bot"` (ne fonctionnait pas)
   - ✅ Maintenant : Cherche tous les processus, filtre avec `pwdx` pour vérifier le répertoire
   - Détection fiable basée sur le répertoire de travail réel du processus

4. **Intégration dans `sync.sh`**
   - Tue le wrapper via fichier PID en priorité (méthode fiable)
   - Cherche et nettoie les wrappers orphelins (sécurité supplémentaire)
   - Évite les conflits entre bot_tonton202 et bot_mustfood

#### 📊 Résultat :
- ✅ **Garantie : Un seul bot par dossier**
- ✅ Plus d'erreurs 409 Conflict de Telegram
- ✅ Redémarrage sûr avec `sync` ou `./start-bot-safe.sh`
- ✅ Les deux bots (tonton202 et mustfood) peuvent tourner en parallèle sans se perturber

#### 📝 Fichiers modifiés :
- `start-bot-safe.sh` : Système PID + verrouillage + détection améliorée (56 lignes modifiées)
- `start-bot-wrapper.sh` : Cleanup PID avec trap, compteurs, exclusion PPID (28 lignes)
- `sync.sh` : Kill via fichier PID, gestion wrappers orphelins (17 lignes)

---

### Commit 1065e25 (28 déc 2025) - Analyse complète mois unique
- **FEAT**: Analyse complète pour mois unique quand "analyse" demandée
- Quand l'utilisateur demande "analyse les salaires du mois de X", affiche l'analyse complète (top employés, stats)
- Différence : "salaires de décembre" → concis vs "analyse salaires décembre" → détaillé
- **Fichiers modifiés** : `ai-agent-service-v2.ts` (3 insertions, 2 suppressions)

### Commit 5ef75d3 (28 déc 2025) - Détection "top X" améliorée
- **REFINE**: Amélioration détection "top X" pour variantes de formulation
- Support de : "top 10", "les 10 employés", "les 10 employés les mieux payés"
- Pattern regex amélioré pour extraire le nombre dans toutes les formulations
- **Tests validés** : "les 10 employés les mieux payés" → affiche Top 10 ✅
- **Fichiers modifiés** : `ai-agent-service-v2.ts` (9 insertions, 7 suppressions)

### Commit 7cdbbde (28 déc 2025) - 7 corrections majeures salaires
- **FEAT**: Advanced salary query improvements with 7 major fixes
- **185 lignes de code ajoutées** pour améliorer l'intelligence du système

#### 🎯 Les 7 corrections majeures :

1. **✅ Fuzzy matching avec ordre inversé des noms**
   - "Mokhlis Jamhoun" trouve maintenant "Jamhoun Mokhlis"
   - Appliqué dans `findClosestEmployee()`, `findSimilarEmployees()`, et `compare_employee_salaries`
   - Utilise l'algorithme de Levenshtein avec test d'ordre inversé

2. **✅ Recherche partielle prioritaire sur base de données**
   - "lina" affiche uniquement Tag Lina (pas El Jaouhari ni Ben Yamoune)
   - Cherche d'abord dans les noms d'employés BDD avant les descriptions de transactions
   - Évite les faux positifs comme "Sa**lina**"

3. **✅ Liste détaillée masquée pour mois unique >10 transactions**
   - "analyse salaires de décembre" affiche juste le total (26611.52€, 22 paiements)
   - Ne surcharge plus avec 22 lignes de détails
   - Condition : `isSingleMonthManyTransactions`

4. **✅ Support natif des périodes multi-mois**
   - Nouveaux paramètres : `start_month` et `end_month`
   - "salaires entre octobre et décembre" affiche les 3 mois avec titre "octobre à décembre 2025"
   - Total : 74044.20€ (69 paiements) pour la période exacte

5. **✅ Détection de comparaison sans mot "salaire"**
   - "compare kalide chami et mokhlis jamhoun" fonctionne maintenant
   - Pattern de détection amélioré (suppression de la condition `includes('salaire')`)

6. **✅ Détection de classement ("où se situe X")**
   - "où se situe mokhlis jamhoun par rapport aux autres employés" détecté
   - Nouveau pattern regex pour questions de classement
   - Affiche position, médiane, et comparaison

7. **✅ Top N sans liste détaillée**
   - "top 3 des employés" affiche juste le top 3 (pas 72 transactions)
   - Condition : `userAsksForTopOnly` détecte les requêtes "top X" sans "liste"

#### 📊 Tests validés (15/15) :
- ✅ Fuzzy matching : "khalid chami" → "Kalide Chami"
- ✅ Recherche partielle : "lina" → Tag Lina uniquement
- ✅ Décembre sans liste : Total uniquement
- ✅ Top 10 détecté : Variantes de formulation
- ✅ MIN/MAX : Salaires extrêmes identifiés
- ✅ Nom inversé : "mokhlis jamhoun" → "Jamhoun Mokhlis"
- ✅ Comparaisons : Multiples employés
- ✅ Période multi-mois : oct-déc = 3 mois exactement

#### 🔧 Fonctions modifiées :
- `findClosestEmployee()` : Ajout test ordre inversé
- `findSimilarEmployees()` : Ajout test ordre inversé
- `get_employee_salaries` : Nouveaux paramètres start_month/end_month + recherche prioritaire BDD
- `compare_employee_salaries` : Fuzzy matching avec ordre inversé
- `processQuestion()` : Hints IA améliorés (périodes multi-mois, classements)
- Génération titre de période : Support "octobre à décembre 2025"

---

### 📋 TODO - Prochaine session (Fournisseurs)

**Objectif** : Créer système d'analyse fournisseurs similaire au système salaires

#### À implémenter :
1. **Créer outil `analyze_supplier_expenses`** (complet)
   - Top X fournisseurs par montant de dépenses
   - Analyse détaillée d'un fournisseur spécifique
   - Support périodes (mois unique, multi-mois, année)
   - Affichage optimisé (avec/sans liste détaillée)

2. **Ajouter outil `compare_supplier_expenses`**
   - Comparaison entre 2-10 fournisseurs
   - Classement par total, moyenne, fréquence
   - Différence en € et %

3. **Détections automatiques**
   - "top 10 fournisseurs" → Top 10 par dépenses (pas liste complète)
   - "analyse dépenses chez Sligro" → Analyse détaillée
   - "compare Colruyt et Sligro" → Comparaison

4. **Tests à créer**
   - Top X fournisseurs (10, 5, 3)
   - Analyse fournisseur spécifique
   - Période multi-mois fournisseur
   - Comparaison fournisseurs
   - Fuzzy matching noms fournisseurs

#### Exemple attendu :
```
Question: "top 10 fournisseurs"
Réponse:
💰 Dépenses de année 2025

Total: 150000€ (250 paiements)

📊 Top 10 des fournisseurs:
🥇 Sligro: 45000€ (85 paiements)
🥈 Colruyt: 32000€ (60 paiements)
🥉 Foster: 28000€ (45 paiements)
...
```

---

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
- **⚠️ Liste complète des utilisateurs** : Utiliser l'outil `list_users()` pour la liste ACTUELLE et À JOUR (cette documentation peut être obsolète)
- **Repository**: GitHub (privé)
- **Documentation**: Voir fichiers `.md` dans le projet

## Notes importantes

1. **Toujours compiler** avant de committer: `npm run build`
2. **Ne jamais exposer** les API keys dans le code ou Git
3. **Tester avec tous les utilisateurs** après modifications multi-user
4. **Sauvegarder sur GitHub** après chaque correction importante
5. **Vérifier les logs** en cas de comportement inattendu
6. **Utiliser `sync`** pour synchroniser les modifications entre Tonton202 et Mustfood
7. **⭐ TOUJOURS utiliser `./start-bot-safe.sh`** pour garantir qu'un seul bot tourne (système anti-doublons)

---

**Dernière mise à jour**: 22 février 2026
**Version du bot**: 3.1.2 - PM2 + Service réconciliation paiements (tonton202)
**Statut**: Production ✅

## 🚀 Nouveautés Version 3.1.2 (22 février 2026)

### ✅ Migration PM2 + Service de réconciliation paiements

#### 1. Migration vers PM2 (gestion des processus)
- **Avant** : Scripts wrapper bash (`start-bot-safe.sh`, `start-bot-wrapper.sh`) → problèmes de doublons, race conditions
- **Maintenant** : PM2 gère les deux bots (`bot-tonton202`, `bot-mustfood`)
- PM2 garantit **1 seule instance** par bot, redémarrage auto, logs centralisés
- Config : `ecosystem-bot.config.js` dans chaque dossier bot
- Sauvegardé avec `pm2 save` → redémarrage automatique au reboot serveur

#### 2. Service de réconciliation paiements (tonton202 uniquement)
- **Nouveau fichier** : `src/services/payment-reconciliation-service.ts`
- Réconciliation automatique **toutes les 30 min** entre transactions bancaires et factures impayées
- Commande manuelle : `/reconcile`
- Boutons de confirmation : "Lier maintenant" / "Ignorer"
- Cooldown 24h pour les notifications automatiques
- Base de données SQLite (`better-sqlite3`) — nécessite `npm rebuild better-sqlite3` si changement de version Node.js

#### ⚠️ Note importante
- `better-sqlite3` doit être recompilé si Node.js change de version :
  ```bash
  npm rebuild better-sqlite3
  ```

---

## 🚀 Nouveautés Version 3.1 (19 janvier 2026)

### ✅ CORRECTIF CRITIQUE : Outil get_all_invoices
- **Nouveau** : `get_all_invoices` pour lister TOUTES les factures (toutes périodes confondues)
- **Fix** : "Liste-moi toutes les factures" retournait uniquement le mois courant (janvier) au lieu de toutes les périodes
- **Fix** : Modification de `get_monthly_invoices` pour qu'il ne soit utilisé QUE si le mois est explicitement mentionné
- **Pagination** : Support pagination automatique pour récupérer toutes les factures (toutes pages)
- **Total outils** : 49 → **50 outils IA**

### 🧪 VALIDATION 100% : Tests automatiques
- ✅ 36/36 tests automatiques réussis (100%)
- ✅ Corrections JSON parsing, validation entrée vide, AI client checks
- ✅ Pagination complète pour factures impayées (`getUnpaidInvoices`)
- ✅ Script de démarrage amélioré (pas de doublons de processus)
- ✅ Nettoyage cache sémantique pour forcer régénération

---

## 🚀 Nouveautés Version 3.0 (18 janvier 2026)

### ✅ PHASE 1 : Analyse avancée des fournisseurs
1. **analyze_supplier_trends** - Évolution des dépenses fournisseur sur 3-12 mois
2. **get_supplier_ranking** - Top X fournisseurs avec évolution vs période précédente
3. **detect_supplier_patterns** - Détection paiements récurrents (hebdo/mensuel) avec anomalies

### ✅ PHASE 2 : Agrégation intelligente
4. **get_year_summary** - Résumé annuel complet avec top 10 fournisseurs et YoY
5. **compare_periods** - Comparaison de 2 périodes personnalisées (€ et %)
6. **get_quarterly_report** - Rapport trimestriel Q1-Q4 avec QoQ et top 5

### ✅ PHASE 3 : Prédictions et détection
7. **predict_next_month** - Prévision mois prochain avec régression linéaire et confiance
8. **detect_anomalies** - Détection dépenses anormales (>50% déviation par défaut)
9. **analyze_trends** - Tendances globales avec taux de croissance et projection +3 mois

### ✅ PHASE 4 : Export
10. **export_to_csv** - Export transactions/factures/salaires en CSV avec sauvegarde locale

### ✅ OPTIMISATIONS CRITIQUES
- **Chargement dynamique des outils** : Sélection intelligente par mots-clés (économie ~70% tokens)
- **Hints dynamiques** : Instructions contextuelles ajoutées au message système selon la question
- **Compilations réussies** : Tous les nouveaux outils intégrés sans erreurs TypeScript

### 📊 Bilan
- **De 39 → 49 outils IA** (+10 nouveaux outils)
- **10 fichiers créés** :
  - `src/ai-agent/tools/aggregation-tools.ts`
  - `src/ai-agent/tools/analytics-tools.ts`
  - `src/ai-agent/implementations/supplier-analytics.ts`
  - `src/ai-agent/implementations/aggregation-analytics.ts`
  - `src/ai-agent/implementations/predictive-analytics.ts`
- **3 fichiers modifiés** :
  - `src/ai-agent-service-v2.ts` (ajout 4 imports, 4 case statements, 2 méthodes)
  - `src/ai-agent/tools/index.ts` (mise à jour exports)
  - `CLAUDE.md` (documentation)
- **Performances** : Réduction de ~70% de l'usage de tokens grâce au chargement dynamique
- **Précision** : Hints dynamiques pour guider l'IA selon le contexte

### 📋 Session précédente (28 décembre 2025)
- ✅ 8 corrections majeures système salaires (fuzzy matching, périodes multi-mois, top X)
- ✅ Version 2.6 avec analyse salaires avancée
