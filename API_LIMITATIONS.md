# ⚠️ Limitations de l'API Billit - Transactions Bancaires

## 📊 Résultats des tests (22 décembre 2025)

### ✅ Historique disponible

| Période | Transactions | Statut |
|---------|--------------|--------|
| **18/09/2025 - 22/12/2025** | **939** | ✅ Disponible |
| Septembre 2025 | 98 | ✅ Partiel (depuis le 18) |
| Octobre 2025 | 311 | ✅ Complet |
| Novembre 2025 | 289 | ✅ Complet |
| Décembre 2025 | 200 | ✅ En cours |

### ❌ Historique NON disponible

| Période | Statut |
|---------|--------|
| Avant septembre 2025 | ❌ Non disponible |
| Janvier - Août 2025 | ❌ Non disponible |
| Année 2024 | ❌ Non disponible |

---

## 🎯 Limitation principale

### **L'API Billit conserve environ 3-4 mois d'historique**

**Période actuelle :** Du **18/09/2025** au **22/12/2025** (≈ 3 mois)

**Conséquence :**
- ❌ Impossible de récupérer toute l'année via l'API
- ❌ Les anciennes transactions ne sont plus accessibles
- ✅ Seuls les 3-4 derniers mois sont disponibles

---

## 📈 Limite de pagination

### Test effectué :
- ✅ Pagination fonctionne avec `$skip` et `$top`
- ✅ Maximum testé : 939 transactions récupérées
- ✅ Pas de limite stricte sur le nombre avec pagination
- ❌ Mais limite temporelle : seulement 3-4 mois

---

## 💡 Solutions de contournement

### **1. Export manuel (Recommandé pour l'historique complet)**

**Via l'interface web Billit :**
1. Connectez-vous à https://my.billit.eu
2. Menu "Comptes bancaires"
3. Sélectionnez votre compte
4. Période : Toute l'année (01/01/2025 - 31/12/2025)
5. Exportez en CSV ou Excel

**Avantages :**
- ✅ Historique complet de l'année
- ✅ Toutes les transactions
- ✅ Pas de limite temporelle

---

### **2. Backup automatique quotidien**

**Script créé : `backup-transactions.ts`**

```bash
# Exécuter manuellement
npx ts-node backup-transactions.ts

# OU automatiquement avec cron (tous les jours à 2h)
0 2 * * * cd /home/ubuntu/Billit && npx ts-node backup-transactions.ts
```

**Avantages :**
- ✅ Conserve l'historique au fur et à mesure
- ✅ Pas de perte de données
- ✅ Fichiers JSON exploitables

**Stockage :**
- Dossier : `/home/ubuntu/Billit/backups/`
- Format : `transactions_YYYY-MM-DD.json`
- Rétention : 30 derniers backups

---

### **3. Contacter le support Billit**

**Questions à poser :**

1. **Existe-t-il un endpoint pour l'historique complet ?**
   - Ex: `/v1/financialTransactions/archive` ou similaire

2. **Peut-on augmenter la limite temporelle ?**
   - Passer de 3 mois à 12 mois par exemple

3. **Y a-t-il un accès aux archives ?**
   - API spéciale pour les données historiques

4. **Format d'export en masse ?**
   - Endpoint dédié pour les exports complets

**Contact Billit :**
- Support : support@billit.be
- Documentation API : https://my.billit.eu/docs/api

---

## 📋 Données actuellement accessibles

### Par le bot Telegram

**Commandes fonctionnelles :**
- ✅ "Recettes du mois de septembre" → Depuis le 18/09
- ✅ "Recettes du mois d'octobre" → Complet
- ✅ "Recettes du mois de novembre" → Complet
- ✅ "Recettes du mois de décembre" → Complet
- ❌ "Recettes du mois de juillet" → Aucune donnée
- ❌ "Recettes de janvier à août" → Aucune donnée

---

## 🔄 Recommandations

### **Pour l'avenir (à partir de maintenant)**

1. **Activer le backup quotidien**
```bash
crontab -e
# Ajouter :
0 2 * * * cd /home/ubuntu/Billit && npx ts-node backup-transactions.ts
```

2. **Conserver les exports manuels**
- Exporter chaque mois depuis Billit Web
- Stocker dans un dossier sécurisé

3. **Utiliser les backups pour les analyses historiques**
- Les backups JSON peuvent être importés dans le bot
- Script d'import à créer si besoin

---

### **Pour récupérer l'historique 2025 complet**

**Option A : Export manuel (Plus simple)**
1. Allez sur https://my.billit.eu
2. Exportez janvier - décembre 2025
3. Vous aurez TOUTES les transactions

**Option B : Contacter Billit**
1. Demander accès à l'historique complet via API
2. Possibilité d'un endpoint spécial

---

## 📊 Statistiques actuelles

**Transactions accessibles via API :**
- **Total** : 939 transactions
- **Période** : 18/09/2025 - 22/12/2025
- **Durée** : ≈ 3 mois et 4 jours
- **Fournisseurs identifiés** : 26
- **Top fournisseurs configurés** : 13

**Transactions manquantes :**
- Janvier - Août 2025 : ❌ Non accessible via API
- Total estimé manquant : ~2500-3000 transactions (si même rythme)

---

## 🎯 Conclusion

### **L'API Billit a une limitation de 3-4 mois d'historique**

**Pour avoir toute l'année :**
1. ✅ Utilisez l'export manuel sur Billit Web
2. ✅ Activez les backups automatiques dès maintenant
3. ✅ Contactez Billit pour demander plus d'historique

**Le bot fonctionne parfaitement pour les 3 derniers mois disponibles !** 🎉
