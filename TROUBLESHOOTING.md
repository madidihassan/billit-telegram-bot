# 🔧 Guide de dépannage des bots Telegram

## 📊 État actuel

### Bots Telegram (répertoire `/home/ubuntu/Billit/`)
- **bot_tonton202** : Bot Telegram pour le compte tonton202
- **bot_mustfood** : Bot Telegram pour le compte Mustfood

### Applications web (répertoire `/home/ubuntu/tonton.app/apps/production/`)
- **tonton202** : Application web tonton202 (⚠️ SANS le préfixe "bot_")
- **mustfood** : Application web Mustfood (⚠️ SANS le préfixe "bot_")
- **NE PAS CONFONDRE** avec les bots Telegram
- Gérés par PM2 séparément

## ⚠️ Problèmes courants

### 1. Plusieurs instances du même bot tournent

**Symptôme** : Erreur Telegram 409 "Conflict: terminated by other getUpdates request"

**Cause** : Plusieurs processus `node dist/index-bot.js` tournent dans le même répertoire

**Solution** :
```bash
# Vérifier les instances
ps aux | grep "dist/index-bot" | grep -v grep

# Identifier les répertoires
pwdx <PID>

# Redémarrer proprement
./restart-bot.sh
```

### 2. Le bot ne démarre pas

**Symptôme** : Aucun processus `node dist/index-bot.js` ne tourne

**Vérifications** :
```bash
# 1. Vérifier qu'il n'y a pas d'instance zombie
ps aux | grep "dist/index-bot"

# 2. Vérifier les logs
tail -f bot.log

# 3. Tester manuellement
npm run build
npm run start:bot
```

**Causes possibles** :
- Erreur de compilation TypeScript → `npm run build`
- Fichier `.env` manquant → copier depuis `.env.example`
- Token Telegram invalide → vérifier `.env`

### 3. Les bots s'arrêtent tout seuls

**Cause** : Crash du processus Node.js

**Solution** : Utiliser le wrapper avec auto-redémarrage
```bash
./start-bot-wrapper.sh &
```

Ce script redémarre automatiquement le bot en cas de crash.

## 🚀 Scripts de gestion

### restart-bot.sh (Recommandé)
Redémarre proprement UN SEUL bot :
```bash
./restart-bot.sh
```

**Avantages** :
- ✅ Tue toutes les anciennes instances dans CE répertoire
- ✅ N'affecte PAS les autres bots
- ✅ N'affecte PAS les apps web dans `/home/ubuntu/tonton.app/`
- ✅ Démarre UNE SEULE nouvelle instance
- ✅ Vérifie que le bot a bien démarré

### start-bot-wrapper.sh
Démarre le bot avec auto-redémarrage :
```bash
./start-bot-wrapper.sh &
```

**Avantages** :
- ✅ Redémarre automatiquement en cas de crash
- ✅ Boucle infinie (tourne jusqu'à arrêt manuel)

**Inconvénient** :
- ⚠️ Nécessite `pkill -f 'start-bot-wrapper'` pour arrêter

### start-bot-safe.sh
Lance le wrapper de manière sécurisée :
```bash
./start-bot-safe.sh
```

## 🔍 Commandes de diagnostic

### Lister TOUS les processus Node
```bash
ps aux | grep node | grep -v grep
```

### Identifier les bots vs les apps web
```bash
# Bots Telegram
ps aux | grep "dist/index-bot" | grep -v grep

# Apps web
ps aux | grep "tonton.app" | grep -v grep
```

### Vérifier le répertoire d'un processus
```bash
pwdx <PID>
```

### Tuer UN bot spécifique
```bash
# Option 1: Utiliser le PID
kill <PID>

# Option 2: Utiliser le répertoire
pkill -f "/home/ubuntu/Billit/bot_tonton202.*node.*dist/index-bot"
pkill -f "/home/ubuntu/Billit/bot_mustfood.*node.*dist/index-bot"
```

### Tuer TOUS les bots (dangereux)
```bash
pkill -f "node dist/index-bot"
```

⚠️ **ATTENTION** : Cette commande tue TOUS les bots (tonton202 ET mustfood)

## 📋 Workflow recommandé

### Démarrage quotidien
```bash
cd /home/ubuntu/Billit/bot_tonton202
./restart-bot.sh

cd /home/ubuntu/Billit/bot_mustfood
./restart-bot.sh
```

### Après modification du code
```bash
npm run build
./restart-bot.sh
```

### Déploiement avec synchronisation
```bash
./sync.sh  # Depuis bot_tonton202
```

Le script `sync.sh` :
1. Compile le code
2. Push sur GitHub
3. Merge vers l'autre branche
4. Redémarre les bots automatiquement

## 🐛 Debugging

### Les logs ne montrent rien
```bash
# Vérifier que le bot tourne
ps aux | grep "dist/index-bot"

# Vérifier les erreurs au démarrage
npm run start:bot
```

### Erreur 409 Telegram
**Cause** : Plusieurs instances du bot essaient de se connecter à Telegram

**Solution** :
```bash
# Tuer TOUTES les instances de ce bot
./restart-bot.sh
```

### Le bot ne répond pas sur Telegram
1. Vérifier que le processus tourne : `ps aux | grep "dist/index-bot"`
2. Vérifier les logs : `tail -f bot.log`
3. Vérifier le token dans `.env`
4. Vérifier que votre Chat ID est dans la whitelist

## 📌 Différences importantes

| Répertoire | Type | Gestion | Point d'entrée |
|-----------|------|---------|----------------|
| `/home/ubuntu/Billit/bot_tonton202` | Bot Telegram | Scripts manuels (`restart-bot.sh`) | `dist/index-bot.js` |
| `/home/ubuntu/Billit/bot_mustfood` | Bot Telegram | Scripts manuels (`restart-bot.sh`) | `dist/index-bot.js` |
| `/home/ubuntu/tonton.app/apps/production/tonton202` | Application web | PM2 | `dist/index.js` |
| `/home/ubuntu/tonton.app/apps/production/mustfood` | Application web | PM2 | `dist/index.js` |

**⚠️ ATTENTION à la nomenclature** :
- Bots Telegram : **bot_tonton202**, **bot_mustfood** (avec préfixe "bot_")
- Applications web : **tonton202**, **mustfood** (SANS préfixe "bot_")

**⚠️ NE JAMAIS** confondre les deux !

## ✅ Checklist de vérification

Avant de demander de l'aide, vérifiez :

- [ ] Le bot est compilé : `npm run build`
- [ ] Une seule instance tourne : `ps aux | grep "dist/index-bot"`
- [ ] Les logs ne montrent pas d'erreur : `tail -f bot.log`
- [ ] Le fichier `.env` existe et contient les bonnes valeurs
- [ ] Le répertoire est correct : `pwd` → `/home/ubuntu/Billit/bot_*`
- [ ] Vous n'avez pas confondu avec les apps dans `/home/ubuntu/tonton.app/`

---

**Dernière mise à jour** : 17 janvier 2026
**Auteur** : Claude Code
