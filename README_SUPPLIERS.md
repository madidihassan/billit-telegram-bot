# 🤖 Système Intelligent de Gestion des Fournisseurs

## 🎯 Qu'est-ce que c'est ?

Un système qui **analyse automatiquement** vos transactions bancaires pour identifier et configurer les fournisseurs dans votre bot Telegram.

---

## ⚡ Démarrage ultra-rapide (30 secondes)

```bash
cd /home/ubuntu/Billit
./setup-suppliers.sh
```

**C'est tout ! ✅** Le script va :
1. Analyser vos 3 derniers mois de transactions
2. Identifier automatiquement les fournisseurs récurrents
3. Les ajouter au dictionnaire
4. Redémarrer le bot

---

## 📱 Test sur Telegram

Après le setup, testez ces commandes :

```
"Donne-moi les transactions Foster"
"Recettes Eden Red du mois"
"Quel est le montant payé à ONSS en novembre ?"
```

Le bot comprendra maintenant toutes ces variantes ! 🎉

---

## 📊 Résultats attendus

Après l'analyse, **13+ fournisseurs** sont automatiquement configurés, incluant :

- ✅ Foster Fast Food (110k€ sur 3 mois)
- ✅ EDENRED (8.6k€)
- ✅ ONSS (14.5k€)
- ✅ Sogle (10.8k€)
- ✅ Et tous vos fournisseurs récurrents...

---

## 🔧 Commandes disponibles

### **Configuration automatique** (recommandé)

```bash
# Tout-en-un
./setup-suppliers.sh

# OU manuellement
npx ts-node auto-add-top-suppliers.ts
npm run build && pm2 restart billit-bot
```

### **Analyse et gestion**

```bash
# Voir les fournisseurs détectés (sans modifier)
npx ts-node analyze-suppliers-auto.ts

# Lister les fournisseurs configurés
npx ts-node list-suppliers.ts

# Ajouter un fournisseur manuellement
npx ts-node add-supplier.ts
```

---

## 📚 Documentation complète

- `COMPLETE_SUMMARY.md` - **Récapitulatif complet** ⭐
- `AUTO_ANALYSIS.md` - Guide d'analyse automatique
- `SUPPLIERS.md` - Gestion des fournisseurs
- `SUPPLIER_ALIASES_README.md` - Architecture technique

---

## 🔄 Maintenance mensuelle

```bash
# Le 1er de chaque mois (ou quand vous voulez)
cd /home/ubuntu/Billit
./setup-suppliers.sh
```

---

## ❓ Questions fréquentes

### **Dois-je faire quelque chose manuellement ?**
Non ! Tout est automatique. Lancez `./setup-suppliers.sh` et c'est fait.

### **Combien de temps ça prend ?**
30 secondes à 1 minute selon le nombre de transactions.

### **Dois-je le refaire régulièrement ?**
Recommandé 1 fois par mois pour ajouter les nouveaux fournisseurs.

### **Puis-je ajouter un fournisseur manuellement ?**
Oui : `npx ts-node add-supplier.ts`

### **Comment voir tous mes fournisseurs ?**
`npx ts-node list-suppliers.ts`

---

## 🎉 Résumé

1. **Lancez** : `./setup-suppliers.sh`
2. **Attendez** : 30 secondes
3. **Testez** : "Transactions Foster" sur Telegram

**✅ C'est tout !** Vos fournisseurs sont maintenant reconnus automatiquement ! 🚀
