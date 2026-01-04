# Guide : Démarrer le bot à distance

## 🎯 Le problème

Si le bot est arrêté, il ne peut pas recevoir de commandes Telegram pour redémarrer !

## 💡 Solutions disponibles

### ✅ Solution 1 : Auto-redémarrage automatique (Recommandé)

**Avantage** : Le bot redémarre TOUJOURS automatiquement, même après un crash.

**Mise en place** :
Le wrapper `start-bot-wrapper.sh` a été modifié pour redémarrer dans **tous les cas**.

```bash
# Démarrer le bot avec auto-redémarrage
cd /home/ubuntu/Billit/bot_mustfood  # ou tonton202
./start-bot-safe.sh
```

Le bot redémarrera automatiquement :
- ✅ Après un arrêt propre (exit code 0)
- ✅ Après un crash (exit code non-zéro)
- ✅ Après un kill -9 (exit code 137)
- ✅ Après une erreur TypeScript

**Pour arrêter définitivement** :
```bash
pkill -f "/home/ubuntu/Billit/bot_mustfood.*start-bot-wrapper"
```

---

### 🐕 Solution 2 : Bot Watchdog (Contrôle via Telegram)

**Avantage** : Contrôler le bot principal via un second bot Telegram.

**Étape 1 : Créer un nouveau bot Telegram**

1. Parler à [@BotFather](https://t.me/BotFather) sur Telegram
2. `/newbot`
3. Nommer le bot (ex: "Mustfood Watchdog")
4. Noter le token reçu

**Étape 2 : Configurer le watchdog**

```bash
# Créer le fichier .env.watchdog
cd /home/ubuntu/Billit/bot_mustfood
cat > .env.watchdog << EOF
WATCHDOG_TOKEN=YOUR_WATCHDOG_BOT_TOKEN
WATCHDOG_CHAT_ID=7887749968
EOF
```

**Étape 3 : Démarrer le watchdog**

```bash
# Installer si nécessaire
npm install node-telegram-bot-api

# Démarrer le watchdog en arrière-plan
nohup node watchdog-bot.js > watchdog.log 2>&1 &
```

**Étape 4 : Utiliser les commandes**

Sur Telegram, parler au bot watchdog :
- `/status` - Voir si le bot principal tourne
- `/start_main_bot` - Démarrer le bot principal
- `/stop_main_bot` - Arrêter le bot principal
- `/restart_main_bot` - Redémarrer le bot principal

---

### 🔧 Solution 3 : Systemd (Service Linux)

**Avantage** : Gestion native Linux, redémarrage au boot.

**Étape 1 : Créer le service**

```bash
sudo nano /etc/systemd/system/billit-mustfood.service
```

Contenu :
```ini
[Unit]
Description=Billit Telegram Bot - Mustfood
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/Billit/bot_mustfood
ExecStart=/usr/bin/npm run start:bot
Restart=always
RestartSec=10
StandardOutput=append:/home/ubuntu/Billit/bot_mustfood/systemd.log
StandardError=append:/home/ubuntu/Billit/bot_mustfood/systemd-error.log

[Install]
WantedBy=multi-user.target
```

**Étape 2 : Activer et démarrer**

```bash
# Recharger systemd
sudo systemctl daemon-reload

# Démarrer le service
sudo systemctl start billit-mustfood

# Activer au démarrage
sudo systemctl enable billit-mustfood

# Voir le statut
sudo systemctl status billit-mustfood
```

**Commandes utiles** :
```bash
# Démarrer
sudo systemctl start billit-mustfood

# Arrêter
sudo systemctl stop billit-mustfood

# Redémarrer
sudo systemctl restart billit-mustfood

# Voir les logs
journalctl -u billit-mustfood -f
```

---

### 🚀 Solution 4 : PM2 (Process Manager)

**Avantage** : Interface web, clustering, monitoring.

**Installation** :
```bash
npm install -g pm2
```

**Démarrer le bot avec PM2** :
```bash
cd /home/ubuntu/Billit/bot_mustfood

# Démarrer
pm2 start dist/index-bot.js --name "mustfood-bot"

# Sauvegarder la config
pm2 save

# Auto-démarrage au boot
pm2 startup
```

**Commandes utiles** :
```bash
# Voir les processus
pm2 list

# Redémarrer
pm2 restart mustfood-bot

# Arrêter
pm2 stop mustfood-bot

# Logs en direct
pm2 logs mustfood-bot

# Monitoring
pm2 monit
```

---

### 📱 Solution 5 : Webhook HTTP (API externe)

**Avantage** : Contrôle via API HTTP depuis n'importe où.

Créer un petit serveur Express qui contrôle le bot :

```javascript
// control-api.js
const express = require('express');
const { exec } = require('child_process');

const app = express();
const SECRET_KEY = 'your-secret-key';

app.use(express.json());

// Middleware de sécurité
app.use((req, res, next) => {
  if (req.headers['x-api-key'] !== SECRET_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

app.post('/start', (req, res) => {
  exec('cd /home/ubuntu/Billit/bot_mustfood && ./start-bot-safe.sh', (err, stdout) => {
    res.json({ success: !err, output: stdout });
  });
});

app.post('/stop', (req, res) => {
  exec('pkill -f "mustfood.*node.*dist/index-bot"', (err) => {
    res.json({ success: !err });
  });
});

app.get('/status', (req, res) => {
  exec('pgrep -f "mustfood.*dist/index-bot"', (err, stdout) => {
    res.json({ running: !err, pids: stdout.trim().split('\n') });
  });
});

app.listen(3001, () => console.log('API running on :3001'));
```

**Utilisation** :
```bash
# Démarrer l'API
node control-api.js

# Appeler depuis n'importe où
curl -X POST http://your-server:3001/start -H "X-API-Key: your-secret-key"
```

---

## 🎯 Quelle solution choisir ?

| Solution | Complexité | Fiabilité | Contrôle distant |
|----------|-----------|-----------|------------------|
| **Auto-redémarrage** | ⭐ Facile | ⭐⭐⭐ Excellent | ❌ Non |
| **Bot Watchdog** | ⭐⭐ Moyen | ⭐⭐ Bon | ✅ Via Telegram |
| **Systemd** | ⭐⭐⭐ Avancé | ⭐⭐⭐ Excellent | ❌ Non (sauf SSH) |
| **PM2** | ⭐⭐ Moyen | ⭐⭐⭐ Excellent | ✅ Via CLI/Web |
| **HTTP API** | ⭐⭐⭐ Avancé | ⭐⭐ Bon | ✅ Via HTTP |

### 💡 Ma recommandation

**Combinaison idéale** :
1. ✅ **Auto-redémarrage** (déjà en place) pour gérer les crashes
2. ✅ **Bot Watchdog** pour le contrôle via Telegram
3. Optionnel : **Systemd** pour redémarrage au boot du serveur

---

## 🚨 Cas d'urgence

Si rien ne fonctionne, connecte-toi en SSH :

```bash
ssh ubuntu@your-server

# Aller dans le dossier
cd /home/ubuntu/Billit/bot_mustfood

# Démarrer manuellement
./start-bot-safe.sh
```

---

## 📋 Checklist de mise en place

- [x] Wrapper modifié pour auto-redémarrage
- [ ] Bot watchdog configuré (optionnel)
- [ ] Service systemd créé (optionnel)
- [ ] PM2 installé (optionnel)
- [ ] API HTTP configurée (optionnel)

---

**Dernière mise à jour** : 29 décembre 2025
**Auteur** : Claude Code
