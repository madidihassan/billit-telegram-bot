# 🎯 NIVEAU 2 - Intelligence Contextuelle

**Date:** 16 janvier 2026
**Objectif:** Rendre le bot intelligent et proactif avec mémoire, cache et suggestions
**Prérequis:** NIVEAU 1 validé ✅

---

## 📊 État actuel analysé

### Système de conversation existant

**Fichier:** `src/ai-agent-service-v2.ts`

```typescript
// Structure actuelle
private conversationHistory: Array<{ role: string; content: string }> = [];
private readonly MAX_HISTORY = 20; // 10 échanges
```

**Fonctionnalités actuelles:**
- ✅ Sauvegarde dans `data/conversation-state.json`
- ✅ Expiration après 24h
- ✅ Limite de 20 messages

**Limitations identifiées:**
- ❌ **Un seul historique pour TOUS les utilisateurs** (problème multi-user!)
- ❌ Pas de contexte intelligent (stockage brut)
- ❌ Pas de cache pour réponses rapides
- ❌ Pas de suggestions proactives
- ❌ Pas de résumé du contexte (consomme beaucoup de tokens)

---

## 🎯 Fonctionnalités NIVEAU 2

### 1️⃣ Mémoire conversationnelle intelligente

#### Objectifs
- Historique **par utilisateur** (multi-user)
- Comprendre les **références contextuelles** ("celles de décembre", "montre-moi encore")
- **Résumé automatique** du contexte pour réduire les tokens

#### Exemples d'utilisation
```
User: "montre moi les factures"
Bot: [affiche les factures de janvier]

User: "celles de décembre"  ← Référence contextuelle
Bot: [comprend qu'il faut afficher les factures de DÉCEMBRE]
```

#### Implémentation technique

**Nouvelle structure:**
```typescript
interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  metadata?: {
    userId?: string;
    intent?: string;        // "get_invoices", "analyze_expenses", etc.
    entities?: string[];    // ["décembre", "factures", "impayées"]
    toolCalls?: string[];   // Outils utilisés
  };
}

interface UserConversationState {
  userId: string;
  messages: ConversationMessage[];
  context: {
    lastIntent?: string;
    lastEntities?: string[];
    lastResults?: any;  // Résultats de la dernière requête
  };
  summary?: string;  // Résumé du contexte (généré par IA)
  lastActivity: number;
}
```

**Stockage:**
- `data/conversations/user-{userId}.json` (un fichier par utilisateur)
- `data/conversations/summaries.json` (résumés partagés)

**Algorithme de résumé:**
```typescript
// Quand l'historique > 15 messages
async summarizeContext(messages: ConversationMessage[]): Promise<string> {
  const prompt = `Résume cette conversation en 2-3 phrases clés:
  ${messages.map(m => `${m.role}: ${m.content}`).join('\n')}

  Résumé concis:`;

  // Appel à l'IA pour générer le résumé
  const summary = await this.groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 150
  });

  return summary.choices[0].message.content;
}
```

**Détection de références:**
```typescript
detectContextReferences(question: string): {
  hasReference: boolean;
  referenceType: 'temporal' | 'pronoun' | 'implicit';
  replacements: Record<string, string>;
} {
  const references = {
    // Références temporelles
    'celles de': 'temporal',
    'ceux de': 'temporal',
    'pour ce mois': 'temporal',

    // Références pronominales
    'les mêmes': 'pronoun',
    'encore': 'pronoun',
    'aussi': 'pronoun',

    // Références implicites
    'et': 'implicit',
    'puis': 'implicit'
  };

  // Analyser la question et remplacer les références
  // Ex: "celles de décembre" + context.lastIntent="get_invoices"
  //     → "les factures de décembre"
}
```

---

### 2️⃣ Cache sémantique

#### Objectifs
- Réponses **<1 seconde** pour questions déjà posées
- Détection de questions **équivalentes** ("factures impayées" = "factures non payées")
- Cache intelligent avec **TTL** (Time To Live)

#### Exemples d'utilisation
```
User: "factures impayées"
Bot: [30s de traitement] → Mise en cache

User (2 min après): "factures non payées"  ← Question équivalente
Bot: [<1s] → Réponse depuis le cache ⚡
```

#### Implémentation technique

