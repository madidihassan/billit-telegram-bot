# 📄 Affichage des Détails de Facture

## ✅ Fonctionnalité Implémentée

Le bot peut maintenant afficher le **contenu détaillé** d'une facture avec :
- Toutes les lignes de produits/services
- Quantités et prix unitaires
- Taux de TVA par ligne
- Totaux HTVA et TVAC
- Lien pour télécharger le PDF

---

## 🎯 Comment utiliser

### **Option 1 : Commande texte**

```
/invoice INV-2024-001
```

### **Option 2 : Commande vocale** 🎤

Dites simplement :
- "Montre-moi la facture INV-001"
- "Détails de la facture Foster"
- "Affiche le contenu de INV-2024-001"

L'IA comprendra et affichera les détails !

---

## 📋 Exemple d'affichage

```
━━━━━━━━━━━━━━━━━━━━━━
🧾 FOSTER FAST FOOD SA
━━━━━━━━━━━━━━━━━━━━━━

📄 Facture: INV-2024-001
📅 Date: 15/12/2024
⏰ Échéance: 30/12/2024
✅ Statut: paid

━━━━━━━━━━━━━━━━━━━━━━
📦 LIGNES DE FACTURE
━━━━━━━━━━━━━━━━━━━━━━

1. Burgers Premium
   💰 25,00 € × 50 = 1 250,00 €
   🔖 TVA 21%

2. Frites surgelées
   💰 3,50 € × 100 = 350,00 €
   🔖 TVA 6%

3. Boissons
   💰 1,20 € × 200 = 240,00 €
   🔖 TVA 21%

━━━━━━━━━━━━━━━━━━━━━━
💰 TOTAUX
━━━━━━━━━━━━━━━━━━━━━━

Sous-total HTVA: 1 652,89 €
TVA: 335,69 €
━━━━━━━━━━━━━━━━━━━━━━
TOTAL TVAC: 1 988,58 €

💬 +++123/4567/89+++

📥 Télécharger le PDF
```

---

## 🚀 Cas d'usage

### **Vérifier le contenu d'une facture**
```
Vous: /invoice INV-2024-001
Bot: [Affiche toutes les lignes avec détails]
```

### **Par commande vocale**
```
Vous: 🎤 "Montre-moi le détail de la facture Foster"
Bot: 🧠 Analyse...
Bot: [Affiche les détails de la dernière facture Foster]
```

### **Télécharger le PDF**
Cliquez sur le lien "📥 Télécharger le PDF" en bas du message

---

## 📊 Informations affichées

✅ **En-tête**
- Nom du fournisseur
- Numéro de facture
- Date et échéance
- Statut (payé/impayé)

✅ **Lignes de facture**
- Description de chaque article
- Quantité × Prix unitaire = Total
- Taux de TVA par ligne

✅ **Totaux**
- Sous-total HTVA
- Total TVA
- Total TVAC

✅ **Extras**
- Communication structurée
- Lien vers le PDF sur Billit

---

## 💡 Astuces

### **Rechercher puis afficher**
1. `/search Foster` → Trouve toutes les factures Foster
2. Notez le numéro de facture
3. `/invoice [numéro]` → Affiche les détails

### **Vocal naturel**
L'IA comprend des phrases comme :
- "Quel est le contenu de la facture INV-001 ?"
- "Montre-moi ce qu'il y a dans la facture Foster"
- "Détails de ma dernière facture CIERS"

---

## 🔧 Technique

### **API utilisée**
- `GET /v1/orders/{id}` - Récupère les détails complets
- Parse les `OrderLines` pour afficher chaque ligne
- Calcule les totaux HTVA/TVAC

### **Commandes reconnues**
- `/invoice [numéro]`
- `/details [numéro]`
- Commandes vocales avec IA

---

## ✨ Prochaines améliorations possibles

- [ ] Bouton "📄 Voir détails" sur chaque facture dans les listes
- [ ] Téléchargement automatique du PDF dans Telegram
- [ ] Export en Excel
- [ ] Comparaison de factures

---

**La fonctionnalité est maintenant active ! Testez avec vos factures.** 🎉
