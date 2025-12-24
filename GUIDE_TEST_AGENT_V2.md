# 🧪 Guide de Test - Agent IA V2 Amélioré

## 🎯 Qu'est-ce qui a changé ?

### ❌ Problème AVANT (V1)
```
Vous: "Combien j'ai gagné ce mois ?"

Bot: [Dump de 58 transactions ligne par ligne]
     1. 556,16 € - 16/12/2025 VISA-UID...
     2. 787,14 € - 16/12/2025 MC-UID...
     ...
     58. 48,00 € - 01/12/2025 VIREMENT...

     Total: 46 060,32 € (58 transactions)
```
❌ Trop long, pas de synthèse

### ✅ Solution MAINTENANT (V2)
```
Vous: "Combien j'ai gagné ce mois ?"

Bot: 💵 Ce mois-ci, vous avez généré 46 060,32 € de recettes
     sur 58 transactions, principalement via paiements par carte
     (VISA, Mastercard, Maestro).
```
✅ Concis, naturel, informatif !

## 🔧 Améliorations techniques

### 1. Données structurées (JSON)
Au lieu de retourner du HTML formaté, l'agent retourne du JSON :

```json
{
  "total_amount": 46060.32,
  "transaction_count": 58,
  "currency": "EUR",
  "top_sources": [
    "VISA (25 000 €)",
    "Mastercard (15 000 €)",
    "Maestro/VPay (6 000 €)"
  ]
}
```

### 2. Prompt strictement renforcé
- Maximum 500 tokens (force la concision)
- Exemples de bonnes/mauvaises réponses
- Interdiction explicite de copier-coller

### 3. Analyse automatique
- Top sources de revenus (VISA, MC, Virements...)
- Top dépenses par catégorie (Foster, ONSS, Salaires...)
- Groupement intelligent des transactions

## 🧪 Tests à faire

### Démarrage
```bash
npm run build
npm run start:bot
```

### Test 1 : Recettes du mois
```
🎤 "Combien j'ai gagné ce mois ?"
```

**Réponse attendue** (2-3 lignes) :
```
💵 Ce mois-ci, vous avez généré [X] € de recettes sur [N] transactions,
principalement via [source1, source2, source3].
```

### Test 2 : Dépenses du mois
```
💬 "Combien j'ai dépensé ce mois ?"
```

**Réponse attendue** :
```
💸 Vous avez dépensé [X] € ce mois-ci sur [N] transactions.
Principales dépenses : Foster ([X] €), ONSS ([X] €), Salaires ([X] €).
```

### Test 3 : Balance
```
💬 "Quelle est ma balance du mois ?"
```

**Réponse attendue** :
```
💰 Balance de [mois] : +[X] € (Recettes: [X] € - Dépenses: [X] €)
```

### Test 4 : Factures impayées
```
💬 "Combien de factures impayées ?"
```

**Réponse attendue** :
```
📋 Vous avez [N] factures impayées pour un total de [X] €.
```

### Test 5 : Comparaison de périodes
```
💬 "Compare mes recettes d'octobre et novembre"
```

**Réponse attendue** :
```
📊 Recettes - Octobre: [X] €, Novembre: [Y] € (+/- [Z] €, +/-[%]%)
```

### Test 6 : Factures en retard
```
💬 "Quelles factures sont en retard ?"
```

**Réponse attendue** :
```
⚠️ Vous avez [N] factures en retard pour [X] €.
Principaux fournisseurs : [supplier1, supplier2...]
```

## 📊 Vérification dans les logs

Quand vous posez une question, regardez les logs pour voir :

```
🤖 Question V2: Combien j'ai gagné ce mois ?
🔄 Itération 1...
📞 Appel de 1 fonction(s)
✓ get_monthly_credits: {"total_amount":46060.32,"transaction_count":58...
🔄 Itération 2...
✅ Réponse finale générée
```

## ✅ Critères de succès

Une bonne réponse doit être :
- ✅ **Concise** : 2-4 lignes maximum
- ✅ **Naturelle** : Langage humain, pas robotique
- ✅ **Informative** : Chiffres clés + contexte
- ✅ **Lisible** : Émojis modérés (2-3 max)

Une mauvaise réponse serait :
- ❌ Liste de 50+ transactions
- ❌ Copier-coller du JSON brut
- ❌ Réponse trop technique
- ❌ Plus de 10 lignes

## 🔍 Débogage

Si les réponses sont encore trop longues :

1. **Vérifiez les logs** :
```bash
npm run start:bot
# Regardez les logs pour voir quelle fonction est appelée
```

2. **Vérifiez la température** :
```typescript
temperature: 0.3, // Déjà optimisé pour la concision
max_tokens: 500,  // Limite stricte
```

3. **Vérifiez le prompt** :
Le prompt V2 est dans `src/ai-agent-service-v2.ts` ligne 352-380

## 🚀 Prochaines améliorations possibles

- [ ] Graphiques générés automatiquement (Chart.js → Image)
- [ ] Export PDF des réponses
- [ ] Alertes proactives (ex: "Vous avez une nouvelle facture en retard")
- [ ] Prédictions (ex: "Basé sur novembre, vous devriez faire ~48K en décembre")
- [ ] Commandes vocales shortcut ("Billit, balance")

## 📝 Notes importantes

1. **Messages vocaux** : Utilisent aussi V2 maintenant
2. **Messages texte** : Questions détectées automatiquement
3. **Commandes /** : Toujours disponibles pour accès direct

## 🎓 Différence V1 vs V2

| Fonctionnalité | V1 | V2 |
|----------------|----|----|
| Format données | HTML | JSON structuré |
| Longueur réponse | 10-50 lignes | 2-4 lignes |
| Analyse | Basique | Groupement intelligent |
| Synthèse | Faible | Forte |
| Max tokens | 2000 | 500 |
| Temperature | 0.1 | 0.3 |

---

**Testez et dites-moi si les réponses sont maintenant meilleures !** 🎉
