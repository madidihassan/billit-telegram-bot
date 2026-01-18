# 📝 Nomenclature - Guide de référence

## ⚠️ IMPORTANT : Noms à utiliser

### Bots Telegram (toujours avec le préfixe "bot_")
- ✅ **bot_tonton202** (répertoire : `/home/ubuntu/Billit/bot_tonton202`)
- ✅ **bot_mustfood** (répertoire : `/home/ubuntu/Billit/bot_mustfood`)

### Applications web (SANS le préfixe "bot_")
- ✅ **tonton202** (répertoire : `/home/ubuntu/tonton.app/apps/production/tonton202`)
- ✅ **mustfood** (répertoire : `/home/ubuntu/tonton.app/apps/production/mustfood`)

## 🚫 Erreurs à éviter

### ❌ Ne jamais dire :
- "Bot Tonton202" → Utiliser **"bot_tonton202"**
- "Bot Mustfood" → Utiliser **"bot_mustfood"**
- "le bot tonton202" → Utiliser **"le bot bot_tonton202"** ou **"le bot Telegram tonton202"**

### ✅ Formulations correctes :
- "Le bot **bot_tonton202** tourne correctement"
- "Redémarrage du bot **bot_mustfood**"
- "Les bots Telegram (**bot_tonton202** et **bot_mustfood**) sont opérationnels"

## 📊 Tableau de référence rapide

| Contexte | Nom à utiliser | Répertoire |
|----------|---------------|-----------|
| Bot Telegram tonton202 | **bot_tonton202** | `/home/ubuntu/Billit/bot_tonton202` |
| Bot Telegram Mustfood | **bot_mustfood** | `/home/ubuntu/Billit/bot_mustfood` |
| Application web tonton202 | **tonton202** | `/home/ubuntu/tonton.app/apps/production/tonton202` |
| Application web Mustfood | **mustfood** | `/home/ubuntu/tonton.app/apps/production/mustfood` |

## 🔍 Vérification rapide

Pour identifier un processus :
```bash
# Trouver le PID
ps aux | grep "dist/index-bot"

# Vérifier le répertoire
pwdx <PID>
```

**Si le répertoire contient** :
- `/home/ubuntu/Billit/bot_*` → C'est un **bot Telegram** → Utiliser le préfixe "bot_"
- `/home/ubuntu/tonton.app/apps/production/*` → C'est une **application web** → SANS préfixe "bot_"

## 💡 Pourquoi c'est important

**Sans cette nomenclature claire** :
- ❌ Confusion entre bot Telegram et application web
- ❌ Risque de tuer le mauvais processus
- ❌ Mauvaises commandes de déploiement
- ❌ Documentation incohérente

**Avec cette nomenclature** :
- ✅ Clarté absolue sur ce qu'on manipule
- ✅ Pas de risque de confusion
- ✅ Communication efficace
- ✅ Documentation cohérente

---

**Dernière mise à jour** : 17 janvier 2026
