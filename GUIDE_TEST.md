# 🎯 GUIDE DE TEST - NIVEAU 1 ChatGPT-like

**Date:** 16 janvier 2026
**Features:** Streaming + Validation + Indicateurs visuels
**Bot:** @Assistant_tonton202_bot

---

## ✅ ÉTAPE 1 : Vérifier que le système est prêt

Dans le terminal SSH, lance :

```bash
cd /home/ubuntu/Billit/bot_tonton202
./test-dashboard.sh
```

**✅ Tu DOIS voir :**
- "✅ Nombre de bots actifs: X" (au moins 1)
- "✅ Aucune erreur détectée"
- "Le bot est prêt pour les tests !"

---

## 📱 ÉTAPE 2 : Tests sur Telegram

Ouvre Telegram et cherche **@Assistant_tonton202_bot**

### 🧪 TEST 1 - Streaming basique (2 min)

**Action :**
```
Tape : "factures impayées"
```

**✅ Résultat attendu :**
1. **Typing indicator** (les 3 petits points `...`) apparaît IMMÉDIATEMENT
2. Message **"🤖 L'IA travaille..."** s'affiche pendant ~0.5s
3. La réponse s'affiche **PROGRESSIVEMENT** comme si ChatGPT tapait
   - "📋 Vous"
   - "📋 Vous avez"
   - "📋 Vous avez 5"
   - "📋 Vous avez 5 factures impayées..."

**❌ Si ça ne marche PAS :**
- La réponse s'affiche d'un coup (ancien système)
- Pas de typing indicator
→ Redémarre le bot : `pkill -f tonton202 && ./start-bot-safe.sh`

---

### 🔒 TEST 2 - Validation anti-hallucination (2 min)

**Action :**
```
Tape : "combien de factures en décembre ?"
```

**✅ Résultat attendu :**
- Réponse avec chiffre **EXACT** : "8 factures en décembre pour 19 250,67 €"
- **JAMAIS** : "environ 8", "approximativement", "je pense que"

**Action supplémentaire :**
```
Tape : "liste les utilisateurs"
```

**✅ Résultat attendu :**
- Liste EXACTE des utilisateurs (appel automatique à `list_users()`)
- **JAMAIS** d'invention de noms ou de Chat IDs

---

### 🎤 TEST 3 - Vocal + streaming (3 min)

**Action :**
1. Clique sur l'icône 🎤 dans Telegram
2. Enregistre : **"balance du mois"**
3. Envoie

**✅ Résultat attendu :**
1. Message : "🎙️ Transcription en cours..."
2. Message : "🎤 Analyse de votre commande vocale..."
3. Réponse **streamée** comme TEST 1

---

### 📊 TEST 4 - Longue réponse + streaming (3 min)

**Action :**
```
Tape : "analyse complète des salaires de décembre"
```

**✅ Résultat attendu :**
- Réponse longue (plusieurs lignes)
- **Streaming visible** : Tu vois la réponse se construire phrase par phrase
- Fluidité ChatGPT-like (pas de freeze)

---

## 📋 ÉTAPE 3 : Vérifier les logs (optionnel mais cool)

**Terminal 1 - Dashboard en temps réel :**
```bash
watch -n 2 ./test-dashboard.sh
```

**Terminal 2 - Logs en direct :**
```bash
tail -f logs/bot-$(date +%Y-%m-%d).log
```

**Ce que tu DOIS voir après chaque question :**
```json
{
  "level": "debug",
  "message": "Question IA reçue: \"factures impayées\"",
  "component": "telegram-bot",
  "userId": "7887749968"
}

{
  "level": "info",
  "message": "Question IA traitée avec succès",
  "duration": "2340ms",
  "validationStatus": "OK"
}
```

**Si validation bloque une estimation :**
```json
{
  "level": "error",
  "message": "Réponse IA contient des estimations/inventions",
  "errors": ["Phrase d'estimation détectée: environ"]
}
```

---

## 🎬 VIDÉO CONCEPTUELLE : Avant vs Après

### AVANT (ancien système sans streaming)
```
User  : "factures impayées"
        [......5 secondes de silence......]
Bot   : "📋 5 factures impayées pour 12 500 €"
```

### APRÈS (nouveau système avec streaming)
```
User  : "factures impayées"
        [immédiatement: ...]
Bot   : "🤖 L'IA travaille..."
        [0.3s] "📋 Vous"
        [0.3s] "📋 Vous avez"
        [0.3s] "📋 Vous avez 5"
        [0.3s] "📋 Vous avez 5 factures"
        [0.3s] "📋 Vous avez 5 factures impayées"
        [0.3s] "📋 Vous avez 5 factures impayées pour 12 500 €" ✅
```

**Total : ~2s avec feedback visuel VS 5s de silence**

---

## ✅ CHECKLIST DE VALIDATION

Coche au fur et à mesure :

- [ ] **Test 1 :** Streaming visible (réponse progressive)
- [ ] **Test 2 :** Typing indicator (...)
- [ ] **Test 3 :** Messages de progression ("🤖 L'IA travaille...")
- [ ] **Test 4 :** Validation anti-hallucination (chiffres exacts)
- [ ] **Test 5 :** Vocal + streaming
- [ ] **Test 6 :** Logs Winston créés
- [ ] **Test 7 :** Aucune erreur dans error-*.log

**Si 5/7 fonctionnent → NIVEAU 1 validé ! 🎉**

---

## 🐛 DÉPANNAGE

### Problème : Pas de streaming

**Cause :** Bot ancien processus

**Solution :**
```bash
pkill -f "/home/ubuntu/Billit/bot_tonton202.*node.*dist/index-bot"
cd /home/ubuntu/Billit/bot_tonton202
./start-bot-safe.sh
```

### Problème : Erreurs TypeScript

**Solution :**
```bash
npm run build
./start-bot-safe.sh
```

### Problème : Bot ne répond pas

**Vérifier :**
```bash
ps aux | grep "node dist/index-bot" | grep tonton202
```

Si rien → Redémarrer :
```bash
node dist/index-bot.js &
```

---

## 🚀 PROCHAINES ÉTAPES (après validation NIVEAU 1)

Si NIVEAU 1 fonctionne parfaitement, on peut passer à :

### NIVEAU 2 (Game changers)
- Mémoire conversationnelle intelligente
- Cache sémantique (réponses <1s)
- Suggestions proactives

### NIVEAU 3 (Pro features)
- RAG avec vectorisation
- Graphiques automatiques
- Voice-to-Voice

---

**Questions ?** Teste maintenant et dis-moi ce que tu observes ! 🎯
