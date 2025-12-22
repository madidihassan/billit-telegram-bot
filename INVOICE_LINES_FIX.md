# 🔧 Correction de l'affichage des lignes de facture

## ❌ Problème identifié

Les lignes de facture affichaient :
- Prix unitaires à `0,00 €`
- TVA à `0%`
- Mauvais calculs

## ✅ Corrections apportées

### **1. Parsing amélioré**
Le bot essaie maintenant plusieurs champs de l'API Billit :
- `UnitPrice`, `Price`, `UnitPriceExcl`, `PriceExcl`
- `TotalExcl`, `Total`, `AmountExcl`
- `VATRate`, `VAT`, `VATPercentage`

### **2. Filtrage des lignes vides**
Les lignes avec montants à 0 (erreurs de parsing) sont maintenant ignorées.

### **3. Affichage conditionnel**
- Si quantité > 1 : affiche `prix × quantité = total`
- Si quantité = 1 : affiche juste le `total`
- Si TVA = 0 : n'affiche pas la ligne TVA

### **4. Logs de debug**
Un log affiche la structure de la première ligne pour diagnostiquer les problèmes.

---

## 🧪 Test

**Réessayez maintenant :**

```
/invoice 2500003745
```

ou

```
🎤 "Affiche la facture 2500003745"
```

---

## 📊 Vérification

Après avoir réessayé la commande, je peux vérifier les logs pour voir la structure exacte des données de Billit et ajuster si nécessaire.

**Commande pour voir les logs :**
```bash
pm2 logs billit-bot --lines 100 | grep "Structure"
```

---

## 🔍 Si le problème persiste

Si les montants sont toujours incorrects, cela peut signifier que :

1. **L'API Billit ne renvoie pas les lignes détaillées**
   - Solution : Afficher seulement le résumé (HTVA/TVA/TVAC)

2. **Les champs ont des noms différents**
   - Solution : Adapter le parsing après avoir vu les logs

3. **Les données ne sont pas dans `OrderLines`**
   - Solution : Chercher dans d'autres champs (`Lines`, `Items`, etc.)

---

## 💡 Alternative

Si l'API ne fournit pas les détails des lignes, on peut :
- Afficher uniquement les totaux (HTVA, TVA, TVAC)
- Proposer uniquement le téléchargement du PDF
- Afficher un message : "Détails disponibles dans le PDF"

---

**Réessayez la commande et dites-moi ce qui s'affiche !** 🚀
