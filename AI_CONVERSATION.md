# 🤖 Système IA Conversationnelle - Billit Bot

## 📋 Vue d'ensemble

Le nouveau système IA conversationnelle permet de poser des questions en langage naturel à votre bot Telegram, sans avoir à utiliser de commandes spécifiques ou à modifier le code pour chaque nouvelle demande.

## 🎯 Ce qui a changé

### Avant (Système avec commandes codées)
```bash
# Vous deviez utiliser des commandes précises :
/unpaid
/recettes_mois
/supplier Foster
/transactions_periode 2025-01-01 2025-12-01
```

### Maintenant (Système IA conversationnel)
```bash
# Vous pouvez simplement poser des questions :
Combien ai-je de factures impayées ?
Quelles sont mes recettes ce mois-ci ?
Montre-moi les factures de Foster
Compare mes recettes et dépenses
```

## ✨ Fonctionnalités

### 1. **Questions en langage naturel**
- Posez vos questions comme si vous parliez à un humain
- L'IA comprend le contexte et formule une réponse personnalisée
- Plus besoin de mémoriser les commandes

### 2. **Réponses dynamiques**
- L'IA génère des réponses naturelles basées sur vos données
- Chaque réponse est contextualisée et unique
- Utilisation d'émojis pour une meilleure lisibilité

### 3. **Système hybride**
- Les commandes classiques fonctionnent toujours (`/unpaid`, `/paid`, etc.)
- Les boutons et menus sont toujours disponibles
- Les messages vocaux avec reconnaissance vocale fonctionnent toujours

## 🚀 Utilisation

### Exemples de questions possibles

#### Factures
- "Combien ai-je de factures impayées ?"
- "Quel est le total de mes factures en retard ?"
- "Montre-moi les factures de Foster"
- "Est-ce que j'ai des factures en retard ?"

#### Transactions & Finances
- "Quelles sont mes recettes ce mois-ci ?"
- "Combien j'ai dépensé ce mois ?"
- "Compare mes recettes et dépenses"
- "Quel est ma balance du mois ?"
- "Montre-moi les dépenses du mois de novembre"

#### Fournisseurs & Employés
- "Liste tous mes fournisseurs"
- "Quels sont mes employés ?"
- "Montre-moi les transactions de Foster"

#### Statistiques
- "Donne-moi un résumé de mon mois"
- "Quelles sont mes statistiques ?"
- "Analyse mes finances du mois"

### Ce que le bot comprend

Le bot détecte automatiquement si votre message est :
- **Une question** → Traité par l'IA conversationnelle
- **Un message normal** → Affiche le menu principal
- **Une commande** → Exécute la commande (ex: `/unpaid`)

Mots-clés détectés comme questions :
- Combien, quel, quelle, combien
- Montre, voir, liste, lister
- Calcule, analyser, comparer, chercher
- Et tous les mots interrogatifs (?)

## 🔧 Comment ça fonctionne

### Architecture

```
Votre question (texte)
       ↓
   [Détection de question]
       ↓
   [AIConversationService]
       ↓
   1. Analyser la question (Groq Llama)
       ↓
   2. Identifier les commandes nécessaires
       ↓
   3. Exécuter les commandes (API Billit)
       ↓
   4. Générer une réponse naturelle (Groq Llama)
       ↓
   Réponse conversationnelle
```

### Fichiers modifiés

1. **`src/ai-conversation-service.ts`** (NOUVEAU)
   - Service principal de conversation IA
   - Analyse les questions avec Groq Llama
   - Génère des réponses naturelles

2. **`src/telegram-bot.ts`** (MODIFIÉ)
   - Ajout de la détection de questions
   - Intégration du service IA
   - Gestion hybride (commandes + IA)

### Technologies utilisées

- **Groq Llama 3.1 8B** : Modèle IA pour la compréhension et la génération de texte
- **API Billit** : Récupération des données de factures et transactions
- **API Telegram** : Interface utilisateur

## 📊 Comparaison des systèmes

| Caractéristique | Ancien système | Nouveau système IA |
|----------------|---------------|-------------------|
| **Commandes** | `/unpaid`, `/paid`, etc. | Questions naturelles |
| **Flexibilité** | Limité aux commandes codées | Questions illimitées |
| **Réponses** | Templates statiques | Réponses dynamiques |
| **Maintenance** | Ajouter du code pour chaque demande | L'IA comprend automatiquement |
| **Évolutivé** | Limitée | Infinie |

## 🎓 Bonnes pratiques

### 1. **Soyez précis dans vos questions**
- ✅ "Combien de factures impayées ai-je ?"
- ✅ "Quel est le total des recettes de novembre ?"
- ❌ "Combien ?" (trop vague)

### 2. **Utilisez des phrases courtes**
- ✅ "Montre-moi les factures de Foster"
- ❌ "Je voudrais que tu me montres toutes les factures que j'ai reçues du fournisseur Foster depuis le début de l'année" (trop long)

