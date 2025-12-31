# 📋 Guide d'utilisation du Bot Billit - Partie Factures

## 🎯 Objectif
Ce guide vous montre comment interroger le bot pour obtenir des informations sur vos factures.

---

## 🔘 1. BOUTONS DU MENU PRINCIPAL

### Menu accessible via `/start` ou `/menu`

| Bouton | Ce qui s'affiche | Quand l'utiliser |
|--------|------------------|------------------|
| 📋 **Impayées** | Liste toutes les factures impayées avec montants | Voir ce que je dois payer |
| ⚠️ **En retard** | Factures dont l'échéance est dépassée + nombre de jours de retard | Voir les paiements urgents |
| 📅 **Échéances** | Factures à payer dans les 15 prochains jours (🔴 0-3j, 🟠 4-7j, 🟡 8-15j) | Planifier mes paiements |
| 📊 **Stats** | Santé financière + statistiques du mois | Vue d'ensemble de mon activité |
| 🔍 **Rechercher** | Formulaire de recherche | Trouver une facture spécifique |
| 🤖 **Outils IA** | Liste des 38 outils disponibles | Découvrir les possibilités |

---

## 💬 2. QUESTIONS EN LANGAGE NATUREL (IA)

Le bot comprend vos questions en français naturel. Voici des exemples testés :

### 📊 Statistiques et synthèses

| Question à poser | Résultat attendu |
|------------------|------------------|
| "Donne-moi les stats du mois" | Nombre de factures, montant total, payées/impayées |
| "Combien j'ai de factures ce mois-ci ?" | Statistiques complètes du mois |
| "Combien j'ai dépensé ce mois ?" | Montant total des dépenses du mois |
| "Quel est mon bénéfice du mois ?" | Recettes - Dépenses = Bénéfice |

### 🔍 Recherche de factures

| Question à poser | Résultat attendu |
|------------------|------------------|
| "Dernière facture Foster" | La facture la plus récente de Foster |
| "Factures Coca Cola" | Toutes les factures de ce fournisseur |
| "Facture 7GA0289" | Recherche par numéro de facture |
| "Factures de décembre" | Toutes les factures du mois de décembre |
| "Factures entre octobre et décembre" | Factures sur une période de 3 mois |

### 🏪 Analyse par fournisseur

| Question à poser | Résultat attendu |
|------------------|------------------|
| "Analyse Foster" | Stats détaillées : min/max/moyenne, évolution mensuelle, 10 derniers paiements |
| "Combien j'ai payé à Uber ce mois ?" | Total des paiements pour ce fournisseur |
| "Compare Foster et Coca Cola" | Comparaison entre 2 fournisseurs |
| "Top 10 fournisseurs" | Classement des 10 plus grosses dépenses |
| "Top 5 fournisseurs de décembre" | Top 5 du mois spécifique |

### 💰 Finances et balances

| Question à poser | Résultat attendu |
|------------------|------------------|
| "Balance du mois" | Récapitulatif : crédits, débits, balance |
| "Recettes du mois" | Total des entrées d'argent |
| "Dépenses de décembre" | Total des sorties d'argent du mois |
| "Recettes des trois derniers mois" | Revenus d'octobre, novembre, décembre + total |
| "Balance pour octobre" | Résumé du mois uniquement |

### 👥 Analyse salaires (employés)

| Question à poser | Résultat attendu |
|------------------|------------------|
| "Salaires de décembre" | Liste des paiements salaires du mois |
| "Analyse les salaires de décembre" | Stats complètes : top employés, min/max, moyenne |
| "Top 10 employés les mieux payés" | Classement des 10 salaires les plus élevés |
| "Salaire de Mokhlis Jamhoun" | Total payé à cet employé |
| "Compare Kalide Chami et Mokhlis Jamhoun" | Comparaison entre 2 employés |
| "Où se situe Tag Lina par rapport aux autres ?" | Position dans le classement + comparaison |

### ⏰ Factures en retard et échéances

| Question à poser | Résultat attendu |
|------------------|------------------|
| "Factures en retard" | Liste des factures échues |
| "Combien j'ai de factures en retard ?" | Nombre + montant total |
| "Factures à payer cette semaine" | Échéances des 7 prochains jours |

---

## ⌨️ 3. COMMANDES TEXTUELLES

Ces commandes commencent par `/` :

| Commande | Exemple | Résultat |
|----------|---------|----------|
| `/unpaid` | `/unpaid` | Liste des factures impayées |
| `/overdue` | `/overdue` | Factures en retard |
| `/stats` | `/stats` | Statistiques du mois |
| `/search` | `/search Foster` | Recherche de factures par mot-clé |
| `/supplier` | `/supplier Coca Cola` | Factures d'un fournisseur |
| `/lastinvoice` | `/lastinvoice KBC` | Dernière facture du fournisseur |
| `/help` | `/help` | Aide et liste des commandes |
| `/menu` | `/menu` | Retour au menu principal |

---

## 🧪 4. QUESTIONNAIRE DE TEST COMPLET

### ✅ Test 1 : Boutons du menu
- [ ] Cliquer sur **📋 Impayées** → Affiche toutes les factures impayées
- [ ] Cliquer sur **⚠️ En retard** → Affiche les factures échues avec nombre de jours
- [ ] Cliquer sur **📅 Échéances** → Affiche les factures des 15 prochains jours
- [ ] Cliquer sur **📊 Stats** → Affiche santé financière + stats du mois
- [ ] Cliquer sur **🤖 Outils IA** → Affiche la liste des 38 outils

### ✅ Test 2 : Questions simples
- [ ] "Stats du mois" → Statistiques complètes
- [ ] "Combien de factures impayées ?" → Nombre + montant
- [ ] "Dernière facture Foster" → Facture la plus récente
- [ ] "Factures en retard" → Liste avec jours de retard