**Structure du cache:**
```typescript
interface CacheEntry {
  questionHash: string;      // Hash de la question normalisée
  normalizedQuestion: string; // Question normalisée
  response: string;           // Réponse complète
  metadata: {
    toolsUsed: string[];
    dataSnapshot: any;        // Snapshot des données utilisées
    userId: string;
  };
  createdAt: number;
  expiresAt: number;
  hits: number;               // Nombre d'utilisations
}

class SemanticCache {
  private cache: Map<string, CacheEntry> = new Map();
  private readonly TTL = 5 * 60 * 1000; // 5 minutes

  async get(question: string, userId: string): Promise<string | null> {
    const normalized = this.normalizeQuestion(question);
    const hash = this.hashQuestion(normalized);

    const entry = this.cache.get(hash);
    if (!entry) return null;

    // Vérifier expiration
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(hash);
      return null;
    }

    // Vérifier que les données n'ont pas changé
    if (await this.hasDataChanged(entry.metadata.dataSnapshot)) {
      this.cache.delete(hash);
      return null;
    }

    entry.hits++;
    console.log(`⚡ Cache hit: "${normalized}" (${entry.hits} fois)`);
    return entry.response;
  }

  set(question: string, response: string, metadata: any): void {
    const normalized = this.normalizeQuestion(question);
    const hash = this.hashQuestion(normalized);

    this.cache.set(hash, {
      questionHash: hash,
      normalizedQuestion: normalized,
      response,
      metadata,
      createdAt: Date.now(),
      expiresAt: Date.now() + this.TTL,
      hits: 0
    });

    console.log(`💾 Mise en cache: "${normalized}"`);
  }

  private normalizeQuestion(question: string): string {
    return question
      .toLowerCase()
      .trim()
      // Normaliser les synonymes
      .replace(/non payées?/g, 'impayées')
      .replace(/pas encore payées?/g, 'impayées')
      .replace(/en retard/g, 'overdue')
      .replace(/montrer|afficher|voir/g, 'liste')
      // Retirer les mots de liaison
      .replace(/\b(moi|les?|des?|du|s'il vous plaît|merci)\b/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private hashQuestion(normalized: string): string {
    // Hash simple pour l'instant (crypto-js pour production)
    return Buffer.from(normalized).toString('base64');
  }

  private async hasDataChanged(snapshot: any): Promise<boolean> {
    // Vérifier si les données ont changé depuis le cache
    // Ex: nombre de factures, montant total, etc.
    return false; // TODO: Implémenter
  }

  cleanup(): void {
    // Nettoyer les entrées expirées
    const now = Date.now();
    for (const [hash, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(hash);
      }
    }
  }
}
```

**Stockage persistant:**
- `data/cache/semantic-cache.json` (optionnel, pour persister entre redémarrages)

**Métriques de performance:**
```typescript
interface CacheMetrics {
  totalRequests: number;
  cacheHits: number;
  cacheMisses: number;
  hitRate: number;         // cacheHits / totalRequests
  avgResponseTime: number; // Temps moyen de réponse
  savedTime: number;       // Temps économisé grâce au cache
}
```

---

### 3️⃣ Suggestions proactives

#### Objectifs
- **Rappels automatiques** pour factures en retard
- **Alertes intelligentes** basées sur patterns
- **Suggestions contextuelles** ("Tu veux aussi voir X?")

#### Exemples d'utilisation
```
[Lundi matin, 9h00]
Bot: "👋 Bonjour! Tu as 3 factures en retard (1 248,34€). Veux-tu les voir?"

User: "factures de Foster"
Bot: [affiche les factures]
     💡 Suggestion: "Foster représente 45% de tes dépenses ce mois.
                     Veux-tu voir l'évolution sur 3 mois?"
```

#### Implémentation technique

**Service de suggestions:**
```typescript
class ProactiveSuggestionsService {

  async generateSuggestions(context: {
    userId: string;
    lastQuestion?: string;
    lastResults?: any;
    conversationHistory: ConversationMessage[];
  }): Promise<string[]> {
    const suggestions: string[] = [];

    // 1. Suggestions basées sur les résultats
    if (context.lastResults?.type === 'supplier_invoices') {
      const supplier = context.lastResults.supplier;
      const percentage = context.lastResults.percentageOfTotal;

      if (percentage > 30) {
        suggestions.push(
          `💡 ${supplier} représente ${percentage}% de tes dépenses. ` +
          `Veux-tu voir l'évolution sur 3 mois?`
        );
      }
    }

    // 2. Suggestions basées sur patterns
    const hasAskedInvoices = context.conversationHistory
      .filter(m => m.metadata?.intent === 'get_invoices')
      .length > 2;

    if (hasAskedInvoices) {
      suggestions.push(
        `💡 Tu demandes souvent les factures. Veux-tu un rapport hebdomadaire?`
      );
    }

    // 3. Suggestions basées sur l'heure
    const hour = new Date().getHours();
    if (hour === 9 && this.isMonday()) {
      const overdueCount = await this.getOverdueInvoicesCount();
      if (overdueCount > 0) {
        suggestions.push(
          `👋 Bonjour! Tu as ${overdueCount} facture(s) en retard. Veux-tu les voir?`
        );
      }
    }

    return suggestions;
  }

  private isMonday(): boolean {
    return new Date().getDay() === 1;
  }

  private async getOverdueInvoicesCount(): Promise<number> {
    // Logique de vérification des factures en retard
    return 0; // TODO
  }
}
```

**Rappels automatiques:**
```typescript
class AutomaticRemindersService {
  private intervalId: NodeJS.Timeout | null = null;

