# 🧪 PLAN DE TESTS - SPRINT 1 (Quick Wins)

**Date** : 22 janvier 2026
**Bot** : Tonton202 (PID: 625335)
**Version** : 3.2 (Sprint 1)

---

## 📋 RÉSUMÉ DES OPTIMISATIONS

1. **OPTIM 6** : Détection locale des commandes simples (+15% vitesse)
2. **OPTIM 7** : Parallélisation des outils IA (+40% vitesse multi-outils)
3. **OUTIL 10** : Système d'alertes personnalisées (3 nouveaux outils)

---

## 🧪 TEST 1 : OPTIM 6 - Détection Locale

### Objectif
Vérifier que les commandes simples (salutations, remerciements, confirmations) répondent **instantanément** sans appel IA.

### Tests à effectuer

#### Test 1.1 : Salutations
**Envoyez** : `bonjour`
**Résultat attendu** : Réponse instantanée (< 100ms) avec :
```
👋 Bonjour ! Comment puis-je vous aider ?
```
**✅ Validé** : Oui / Non

---

#### Test 1.2 : Autres salutations
**Envoyez** : `salut`
**Résultat attendu** : Réponse instantanée
**✅ Validé** : Oui / Non

**Envoyez** : `hello`
**Résultat attendu** : Réponse instantanée
**✅ Validé** : Oui / Non

---

#### Test 1.3 : Remerciements
**Envoyez** : `merci`
**Résultat attendu** : Réponse instantanée avec :
```
✅ De rien ! N'hésitez pas si vous avez d'autres questions.
```
**✅ Validé** : Oui / Non

**Envoyez** : `thanks`
**Résultat attendu** : Réponse instantanée
**✅ Validé** : Oui / Non

---

#### Test 1.4 : Confirmations
**Envoyez** : `ok`
**Résultat attendu** : Réponse instantanée avec :
```
👍 Parfait ! Autre chose ?
```
**✅ Validé** : Oui / Non

**Envoyez** : `parfait`
**Résultat attendu** : Réponse instantanée
**✅ Validé** : Oui / Non

---

#### Test 1.5 : Demande d'aide
**Envoyez** : `aide`
**Résultat attendu** : Menu principal s'affiche instantanément
**✅ Validé** : Oui / Non

---

### 📊 Score Test 1
**Tests réussis** : ___ / 8
**Temps moyen de réponse** : ___ ms (attendu < 200ms)

---

## 🧪 TEST 2 : OPTIM 7 - Parallélisation

### Objectif
Vérifier que les questions multi-outils s'exécutent en **parallèle** (plus rapides).

### Tests à effectuer

#### Test 2.1 : Question mono-outil (référence)
**Envoyez** : `Factures impayées`
**Résultat attendu** : Réponse avec liste des factures impayées
**⏱️ Temps de réponse** : ___ ms (noter pour comparaison)
**✅ Validé** : Oui / Non

---

#### Test 2.2 : Question multi-outils (test parallélisation)
**Envoyez** : `Factures impayées et en retard`
**Résultat attendu** :
- Réponse avec DEUX listes (impayées + en retard)
- **Temps < 2x le temps du Test 2.1** (preuve de parallélisation)

**⏱️ Temps de réponse** : ___ ms
**✅ Validé** : Oui / Non
**✅ Parallélisation détectée** : Oui / Non

---

#### Test 2.3 : Vérification logs
**Commande** :
```bash
tail -50 /home/ubuntu/Billit/bot_tonton202/bot.log | grep "OPTIM 7"
```

**Résultat attendu** : Ligne contenant :
```
⚡ OPTIM 7: Exécution parallèle de 2 outils
```
**✅ Validé** : Oui / Non

---

### 📊 Score Test 2
**Tests réussis** : ___ / 3
**Gain de vitesse** : ___ % (calculé vs référence)

---

## 🧪 TEST 3 : OUTIL 10 - Système d'Alertes

### Objectif
Tester la création, listage et suppression d'alertes personnalisées.

### Tests à effectuer

#### Test 3.1 : Créer une alerte (factures impayées)
**Envoyez** : `Préviens-moi si les impayés dépassent 5000€`
**Résultat attendu** :
```
✅ Alerte créée avec succès !

🔔 Type : 💰 Factures impayées
📈 Seuil : 5000€
📝 Description : Factures impayées > 5000€
🆔 ID : <code>XXXXXXXXXXXX-XXXXXXX</code>

💡 L'alerte est maintenant active et vous préviendra automatiquement.
```
**✅ Validé** : Oui / Non
**🆔 ID alerte** : ___________________ (noter pour Test 3.4)

