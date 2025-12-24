# 🤖 Agent IA Autonome - Function Calling

## 🎯 Qu'est-ce que c'est ?

Vous pouvez maintenant poser **N'IMPORTE QUELLE QUESTION** à votre bot Telegram Billit, et l'IA ira **automatiquement** chercher les bonnes données sur Billit **SANS que vous ayez à coder en dur** chaque nouvelle question.

## ✨ Comment ça marche ?

L'agent IA utilise le **Function Calling** de Groq (Llama 3.3 70B) :

1. **Vous posez une question** en langage naturel
2. **L'IA analyse** votre question
3. **L'IA décide automatiquement** quelles fonctions appeler
4. **L'IA exécute** les fonctions (récupère les données de Billit)
5. **L'IA synthétise** une réponse naturelle avec les données

```
┌─────────────────────────────────────────────────────┐
│  "Combien j'ai dépensé chez Foster en novembre ?"  │
└─────────────────────────────────────────────────────┘
                       ↓
           ┌───────────────────────┐
           │  🤖 Agent IA Autonome │
           └───────────────────────┘
                       ↓
    ┌──────────────────┴──────────────────┐
    ↓                                      ↓
get_period_transactions()       get_supplier_invoices()
("2025-11-01", "2025-11-30")         ("Foster")
    ↓                                      ↓
[Données bancaires]              [Factures Foster]
    └──────────────────┬──────────────────┘
                       ↓
              💬 Réponse naturelle
```

## 📝 Exemples de questions

Vous pouvez poser **n'importe quelle question**, par exemple :

### Questions sur les factures

```
- "Combien de factures impayées ?"
- "Quelle est la dernière facture de Foster ?"
- "Montre-moi toutes les factures de CIERS"
- "Quelles factures sont en retard ?"
- "Cherche les factures de novembre"
- "Combien j'ai de fournisseurs ?"
```

### Questions sur les transactions bancaires

```
- "Combien j'ai gagné ce mois-ci ?"
- "Quelles sont mes dépenses de novembre ?"
- "Quelle est ma balance du mois ?"
- "Combien j'ai payé à Foster ?"
- "Compare mes recettes d'octobre et novembre"
- "Combien j'ai dépensé en salaires en décembre ?"
```

### Questions complexes (multi-étapes)

```
- "Compare mes factures payées et impayées ce mois"
- "Montre-moi toutes les transactions avec Foster et ses factures"
- "Quelle est la différence entre mes recettes et dépenses de novembre ?"
- "Liste les fournisseurs qui ont des factures en retard"
```

## 🔧 Fonctions disponibles pour l'IA

L'agent IA a accès à **16 fonctions** qu'il peut appeler automatiquement :

### Factures (10 fonctions)
- `get_unpaid_invoices()` - Factures impayées
- `get_paid_invoices()` - Factures payées
- `get_overdue_invoices()` - Factures en retard
- `get_invoice_stats()` - Statistiques du mois
- `search_invoices(search_term)` - Rechercher
- `get_supplier_invoices(supplier_name)` - Toutes les factures d'un fournisseur
- `get_last_invoice_by_supplier(supplier_name)` - Dernière facture
- `get_invoice_details(invoice_number)` - Détails complets
- `list_suppliers()` - Liste des fournisseurs
- `list_employees()` - Liste des employés

### Transactions bancaires (6 fonctions)
- `get_monthly_transactions()` - Toutes les transactions du mois
- `get_monthly_credits()` - Recettes du mois
- `get_monthly_debits()` - Dépenses du mois
- `get_monthly_balance()` - Balance du mois
- `get_supplier_transactions(supplier_name)` - Transactions d'un fournisseur
- `get_period_transactions(start, end, type?, supplier?)` - Période personnalisée

## 🚀 Comment l'utiliser ?

### Sur Telegram

Simplement **posez votre question** en langage naturel :

```
Vous: "Combien j'ai dépensé en novembre ?"

Bot: 🤖 Analyse en cours...

Bot: 💸 En novembre 2025, vous avez dépensé 12 345,67 €

     Voici le détail des principales dépenses :
     1. Foster - 2 500,00 €
     2. CIERS - 1 800,00 €
     ...
```