### 3. **Mots-clés utiles**
- **Combien/Quel** : Pour les quantités et totaux
- **Montre/Voir** : Pour afficher des listes
- **Compare** : Pour comparer deux données
- **Liste** : Pour afficher des énumérations

## 🐛 Dépannage

### Le bot ne comprend pas ma question

**Solutions :**
1. Reformulez plus simplement
2. Utilisez les commandes classiques (`/help` pour voir les commandes)
3. Vérifiez que votre clé API Groq est configurée

### Je reçois une erreur

**Vérifiez :**
1. Que votre fichier `.env` contient `GROQ_API_KEY`
2. Que vous avez compilé le code (`npm run build`)
3. Que le bot est bien démarré (`npm run start:bot`)

### Le bot est lent à répondre

**Normal :** Le système IA doit :
1. Analyser votre question
2. Récupérer les données depuis l'API Billit
3. Générer une réponse naturelle

Temps moyen : 3-8 secondes

## 🔄 Mise à jour

### Démarrer le bot avec le nouveau système

```bash
# Compiler le code
npm run build

# Démarrer le bot
npm run start:bot
```

### Logs

Le bot affiche des informations de débogage :
```
🔧 Configuration du bot Telegram...
   Chat ID: 123456789
   Reconnaissance vocale: ✅ Activée
   Compréhension IA (vocaux): ✅ Activée
   Conversation IA: ✅ Activée
```

## 📈 Exemples d'utilisation réels

### Exemple 1 : Suivi des factures
```
Vous: Combien ai-je de factures impayées ?
Bot: 🤖 Je réfléchis...

Bot: D'après mes données, vous avez actuellement 12 factures impayées
pour un total de 4 523,50 €.

Voici les détails :
- 5 factures du mois en cours
- 7 factures du mois dernier
```

### Exemple 2 : Analyse financière
```
Vous: Compare mes recettes et dépenses ce mois
Bot: 🤖 Je réfléchis...

Bot: Voici l'analyse de vos finances ce mois :

💵 RECETTES: 15 432,00 € (23 transactions)
💸 DÉPENSES: 12 845,00 € (45 transactions)

✅ BALANCE POSITIVE: +2 587,00 €

Vous êtes bénéficiaire ce mois !
```

## 🎯 Avantages principaux

1. **Plus intuitif** : Parlez naturellement, pas besoin de apprendre des commandes
2. **Plus flexible** : Posez n'importe quelle question
3. **Plus intelligent** : L'IA comprend le contexte
4. **Zéro maintenance** : Pas besoin de coder pour ajouter des fonctionnalités

## 🚧 Limitations actuelles

- Questions en français uniquement
- Réponses basées sur les données disponibles dans Billit
- Nécessite une connexion internet pour l'IA

## 📚 Ressources

- [Commandes disponibles](COMMANDS.md)
- [Configuration](QUICK_START.md)
- [Reconnaissance vocale](VOICE_SETUP.md)

---

## 🔧 Corrections Techniques - Décembre 2024

### Problème : Transactions Pluxee non détectées

**Symptôme initial** : Le bot répondait "Je ne trouve pas de fournisseur nommé Pluxee" malgré la présence de 38 transactions (1438.14 €) dans Billit.

### Solutions appliquées

#### 1. **Alias Pluxee corrigé** (`supplier-aliases.json:574-587`)

**Problème** : Guillemets littéraux dans les patterns JSON
```json
// AVANT (cassé)
"pluxee": {
  "aliases": ["\"pluxee", "belgium\"", ...],
  "patterns": ["\"pluxee", "belgium\"", ...]
}

// APRÈS (corrigé)
"pluxee": {
  "aliases": ["pluxee belgium", "pluxi", "pluxee"],
  "patterns": ["pluxeebelgium", "pluxee", "pluxi"]
}
```

**Impact** : Les alias "pluxi" et "pluxee" sont maintenant reconnus correctement.

---

#### 2. **NameCounterParty ajouté à la description** (`src/bank-client.ts:300-329`)

**Problème** : Le champ `NameCounterParty` (contenant "N.V. Pluxee Belgium S.A.") n'était pas utilisé dans la description des transactions.

**Ancien code** :
```typescript
description: tx.Note || tx.Description || tx.Communication || ''
```

**Nouveau code** :
```typescript
let description = '';
if (tx.NameCounterParty) {
  description = tx.NameCounterParty;
}
const additionalInfo = tx.Note || tx.Description || tx.Communication || '';
if (additionalInfo) {
  description = description ? `${description} - ${additionalInfo}` : additionalInfo;
}
```

**Résultat** :
- Avant : `"001 uid 01722626 0000003390..."`
- Après : `"N.V. Pluxee Belgium S.A. - 001 uid 01722626 0000003390..."`

**Impact** : Les transactions sont désormais matchées car le nom du fournisseur apparaît dans la description.