  start(): void {
    // Vérifier toutes les heures
    this.intervalId = setInterval(async () => {
      await this.checkAndSendReminders();
    }, 60 * 60 * 1000); // 1 heure

    console.log('⏰ Service de rappels automatiques démarré');
  }

  private async checkAndSendReminders(): Promise<void> {
    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay();

    // Lundi 9h : Factures en retard
    if (day === 1 && hour === 9) {
      await this.sendOverdueInvoicesReminder();
    }

    // Vendredi 17h : Résumé de la semaine
    if (day === 5 && hour === 17) {
      await this.sendWeeklySummary();
    }
  }

  private async sendOverdueInvoicesReminder(): Promise<void> {
    const overdueInvoices = await this.billitClient.getOverdueInvoices();
    if (overdueInvoices.length === 0) return;

    const totalAmount = overdueInvoices.reduce((sum, inv) => sum + inv.total_amount, 0);

    const message =
      `⚠️ Rappel: Tu as ${overdueInvoices.length} facture(s) en retard\n` +
      `💰 Montant total: ${totalAmount.toFixed(2)}€\n\n` +
      `Veux-tu les voir? Réponds "oui" ou tape /overdue`;

    await this.telegramClient.sendMessage(message);
  }
}
```

---

## 📋 Plan d'implémentation

### Phase 1: Mémoire conversationnelle (Priorité 1)

**Fichiers à créer:**
- `src/services/conversation-manager.ts` - Gestionnaire de conversations par utilisateur
- `src/services/context-detector.ts` - Détection de références contextuelles
- `src/utils/conversation-summarizer.ts` - Résumé automatique du contexte

**Fichiers à modifier:**
- `src/ai-agent-service-v2.ts` - Intégrer le nouveau système de mémoire
- `src/telegram-bot.ts` - Passer le userId au service IA

**Tests à effectuer:**
```
1. "montre moi les factures" → [affiche janvier]
2. "celles de décembre" → [affiche décembre] ✓ Contexte compris
3. "et de novembre?" → [affiche novembre] ✓ Référence comprise
```

---

### Phase 2: Cache sémantique (Priorité 2)

**Fichiers à créer:**
- `src/services/semantic-cache.ts` - Cache intelligent
- `src/utils/question-normalizer.ts` - Normalisation de questions

**Fichiers à modifier:**
- `src/ai-agent-service-v2.ts` - Vérifier le cache avant traitement

**Tests à effectuer:**
```
1. "factures impayées" → [30s] Résultat mis en cache
2. "factures non payées" → [<1s] ⚡ Depuis le cache
3. "factures pas encore payées" → [<1s] ⚡ Depuis le cache
```

**Métriques attendues:**
- Hit rate: >60% après 1 semaine d'utilisation
- Temps de réponse cache hit: <500ms
- Temps économisé: ~25s par requête cachée

---

### Phase 3: Suggestions proactives (Priorité 3)

**Fichiers à créer:**
- `src/services/proactive-suggestions.ts` - Génération de suggestions
- `src/services/automatic-reminders.ts` - Rappels automatiques
- `src/utils/pattern-analyzer.ts` - Analyse des patterns d'utilisation

**Fichiers à modifier:**
- `src/telegram-bot.ts` - Afficher les suggestions après les réponses
- `src/index-bot.ts` - Démarrer le service de rappels

**Tests à effectuer:**
```
1. Demander factures Foster → Suggestion: "Évolution sur 3 mois?"
2. Lundi 9h → Rappel automatique des factures en retard
3. Après 3 questions similaires → "Veux-tu un rapport hebdomadaire?"
```

---

## 🎯 Critères de succès NIVEAU 2

### Mémoire conversationnelle
- ✅ Historique séparé par utilisateur
- ✅ Comprend "celles de décembre" après "montre les factures"
- ✅ Résumé automatique après 15 messages
- ✅ Pas de confusion entre utilisateurs

### Cache sémantique
- ✅ Hit rate >50% après 1 semaine
- ✅ Temps de réponse <1s pour cache hits
- ✅ Détection correcte de questions synonymes

### Suggestions proactives
- ✅ Au moins 2 suggestions pertinentes par jour
- ✅ Rappels automatiques fonctionnels
- ✅ Aucune suggestion hors contexte

---

## 📊 Estimation

**Temps de développement:**
- Phase 1 (Mémoire): ~3-4h
- Phase 2 (Cache): ~2-3h
- Phase 3 (Suggestions): ~2-3h
- Tests et ajustements: ~1-2h

**Total: 8-12h de développement**

---

## 🚀 Prochaines étapes

1. ✅ Valider le plan avec l'utilisateur
2. ⏳ Implémenter Phase 1 (Mémoire conversationnelle)
3. ⏳ Implémenter Phase 2 (Cache sémantique)
4. ⏳ Implémenter Phase 3 (Suggestions proactives)
5. ⏳ Tests complets NIVEAU 2
6. ⏳ Documentation utilisateur

---

**Date de création:** 16 janvier 2026
**Dernière mise à jour:** 16 janvier 2026
**Statut:** 📝 Planification terminée - En attente validation
