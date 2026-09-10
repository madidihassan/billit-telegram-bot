# Billit Telegram Notifier

Notifications Telegram des nouvelles factures Billit, pour deux sociétés
(Mustfood et Tonton202). Chaque nouvelle facture est envoyée en PDF sur
Telegram, avec un bouton « 💰 Marquer Payé » pour les factures non réglées.

## Démarrage

```bash
npm install
cp .env.example .env     # renseigner les clés Billit et Telegram
./build-all.sh           # compile et redémarre les deux bots via PM2
```

## Commandes

| Commande | Effet |
|---|---|
| `npm run build` | Compile TypeScript vers `dist/` |
| `npm start` | Lance le notifier (`dist/index-notify.js`) |
| `npm test` | Suite de tests vitest |
| `pm2 logs bot-mustfood` | Suit les logs d'une instance |

## Configuration

Voir la section « Configuration » de [CLAUDE.md](./CLAUDE.md), qui documente
aussi l'architecture, le déploiement et les points de vigilance (ban IP Billit,
watchdog de polling).