---

#### 3. **Type BillitFinancialTransaction mis à jour** (`src/types/billit-api.ts:127-160`)

Ajout des champs de contrepartie :
```typescript
export interface BillitFinancialTransaction {
  // ... champs existants
  NameCounterParty?: string;
  IBANCounterParty?: string;
  BICCounterParty?: string;
}
```

---

#### 4. **Clarification AI : "versement fait PAR"** (`src/ai-agent-service-v2.ts:169-195`)

**Problème** : Ambiguïté sur "versement fait PAR Pluxee" (argent reçu vs payé)

**Descriptions améliorées** :
```typescript
// get_supplier_payments
description: 'Pour les paiements que VOUS avez faits VERS un fournisseur (dépenses/débits)...'

// get_supplier_received_payments
description: 'Pour les versements/recettes REÇUS d\'un fournisseur (entrées d\'argent/crédits).
              "Versement fait PAR X" = argent reçu DE X...'
```

**Impact** : L'AI choisit maintenant la bonne fonction selon le contexte.

---

#### 5. **Règle "ZERO RÉSULTAT" limitée** (`src/ai-agent-service-v2.ts:946`)

**Problème** : La règle s'appliquait à toutes les requêtes, même les périodes sans transactions.

**Avant** :
```
9. ZERO RÉSULTAT = DEMANDE ORTHOGRAPHE
   Si résultat = 0, toujours demander l'orthographe
```

**Après** :
```
9. ZERO RÉSULTAT FOURNISSEUR/EMPLOYÉ = DEMANDE ORTHOGRAPHE
   UNIQUEMENT pour get_supplier_payments, get_supplier_received_payments, get_employee_salaries.
   Pour les autres fonctions (recettes_mois, get_period_transactions),
   réponds normalement même si 0 €.
```

**Impact** : Plus de faux "je ne trouve pas" pour les périodes vides.

---

#### 6. **Date actuelle dans le contexte AI** (`src/ai-agent-service-v2.ts:932-955`)

**Problème** : L'AI calculait les mauvaises dates (2023 au lieu de 2025, juillet-septembre au lieu des 3 derniers mois).

**Ajout au system prompt** :
```typescript
const now = new Date();
const currentDate = now.toLocaleDateString('fr-BE', {
  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
});

// Dans le prompt
`📅 DATE ACTUELLE: ${currentDate}
 📅 MOIS EN COURS: ${currentMonth}

 IMPORTANT - CALCUL DES DATES:
 - Aujourd'hui = ${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear()}
 - Année en cours = ${now.getFullYear()}
 - "Les 3 derniers mois" → calcule à partir d'aujourd'hui`
```

**Impact** : Les périodes sont calculées correctement.

---

### Résultats

#### Tests de validation

```bash
# Test 1: Recherche Pluxee en décembre
✓ 38 transactions Pluxee trouvées
✓ Total crédits: 1438.14 €
✓ Type: Credit (versements reçus)

# Test 2: Octobre 2025
✓ 328 transactions trouvées
✓ Recettes: 121 039,58 €
✓ Dépenses: 132 769,54 €

# Test 3: Alias fonctionnels
✓ "pluxi" → matchesSupplier() → true
✓ "pluxee" → matchesSupplier() → true
✓ "pluxee belgium" → matchesSupplier() → true
```

#### Exemples fonctionnels

| Requête utilisateur | Résultat |
|---------------------|----------|
| "Versements Pluxee ce mois" | ✅ 38 transactions, 1438.14 € |
| "Dernier versement de Pluxi" | ✅ 44.69 € le 22/12/2025 |
| "Recettes d'octobre" | ✅ 121 039,58 € |
| "Balance des 3 derniers mois" | ✅ Calcul oct-nov-déc 2025 |
| "Liste paiements du plus grand au plus petit" | ✅ Foster 5903.70 € en premier |

---

### Fichiers modifiés

1. `supplier-aliases.json` - Correction alias Pluxee
2. `src/bank-client.ts` - Ajout NameCounterParty
3. `src/types/billit-api.ts` - Types NameCounterParty
4. `src/ai-agent-service-v2.ts` - Clarifications AI + date actuelle
5. Tests créés : `test-pluxee-transactions.ts`, `test-october-transactions.ts`, etc.

---

### Points clés à retenir

1. **Toujours inclure NameCounterParty** dans les descriptions de transactions bancaires
2. **Les alias doivent être propres** sans guillemets ou caractères spéciaux dans le JSON
3. **L'AI a besoin du contexte temporel** (date actuelle) pour calculer les périodes
4. **Les règles "zéro résultat"** doivent être spécifiques au type de recherche
5. **Distinguer clairement** les crédits (reçus) vs débits (payés) dans les prompts AI

---

**Dernière mise à jour : 24 décembre 2025**
**Créé avec ❤️ par Claude Code**
