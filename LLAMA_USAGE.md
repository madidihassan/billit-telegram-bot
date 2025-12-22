# 🤖 Utilisation de l'IA Llama dans le Bot

## Vue d'ensemble

Le bot utilise **Llama 3.3 70B** via l'**API Groq** pour comprendre les demandes en langage naturel et les convertir en commandes.

## Flux de traitement

```
┌─────────────────┐
│  Utilisateur    │ 🎤 "Donne-moi les factures impayées"
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Whisper (Groq) │ 🎧 Transcription audio → texte
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ IntentService   │ 🧠 Analyse de l'intention
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Llama 3.3 70B   │ 🤖 Comprend et retourne JSON
└────────┬────────┘     {"command": "unpaid", "args": [], "confidence": 0.95}
         │
         ▼
┌─────────────────┐
│ CommandHandler  │ ⚙️ Exécute la commande
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Telegram      │ 📱 Affiche le résultat
└─────────────────┘
```

## Configuration

**Fichier** : `src/intent-service.ts`

### Modèle utilisé
```typescript
model: 'llama-3.3-70b-versatile'
```
- 70 milliards de paramètres
- Très précis pour l'analyse d'intentions
- Gratuit sur Groq (avec limites)

### Paramètres
```typescript
temperature: 0.0        // Précision maximale, pas de créativité
max_tokens: 150         // Réponse courte (juste le JSON)
```

## Prompt envoyé à Llama

Le prompt contient :
1. **Description du rôle** : "Tu es un assistant qui analyse des demandes..."
2. **Liste des commandes** : unpaid, paid, stats, etc.
3. **~50 exemples** : "Factures impayées" → `{"command": "unpaid", ...}`
4. **Règles strictes** : dates, fournisseurs, différence payé/impayé
5. **La demande utilisateur**

### Taille du prompt
- **~2,400 tokens** pour le prompt
- **~50 tokens** pour la réponse
- **Total : ~2,450 tokens/requête**

## Limites API Groq

### Tier gratuit (On-Demand)
- **100,000 tokens/jour**
- **~40 requêtes/jour** avec le prompt actuel
- Réinitialisation tous les jours

### Si la limite est atteinte
```
❌ Rate limit exceeded
Please try again in 25 minutes
```

Le bot retourne alors le fallback :
```typescript
{
  command: 'help',
  args: [],
  confidence: 0.1
}
```

## Exemples de traitement

### Exemple 1 : Factures impayées
**Input** : "Facture impayée"
**Llama retourne** :
```json
{
  "command": "unpaid",
  "args": [],
  "confidence": 0.95
}
```

### Exemple 2 : Fournisseur spécifique
**Input** : "Liste les factures de Foster"
**Llama retourne** :
```json
{
  "command": "supplier",
  "args": ["Foster"],
  "confidence": 0.95
}
```

### Exemple 3 : Période spécifique
**Input** : "Recettes de juillet"
**Llama retourne** :
```json
{
  "command": "transactions_periode",
  "args": ["2025-07-01", "2025-07-31", "recettes"],
  "confidence": 0.90
}
```

## Optimisations possibles

### Option 1 : Modèle plus léger
Passer à `llama-3.1-8b-instant` :
- **5-10x moins de tokens**
- Moins précis mais suffisant pour les cas simples
- **~200 requêtes/jour** au lieu de 40

### Option 2 : Prompt plus court
Réduire les exemples de 50 à 20 :
- **~1,200 tokens** au lieu de 2,400
- **~80 requêtes/jour** au lieu de 40
- Peut réduire légèrement la précision

### Option 3 : Cache des intentions
Mémoriser les intentions fréquentes :
- "Impayé" → `unpaid` (sans appel API)
- "Fournisseurs" → `list_suppliers` (sans appel API)
- Économise beaucoup de tokens

### Option 4 : Tier payant
Groq Dev Tier :
- Limites beaucoup plus élevées
- Coût modéré
- Pas de coupures

## Fichiers concernés

1. `src/intent-service.ts` - Service d'analyse
2. `src/telegram-bot.ts` - Gestion des messages vocaux
3. `src/voice-service.ts` - Transcription Whisper
4. `src/command-handler.ts` - Exécution des commandes

## Variables d'environnement

```bash
GROQ_API_KEY=gsk_xxx...  # Clé API Groq
```

## Logs utiles

```bash
# Voir les analyses d'intentions
pm2 logs billit-bot | grep "Intention"

# Voir les erreurs API
pm2 logs billit-bot --err | grep "rate_limit"

# Voir les transcriptions
pm2 logs billit-bot | grep "Transcription"
```
