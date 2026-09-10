# Billit — Bot de notifications de factures

Deux instances Telegram, une par société, qui **notifient l'arrivée de nouvelles
factures Billit**. C'est leur seule fonction.

| Dossier | Société | Process PM2 |
|---|---|---|
| `bot_mustfood/` | Mustfood | `bot-mustfood` |
| `bot_tonton202/` | Tonton202 | `bot-tonton202` |

## Architecture

`bot_tonton202/src` est un **symlink** vers `bot_mustfood/src` : on édite le code
une seule fois, mais chaque bot a son propre `dist/`, `.env`, `data/` et
`node_modules`. Toujours recompiler les deux.

Point d'entrée : `dist/index-notify.js` (source `src/index-notify.ts`).

```
src/
  index-notify.ts              démarrage : config → monitoring → notifier
  invoice-monitoring-service.ts polling Billit, détection, mise en forme
  notify/telegram-notifier.ts  diffusion Telegram + bouton « Marquer Payé »
  billit-client.ts             API Billit (OAuth, factures, PDF, paiements)
  database.ts                  SQLite (utilisateurs autorisés, fournisseurs)
  types/notifier.ts            interface InvoiceNotifier
```

Le bouton « 💰 Marquer Payé » est le **seul** élément interactif : il poste un
paiement dans Billit via `pay_invoice:<id>`. Il n'apparaît pas sur une facture
déjà payée ni sur un brouillon.

## Build et déploiement

```bash
./build-all.sh          # compile les deux dist + pm2 restart des deux bots
```

Ne **jamais** lancer les bots à la main : ils sont gérés par PM2
(`pm2 restart bot-mustfood bot-tonton202`, puis `pm2 save`).

```bash
npm run build           # tsc
npm test                # vitest (224 tests)
pm2 logs bot-mustfood   # logs
```

## Surveillance externe

Un cron hors du dépôt sonde le polling Telegram toutes les 5 minutes et
redémarre un bot dont le polling est mort :
`/home/ubuntu/tonton.app/scripts/monitoring/bot-polling-watchdog.sh`.
Il diagnostique via `getUpdates?timeout=2` : `409` = polling vivant, `200` = mort.
**Conséquence : le polling Telegram doit rester actif**, sinon ce cron redémarre
les bots en boucle.

## Points de vigilance

- **Ban IP Billit** : la réconciliation paiements et la mise à jour des soldes
  bancaires paginaient l'API sans filtre et ont provoqué un bannissement
  (15/06/2026). Ces services ont été supprimés — ne pas les réintroduire sans
  filtre serveur et plafond d'appels.
- **Statut de facture** : comparer avec `=== 'paid'`, jamais `includes('paid')`
  (`'unpaid'` contient `'paid'`).
- **callback_data Telegram** : 64 octets maximum. Ne jamais y mettre autre chose
  que l'ID ; le reste passe par `payButtonContext`.
- Les utilisateurs autorisés sont en base SQLite (`data/billit.db`), pas dans
  `.env`.

## Configuration (`.env`)

`BILLIT_API_KEY`, `BILLIT_PARTY_ID`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`,
`INVOICE_MONITORING_ENABLED`, `INVOICE_MONITORING_INTERVAL` (minutes),
`INVOICE_MONITORING_STORAGE`.

## Historique

Jusqu'au 10/09/2026, ces bots embarquaient un agent IA, des commandes Telegram,
de la reconnaissance vocale, un suivi bancaire et une réconciliation de
paiements — développés avant l'app et devenus inutilisés. Tout a été supprimé
(70 fichiers source, 59 scripts de debug, 6 dépendances npm). Les archives sont
dans `backups/*.tar.gz`. Ce dossier n'est pas un dépôt git : archiver avant
toute suppression.