### ✅ Test 3 : Recherche par fournisseur
- [ ] "Analyse Foster" → Stats détaillées (min/max/moy + évolution)
- [ ] "Factures Coca Cola" → Toutes les factures du fournisseur
- [ ] "Top 5 fournisseurs" → Classement des 5 plus grosses dépenses
- [ ] "Compare Foster et Coca Cola" → Comparaison entre 2 fournisseurs

### ✅ Test 4 : Périodes et dates
- [ ] "Factures de décembre" → Factures du mois
- [ ] "Balance du mois" → Crédits, débits, balance du mois actuel
- [ ] "Recettes des trois derniers mois" → Oct + Nov + Déc + Total
- [ ] "Factures entre octobre et décembre" → Période de 3 mois

### ✅ Test 5 : Salaires (employés)
- [ ] "Salaires de décembre" → Liste des paiements salaires
- [ ] "Analyse les salaires de décembre" → Stats complètes
- [ ] "Top 10 employés" → Classement des 10 salaires les plus élevés
- [ ] "Salaire de Mokhlis Jamhoun" → Total payé à l'employé

### ✅ Test 6 : Fonctions avancées
- [ ] "Où se situe Tag Lina ?" → Position dans le classement
- [ ] "Compare Kalide et Mokhlis" → Comparaison salaires
- [ ] "Recettes du mois" → Total des entrées d'argent
- [ ] "Dépenses du mois" → Total des sorties

### ✅ Test 7 : Commandes textuelles
- [ ] `/search 7GA0289` → Recherche par numéro de facture
- [ ] `/supplier KBC` → Factures du fournisseur KBC
- [ ] `/lastinvoice Uber` → Dernière facture Uber
- [ ] `/unpaid` → Liste des impayées

---

## 💡 5. ASTUCES ET BONNES PRATIQUES

### ✨ Le bot comprend :
- ✅ Les fautes d'orthographe : "Mokhlis Jamhoun" trouve "Jamhoun Mokhlis"
- ✅ Les noms partiels : "lina" trouve "Tag Lina"
- ✅ Les variantes : "recettes" = "revenus" = "crédits"
- ✅ Les mois en français : "décembre", "octobre", etc.

### 🎯 Formulations recommandées :
- Pour des **stats détaillées** : "Analyse..." (ex: "analyse Foster")
- Pour un **résumé court** : Poser la question directement (ex: "salaires de décembre")
- Pour un **top X** : "top 10...", "top 5..." (ex: "top 10 fournisseurs")
- Pour une **comparaison** : "compare X et Y" (ex: "compare Foster et Coca")

### 🚫 À éviter :
- Questions trop vagues : "donne-moi des infos" (préciser quoi)
- Demandes impossibles : "factures de 2020" (si pas de données)
- Trop de critères en une fois : "factures Foster de décembre impayées en retard" (décomposer)

---

## 📞 6. AIDE ET SUPPORT

### En cas de problème :
1. Essayez de reformuler votre question
2. Utilisez les boutons du menu pour les actions courantes
3. Tapez `/help` pour voir la liste complète des commandes
4. Contactez l'administrateur si le bot ne répond pas

### Commandes utiles :
- `/start` - Retour au menu principal
- `/help` - Afficher l'aide
- `/menu` - Afficher les boutons de navigation

---

## 📝 7. EXEMPLES DE CONVERSATIONS RÉELLES

### Exemple 1 : Planifier les paiements
```
Vous: "Échéances de la semaine"
Bot: 📅 FACTURES À ÉCHÉANCE (7 prochains jours)
     1. Foster - 19 660,21 € - 🟠 Dans 5j
     2. KBC Bank - 12 100,00 € - 🔴 Dans 2j
     TOTAL: 31 760,21 € (2 factures)
```

### Exemple 2 : Analyse d'un fournisseur
```
Vous: "Analyse Foster"
Bot: 🏪 ANALYSE FOSTER

     📊 Statistiques globales:
     • Total dépensé: 125 450,30 €
     • Nombre de paiements: 15
     • Montant moyen: 8 363,35 €
     • Min: 5 200,00 € | Max: 19 660,21 €

     📈 Évolution mensuelle:
     • Décembre 2025: 19 660,21 € (1 paiement)
     • Novembre 2025: 18 200,00 € (2 paiements)
     ...
```

### Exemple 3 : Santé financière
```
Vous: "Stats du mois"
Bot: 📊 STATISTIQUES DU MOIS
     📅 décembre 2025

     💰 SANTÉ FINANCIÈRE
        💵 Recettes: 114 190,93 € (208 tx)
        💸 Dépenses: 108 579,98 € (98 tx)
        📈 Bénéfice: 5 610,95 €

     📋 FACTURES FOURNISSEURS
        Total: 19 factures (Moy: 2 062,29 €)
        ...
```

---

## 🎓 8. POUR LES UTILISATEURS AVANCÉS

### Combiner plusieurs outils :
1. Poser une question générale : "top 10 fournisseurs"
2. Approfondir un résultat : "analyse Foster"
3. Comparer avec un autre : "compare Foster et Coca Cola"

### Utiliser les périodes :
- Mois unique : "décembre", "novembre"
- Plusieurs mois : "trois derniers mois", "entre octobre et décembre"
- Année : "année 2025"

### Recherche intelligente :
- Par nom : "Foster", "Coca"
- Par numéro : "7GA0289"
- Par montant : "factures de plus de 10000 €"
- Par date : "factures de la semaine dernière"

---

**Version du guide : 1.0**
**Date : 30 décembre 2025**
**Bot : Billit Telegram Bot v2.6**
