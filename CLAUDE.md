# Billit Telegram Bot - Documentation pour Claude

## Vue d'ensemble

Bot Telegram interactif pour gérer les factures Billit avec IA autonome, reconnaissance vocale et support multi-utilisateurs.

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
ps aux | grep "npm run start:bot"  # Voir les processus
pkill -f "npm run start:bot"       # Tuer tous les bots
pgrep -f "dist/index-bot"          # Vérifier si le bot tourne
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
- Chat IDs configurés:
  - Hassan: 7887749968
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

**Réponses vont à Hassan uniquement**:
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

---

**Dernière mise à jour**: 24 décembre 2025
**Version du bot**: 2.5 avec IA autonome
**Statut**: Production ✅
