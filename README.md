# Billit Telegram Notifier

Système de notifications Telegram automatique pour les nouvelles factures Billit.

## Fonctionnalités

- Surveillance automatique des nouvelles factures sur Billit
- Notifications instantanées sur Telegram avec tous les détails
- Vérification périodique configurable
- Suivi des factures déjà notifiées pour éviter les doublons
- Formatage élégant des messages avec emojis et liens directs

## Prérequis

- Node.js 18+ installé
- Compte Billit avec accès API
- Bot Telegram configuré

## Installation

1. Installer les dépendances :

```bash
npm install
```

2. Copier le fichier de configuration :

```bash
cp .env.example .env
```

3. Configurer les variables d'environnement dans `.env`

## Configuration

### 1. Obtenir les credentials Billit

1. Connectez-vous sur [my.billit.eu](https://my.billit.eu/)
2. Allez dans **Paramètres** → **API**
3. Créez une nouvelle application OAuth
4. Notez votre `client_id` et `client_secret`

### 2. Créer un bot Telegram

Si ce n'est pas déjà fait :

1. Ouvrez Telegram et recherchez [@BotFather](https://t.me/BotFather)
2. Envoyez `/newbot` et suivez les instructions
3. Notez le **token** fourni (format: `123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11`)

### 3. Obtenir votre Chat ID Telegram

Méthode 1 - Via @userinfobot :
1. Recherchez [@userinfobot](https://t.me/userinfobot) sur Telegram
2. Démarrez une conversation
3. Il vous donnera votre Chat ID

Méthode 2 - Via l'API :
1. Envoyez un message à votre bot
2. Visitez : `https://api.telegram.org/bot<VOTRE_TOKEN>/getUpdates`
3. Cherchez `"chat":{"id":` dans la réponse

### 4. Configurer le fichier .env

Éditez le fichier `.env` avec vos informations :

```bash
# Configuration Billit API
BILLIT_API_URL=https://my.billit.eu/api
BILLIT_CLIENT_ID=votre_client_id_ici
BILLIT_CLIENT_SECRET=votre_client_secret_ici

# Configuration Telegram Bot
TELEGRAM_BOT_TOKEN=123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11
TELEGRAM_CHAT_ID=votre_chat_id_ici

# Intervalle de vérification (en millisecondes)
# 300000 = 5 minutes, 60000 = 1 minute, 600000 = 10 minutes
CHECK_INTERVAL=300000
```

## Utilisation

### Développement

Pour lancer en mode développement avec rechargement automatique :

```bash
npm run dev
```

### Production

1. Compiler le projet :

```bash
npm run build
```

2. Lancer l'application :

```bash
npm start
```

### Avec PM2 (recommandé pour production)

PM2 permet de maintenir l'application en arrière-plan et de la redémarrer automatiquement.

1. Installer PM2 :

```bash
npm install -g pm2
```

2. Démarrer l'application :

```bash
pm2 start dist/index.js --name billit-notifier
```

3. Configurer le démarrage automatique :

```bash
pm2 startup
pm2 save
```

4. Commandes utiles PM2 :

```bash
pm2 status                    # Voir le statut
pm2 logs billit-notifier     # Voir les logs
pm2 restart billit-notifier  # Redémarrer
pm2 stop billit-notifier     # Arrêter
pm2 delete billit-notifier   # Supprimer
```

### Avec systemd (Linux)

1. Créer le fichier service `/etc/systemd/system/billit-notifier.service` :

```ini
[Unit]
Description=Billit Telegram Notifier
After=network.target

[Service]
Type=simple
User=votre_utilisateur
WorkingDirectory=/chemin/vers/Billit
ExecStart=/usr/bin/node /chemin/vers/Billit/dist/index.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

2. Activer et démarrer le service :

```bash
sudo systemctl daemon-reload
sudo systemctl enable billit-notifier
sudo systemctl start billit-notifier
sudo systemctl status billit-notifier
```

3. Voir les logs :

```bash
sudo journalctl -u billit-notifier -f
```

## Structure du projet

```
Billit/
├── src/
│   ├── index.ts              # Point d'entrée principal
│   ├── config.ts             # Configuration et validation
│   ├── types.ts              # Types TypeScript
│   ├── billit-client.ts      # Client API Billit
│   ├── telegram-client.ts    # Client Telegram Bot
│   └── storage.ts            # Gestion du stockage local
├── dist/                     # Fichiers compilés
├── .env                      # Configuration (non versionné)
├── .env.example             # Exemple de configuration
├── package.json
├── tsconfig.json
└── README.md
```

## Format des notifications

Les notifications Telegram contiennent :

- 🧾 Indication de nouvelle facture
- Nom du fournisseur
- Numéro de facture
- Montant (formaté avec devise)
- Date de facturation
- Date d'échéance
- Statut avec emoji (✅ payé, ⏳ en attente, ⚠️ en retard)
- Lien direct vers la facture sur Billit

Exemple :

```
🧾 Nouvelle facture Billit

Fournisseur: Acme Corp
Numéro: INV-2024-001
Montant: 1.234,56 €
Date: 21/12/2024
Échéance: 20/01/2025
Statut: ⏳ pending

🔗 Voir la facture
```

## Dépannage

### Erreur d'authentification Billit

- Vérifiez que `BILLIT_CLIENT_ID` et `BILLIT_CLIENT_SECRET` sont corrects
- Assurez-vous que votre application OAuth est active sur Billit
- Vérifiez que l'URL de l'API est correcte

### Erreur Telegram

- Vérifiez que `TELEGRAM_BOT_TOKEN` est correct
- Assurez-vous d'avoir envoyé au moins un message au bot
- Vérifiez que le `TELEGRAM_CHAT_ID` correspond à votre conversation

### Pas de notifications

- Vérifiez les logs pour voir si des factures sont détectées
- Assurez-vous que `CHECK_INTERVAL` est configuré correctement
- Vérifiez que le fichier `notified_invoices.json` n'est pas corrompu

### Permissions

Si vous avez des erreurs de permissions lors de l'écriture du fichier de stockage :

```bash
chmod 644 notified_invoices.json
```

## Sécurité

- Ne committez JAMAIS le fichier `.env` dans Git
- Gardez vos tokens et secrets confidentiels
- Utilisez des permissions restrictives sur le serveur de production
- Régénérez vos tokens si vous pensez qu'ils ont été compromis

## Amélioration futures possibles

- Interface web pour configuration
- Support de plusieurs canaux Telegram
- Filtres personnalisés (montant minimum, fournisseurs spécifiques)
- Statistiques mensuelles
- Export des factures en PDF
- Intégration avec d'autres services (Slack, Discord, email)

## Support

Pour toute question ou problème :

1. Vérifiez d'abord les logs de l'application
2. Consultez la documentation de [Billit API](https://my.billit.eu/api/docs)
3. Consultez la documentation de [Telegram Bot API](https://core.telegram.org/bots/api)

## Licence

MIT
