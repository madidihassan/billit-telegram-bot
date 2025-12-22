# Commandes du Bot Telegram Billit

Le bot est maintenant **actif et interactif** ! Vous pouvez lui envoyer des commandes directement sur Telegram.

## 📋 **Commandes disponibles**

### **Factures**

#### `/lastinvoice [fournisseur]`
Affiche la dernière facture d'un fournisseur spécifique.

**Exemples :**
```
/lastinvoice Foster
/lastinvoice Acme Corp
```

**Réponse :**
```
🧾 Facture INV-2024-123

Fournisseur: Foster Electric
Montant: 1.234,56 €
Date: 15/12/2024
Échéance: 15/01/2025
Statut: ⏳ pending

🔗 Voir sur Billit
```

---

#### `/unpaid`
Liste toutes les factures impayées avec le total.

**Exemple :**
```
/unpaid
```

**Réponse :**
```
📋 Factures impayées (3)

1. Foster Electric
   INV-2024-123 - 1.234,56 €
   Échéance: 15/01/2025

2. Acme Corp
   INV-2024-124 - 2.345,67 €
   Échéance: 20/01/2025

💰 Total: 3.580,23 €
```

---

#### `/overdue`
Liste les factures en retard (après la date d'échéance).

**Exemple :**
```
/overdue
```

**Réponse :**
```
⚠️ Factures en retard (2)

1. Old Supplier
   INV-2024-100 - 500,00 €
   ⚠️ En retard de 15 jour(s)

💰 Total: 500,00 €
```

---

#### `/search [terme]`
Recherche des factures par fournisseur, numéro ou statut.

**Exemples :**
```
/search Foster
/search INV-2024
/search paid
```

**Réponse :**
```
🔍 Résultats pour "Foster"

1. Foster Electric
   INV-2024-123 - 1.234,56 €
   15/12/2024 - ⏳ pending

2. Foster Electric
   INV-2024-100 - 890,00 €
   01/12/2024 - ✅ paid
```

---

#### `/supplier [nom]`
Liste toutes les factures d'un fournisseur spécifique.

**Exemples :**
```
/supplier Foster
/supplier Acme
```

**Réponse :**
```
📋 Factures de Foster Electric

1. INV-2024-123 - 1.234,56 €
   15/12/2024 - ⏳ pending

2. INV-2024-100 - 890,00 €
   01/12/2024 - ✅ paid

💰 Total (affiché): 2.124,56 €
```

---

### **Statistiques**

#### `/stats`
Affiche les statistiques du mois en cours.

**Exemple :**
```
/stats
```

**Réponse :**
```
📊 Statistiques décembre 2024

Factures: 15 au total
├─ ✅ Payées: 12 (10.500,00 €)
└─ ⏳ Impayées: 3 (2.345,00 €)

💰 Total: 12.845,00 €
```

---

### **Aide**

#### `/help`
Affiche la liste de toutes les commandes disponibles.

**Exemple :**
```
/help
```

---

## 🎯 **Exemples d'utilisation**

### Scénario 1 : Vérifier une facture
```
Vous: /lastinvoice Foster
Bot: 🧾 Facture INV-2024-123...
```

### Scénario 2 : Voir ce qui est impayé
```
Vous: /unpaid
Bot: 📋 Factures impayées (3)...
```

### Scénario 3 : Statistiques mensuelles
```
Vous: /stats
Bot: 📊 Statistiques décembre 2024...
```

### Scénario 4 : Recherche rapide
```
Vous: /search Acme
Bot: 🔍 Résultats pour "Acme"...
```

---

## 🔔 **Notifications automatiques**

En plus des commandes, le bot envoie **automatiquement** des notifications quand :

✅ **Une nouvelle facture arrive** sur Billit
- Toutes les 5 minutes, le système vérifie s'il y a de nouvelles factures
- Vous recevez une notification instantanée avec tous les détails

**Format de notification :**
```
🧾 Nouvelle facture Billit

Fournisseur: Foster Electric
Numéro: INV-2024-123
Montant: 1.234,56 €
Date: 21/12/2024
Échéance: 20/01/2025
Statut: ⏳ pending

🔗 Voir la facture
```

---

## ⚙️ **Configuration**

Le bot fonctionne en arrière-plan avec PM2. Voici les commandes de gestion :

```bash
# Voir le statut
pm2 status

# Voir les logs en temps réel
pm2 logs billit-bot

# Redémarrer
pm2 restart billit-bot

# Arrêter
pm2 stop billit-bot

# Relancer
pm2 start billit-bot
```

---

## 🚀 **Mode développement**

Pour tester en local (sans PM2) :

```bash
# Mode bot interactif
npm run dev:bot

# Mode notifications uniquement
npm run dev
```

---

## 📝 **Notes importantes**

- Le bot répond **uniquement** à votre Chat ID configuré (7887749968)
- Les commandes sont **sensibles à la casse** : utilisez `/help` et non `/Help`
- Vous pouvez raccourcir les noms de fournisseurs : `/lastinvoice Fost` trouvera "Foster"
- La recherche est **case-insensitive** : `/search foster` = `/search Foster`

---

## 💡 **Astuces**

1. **Commande rapide du matin** : `/overdue` pour voir ce qui est urgent
2. **Fin de mois** : `/stats` pour voir le total du mois
3. **Avant un paiement** : `/unpaid` pour voir tout ce qui reste à payer
4. **Recherche rapide** : `/search` + quelques lettres du fournisseur

Profitez de votre bot Billit ! 🎉