---

#### Test 3.2 : Créer une alerte (factures en retard)
**Envoyez** : `Alerte-moi si j'ai plus de 10 factures en retard`
**Résultat attendu** :
```
✅ Alerte créée avec succès !

🔔 Type : ⏰ Factures en retard
📈 Seuil : 10 factures
```
**✅ Validé** : Oui / Non
**🆔 ID alerte** : ___________________ (noter pour Test 3.5)

---

#### Test 3.3 : Lister les alertes
**Envoyez** : `Quelles sont mes alertes ?`
**Résultat attendu** :
```
🔔 Vos alertes actives (2)

1. 🟢 💰 Factures impayées
   Seuil : 5000€
   ID : <code>XXXX</code>

2. 🟢 ⏰ Factures en retard
   Seuil : 10 factures
   ID : <code>XXXX</code>
```
**✅ Validé** : Oui / Non
**✅ 2 alertes affichées** : Oui / Non

---

#### Test 3.4 : Supprimer une alerte
**Envoyez** : `Supprime l'alerte <ID du Test 3.1>`
**Résultat attendu** :
```
✅ Alerte supprimée avec succès !

🆔 ID : <code>XXXX</code>
```
**✅ Validé** : Oui / Non

---

#### Test 3.5 : Vérifier la suppression
**Envoyez** : `Liste mes alertes`
**Résultat attendu** : Seulement 1 alerte affichée (celle du Test 3.2)
**✅ Validé** : Oui / Non

---

#### Test 3.6 : Créer alerte balance
**Envoyez** : `Notifie-moi si la balance passe sous 10000€`
**Résultat attendu** :
```
✅ Alerte créée avec succès !

🔔 Type : 📊 Balance bancaire
📈 Seuil : 10000€
```
**✅ Validé** : Oui / Non

---

#### Test 3.7 : Créer alerte dépense
**Envoyez** : `Alerte pour dépenses supérieures à 3000€`
**Résultat attendu** :
```
✅ Alerte créée avec succès !

🔔 Type : 💸 Dépense importante
📈 Seuil : 3000€
```
**✅ Validé** : Oui / Non

---

#### Test 3.8 : Vérifier toutes les alertes
**Envoyez** : `Mes alertes`
**Résultat attendu** : 3 alertes affichées (Tests 3.2, 3.6, 3.7)
**✅ Validé** : Oui / Non

---

#### Test 3.9 : Nettoyer (supprimer toutes les alertes)
**Envoyez** : `Supprime l'alerte <ID1>` (répéter pour chaque ID)
**✅ Validé** : Oui / Non (toutes supprimées)

---

### 📊 Score Test 3
**Tests réussis** : ___ / 9

---

## 🧪 TEST 4 : Tests de Non-Régression

### Objectif
Vérifier que les fonctionnalités existantes fonctionnent toujours.

#### Test 4.1 : Factures fournisseur
**Envoyez** : `Factures de Foster`
**✅ Validé** : Oui / Non

#### Test 4.2 : Salaires
**Envoyez** : `Salaires de Mokhlis Jamhoun`
**✅ Validé** : Oui / Non

#### Test 4.3 : Top fournisseurs
**Envoyez** : `Top 10 fournisseurs`
**✅ Validé** : Oui / Non

#### Test 4.4 : Dernière transaction
**Envoyez** : `Dernière transaction`
**✅ Validé** : Oui / Non

### 📊 Score Test 4
**Tests réussis** : ___ / 4

---

## 📊 RÉSUMÉ GLOBAL

| Test | Score | Commentaires |
|------|-------|-------------|
| Test 1 - OPTIM 6 | __ / 8 | |
| Test 2 - OPTIM 7 | __ / 3 | |
| Test 3 - OUTIL 10 | __ / 9 | |
| Test 4 - Non-régression | __ / 4 | |
| **TOTAL** | **__ / 24** | **___ %** |

---

## 🐛 BUGS DÉTECTÉS

*(Lister ici tous les bugs rencontrés)*

1.
2.
3.

---

## 💡 SUGGESTIONS D'AMÉLIORATION

*(Noter vos idées d'amélioration)*

1.
2.
3.

---

## ✅ VALIDATION FINALE

**Date des tests** : _______________
**Testeur** : Hassan
**Score global** : ___ / 24 (___ %)

**Sprint 1 validé** : ☐ OUI  ☐ NON (si score ≥ 80%)

**Prêt pour production** : ☐ OUI  ☐ NON