### Messages vocaux

Vous pouvez aussi **envoyer un message vocal** :

```
🎤 "Quelle est ma balance du mois ?"

Bot: 📝 Vous avez dit: "Quelle est ma balance du mois ?"
     🤖 Analyse en cours...
     💰 Votre balance de décembre 2025 est de +5 678,90 €
```

## 💡 Avantages

### ✅ AVANT (système codé en dur)
```typescript
// Il fallait coder chaque intention manuellement
if (q.includes('impayé')) {
  return { command: 'unpaid', args: [] };
}
// Limité aux cas prévus !
```

### 🎉 MAINTENANT (agent autonome)
```typescript
// L'IA décide AUTOMATIQUEMENT quoi faire
const response = await aiAgent.processQuestion(question);
// Fonctionne pour TOUTES les questions !
```

## 🔒 Sécurité

- ✅ Rate limiting activé (limite les abus)
- ✅ Validation des entrées utilisateur
- ✅ Whitelist de chats autorisés
- ✅ Limitation à 5 itérations max (évite les boucles infinies)
- ✅ Sanitization des erreurs

## 📊 Performance

- **Modèle**: Llama 3.3 70B (via Groq)
- **Rapidité**: ~2-3 secondes pour une question simple
- **Complexité**: Peut gérer des questions multi-étapes
- **Coût**: Gratuit avec Groq (limite quotidienne)

## 🛠️ Configuration

Rien à configurer ! Si vous avez déjà `GROQ_API_KEY` dans votre `.env`, l'agent est automatiquement activé.

```bash
# .env
GROQ_API_KEY=gsk_votre_clé_ici
```

## 🧪 Comment tester ?

1. **Démarrez le bot** :
```bash
npm run build
npm run start:bot
```

2. **Sur Telegram, envoyez un message** (sans commande /) :
```
"Combien de factures impayées ?"
```

3. **Regardez les logs** pour voir l'IA en action :
```
🤖 Question reçue: Combien de factures impayées ?
🔄 Itération 1...
📞 L'IA veut appeler 1 fonction(s)
  → get_unpaid_invoices({})
  ✓ Résultat obtenu (245 caractères)
🔄 Itération 2...
✅ Réponse finale générée
```

## 🎓 Comment ça fonctionne techniquement ?

### 1. Définition des outils (tools)
```typescript
const tools = [{
  type: 'function',
  function: {
    name: 'get_unpaid_invoices',
    description: 'Obtenir toutes les factures impayées',
    parameters: { type: 'object', properties: {}, required: [] }
  }
}];
```

### 2. L'IA choisit quels outils utiliser
```typescript
const response = await groq.chat.completions.create({
  model: 'llama-3.3-70b-versatile',
  messages,
  tools,
  tool_choice: 'auto', // L'IA décide
});
```

### 3. Exécution des fonctions
```typescript
if (message.tool_calls) {
  for (const toolCall of message.tool_calls) {
    const result = await executeFunction(toolCall.function.name, args);
    messages.push({ role: 'tool', content: result });
  }
}
```

### 4. Synthèse finale
L'IA reçoit les résultats et génère une réponse naturelle.

## 🔮 Prochaines étapes possibles

- [ ] Ajouter des graphiques (via Telegram Photo API)
- [ ] Créer des raccourcis vocaux ("Billit, factures impayées")
- [ ] Historique de conversation (mémoire contextuelle)
- [ ] Intégration avec d'autres APIs (météo, agenda, etc.)
- [ ] Export PDF des rapports générés

## 📚 Références

- [Groq Function Calling](https://console.groq.com/docs/tool-use)
- [Llama 3.3 70B](https://www.llama.com/docs/model-cards-and-prompt-formats/llama3_3)
- [Telegram Bot API](https://core.telegram.org/bots/api)

---

**🎉 Félicitations !** Vous avez maintenant un assistant IA qui comprend le langage naturel et va chercher automatiquement les bonnes informations dans Billit, sans codage manuel pour chaque nouvelle question !
