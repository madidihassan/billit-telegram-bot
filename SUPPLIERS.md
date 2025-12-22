# 📋 Gestion des Fournisseurs

Ce guide explique comment gérer les noms de fournisseurs pour améliorer la reconnaissance dans le bot Telegram.

---

## 🎯 Problème résolu

Le bot peut maintenant reconnaître différentes variantes d'un même fournisseur :

- ✅ "Eden Red" → EDENRED
- ✅ "foster" → Foster Fast Food
- ✅ "ticket restaurant" → EDENRED

---

## 📁 Fichier de configuration

Le dictionnaire des fournisseurs est dans : **`supplier-aliases.json`**

### Structure du fichier

```json
{
  "foster": {
    "aliases": ["foster", "foster fast food", "foster fastfood"],
    "patterns": ["foster", "fosterfastfood"]
  },
  "edenred": {
    "aliases": ["edenred", "eden red", "eden", "ticket restaurant"],
    "patterns": ["edenred", "edenredbelgium"]
  }
}
```

- **Clé** : Identifiant unique du fournisseur (minuscules, sans espaces)
- **aliases** : Noms que l'utilisateur peut dire sur Telegram
- **patterns** : Termes à chercher dans les descriptions de transactions bancaires

---

## 🔧 Méthodes pour ajouter un fournisseur

### Méthode 1 : Script interactif (Recommandé ✅)

```bash
npx ts-node add-supplier.ts
```

Le script vous guidera pas à pas :

```
1. Clé unique (ex: "foster", "edenred"): colruyt
2. Aliases (séparés par des virgules): Colruyt, colruyt group
3. Patterns à chercher: colruyt, colruytgroup
```

Puis redémarrez le bot :

```bash
npm run build && pm2 restart billit-bot
```

---

### Méthode 2 : Édition manuelle

1. Ouvrez `supplier-aliases.json`
2. Ajoutez votre fournisseur :

```json
{
  "colruyt": {
    "aliases": ["colruyt", "colruyt group"],
    "patterns": ["colruyt", "colruytgroup"]
  }
}
```

3. Sauvegardez
4. Redémarrez : `npm run build && pm2 restart billit-bot`

---

### Méthode 3 : Auto-apprentissage (Future 🚀)

Dans une future version, le bot pourra apprendre automatiquement en analysant vos transactions.

---

## 📊 Commandes utiles

### Lister tous les fournisseurs

```bash
npx ts-node list-suppliers.ts
```

### Tester les aliases

```bash
npx ts-node test-aliases.ts
```

---

## 💡 Conseils pour choisir les patterns

### Exemple réel : EDENRED

**Description dans la banque :**
```
EDENRED BELGIUM SA/NV 31347257 629914ETR171225
```

**Patterns recommandés :**
```json
"patterns": ["edenred", "edenredbelgium"]
```

### Règles :

1. **Enlevez les espaces** : "Eden Red" → "edenred"
2. **Minuscules uniquement**
3. **Incluez des variantes courtes** : "foster", "fosterfastfood"
4. **Pas de ponctuation** : "S.A." → "sa"

---

## 🧪 Tester un nouveau fournisseur

Après l'ajout, testez sur Telegram :

1. "Donne-moi les transactions [NomFournisseur]"
2. "Recettes [NomFournisseur] du mois"
3. "Quel est le montant payé à [NomFournisseur] en octobre ?"

Si ça ne fonctionne pas, vérifiez :

- ✅ Le bot a été redémarré
- ✅ Les patterns correspondent aux descriptions réelles des transactions
- ✅ La normalisation est correcte (pas d'espaces, minuscules)

---

## 🔍 Trouver les bons patterns

Pour savoir quel pattern utiliser, regardez vos transactions bancaires :

```bash
npx ts-node test-edenred.ts
```

Ou créez un script temporaire :

```typescript
import { BankClient } from './src/bank-client';

const bankClient = new BankClient();
const transactions = await bankClient.getMonthlyTransactions();

transactions.forEach(tx => {
  console.log(tx.description);
});
```

Cherchez les mots-clés récurrents dans les descriptions.

---

## 📝 Exemples de fournisseurs configurés

### Foster Fast Food
```json
"foster": {
  "aliases": ["foster", "foster fast food", "foster fastfood"],
  "patterns": ["foster", "fosterfastfood"]
}
```

**Exemples de requêtes qui fonctionnent :**
- "Donne-moi les transactions Foster"
- "Quel est le montant payé à foster fast food en octobre ?"

---

### EDENRED
```json
"edenred": {
  "aliases": ["edenred", "eden red", "eden", "ticket restaurant"],
  "patterns": ["edenred", "edenredbelgium"]
}
```

**Exemples de requêtes qui fonctionnent :**
- "Recettes Eden Red du mois"
- "Transactions ticket restaurant"

---

## 🚀 Pas besoin de redémarrer dans le futur

Dans une version future, le bot rechargera automatiquement les aliases toutes les heures ou à la demande avec une commande `/reload_suppliers`.

---

## ❓ FAQ

### Q : Dois-je redémarrer le bot après chaque modification ?
**R :** Oui, actuellement. Le fichier est chargé au démarrage.

### Q : Puis-je avoir plusieurs patterns pour un même fournisseur ?
**R :** Oui ! C'est même recommandé. Exemple : `["foster", "fosterfastfood"]`

### Q : Que se passe-t-il si je fais une erreur dans le JSON ?
**R :** Le bot utilisera les aliases par défaut (foster, edenred, collibry) et affichera une erreur dans les logs.

### Q : Comment supprimer un fournisseur ?
**R :** Éditez `supplier-aliases.json` et supprimez l'entrée, puis redémarrez le bot.

---

## 🎯 Résumé

1. **Ajouter** : `npx ts-node add-supplier.ts`
2. **Lister** : `npx ts-node list-suppliers.ts`
3. **Redémarrer** : `npm run build && pm2 restart billit-bot`
4. **Tester** : Envoyez une commande sur Telegram

---

✅ **Le système d'aliases est maintenant opérationnel !**
