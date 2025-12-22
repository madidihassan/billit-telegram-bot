# Guide de démarrage rapide

## Installation en 5 minutes

### 1. Installer les dépendances

```bash
npm install
```

### 2. Configurer les credentials

```bash
cp .env.example .env
```

Éditez le fichier `.env` et remplissez vos informations :

```bash
# Billit
BILLIT_CLIENT_ID=votre_client_id
BILLIT_CLIENT_SECRET=votre_client_secret

# Telegram
TELEGRAM_BOT_TOKEN=votre_bot_token
TELEGRAM_CHAT_ID=votre_chat_id

# Optionnel: intervalle de vérification (5 minutes par défaut)
CHECK_INTERVAL=300000
```

### 3. Tester la configuration

```bash
npm test
```

Si tout est OK, vous devriez voir :

```
🎉 Tous les tests ont réussi !
```

### 4. Démarrer l'application

Mode développement (avec logs en temps réel) :

```bash
npm run dev
```

Mode production :

```bash
npm run build
npm start
```

Avec PM2 (recommandé pour serveur) :

```bash
npm run pm2:start
```

## Comment obtenir les credentials ?

### Billit API

1. Allez sur https://my.billit.eu/
2. Menu → **Paramètres** → **API**
3. Créez une application OAuth
4. Copiez le Client ID et Client Secret

### Bot Telegram

1. Cherchez **@BotFather** sur Telegram
2. Envoyez `/newbot`
3. Suivez les instructions
4. Copiez le token fourni

### Chat ID Telegram

Méthode simple :

1. Cherchez **@userinfobot** sur Telegram
2. Démarrez une conversation
3. Il vous donnera votre ID

## Commandes utiles

```bash
npm test           # Tester la configuration
npm run dev        # Lancer en mode développement
npm run build      # Compiler le TypeScript
npm start          # Lancer en mode production

# Avec PM2
npm run pm2:start    # Démarrer en arrière-plan
npm run pm2:logs     # Voir les logs
npm run pm2:restart  # Redémarrer
npm run pm2:stop     # Arrêter
```

## Vérifier que ça fonctionne

Après le démarrage, vous devriez :

1. Recevoir un message de test sur Telegram
2. Voir dans les logs : "✓ Authentification Billit réussie"
3. Voir : "📊 Surveillance active..."

À partir de là, vous recevrez une notification Telegram dès qu'une nouvelle facture arrive sur Billit !

## Problèmes courants

### "Configuration invalide"

→ Vérifiez que toutes les variables dans `.env` sont remplies

### "Erreur Telegram"

→ Assurez-vous d'avoir envoyé au moins un message au bot avant

### "Erreur Billit"

→ Vérifiez que vos credentials API sont corrects et que l'application OAuth est active

## Besoin d'aide ?

Consultez le [README.md](./README.md) complet pour plus de détails.
