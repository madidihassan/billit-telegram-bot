# 🔒 Guide de Sécurité - Billit Telegram Bot

## Vue d'ensemble

Ce document décrit les mesures de sécurité implémentées dans le bot Billit et les bonnes pratiques à suivre.

## ✅ Mesures de sécurité implémentées

### 1. Whitelist de Chat IDs

**Problème résolu**: N'importe qui avec le token du bot pouvait interagir avec lui.

**Solution**:
- Liste blanche configurable via `TELEGRAM_ALLOWED_CHAT_IDS` dans `.env`
- Vérification à chaque message/callback reçu
- Logging automatique des tentatives d'accès non autorisées

**Configuration**:
```bash
# Un seul chat ID
TELEGRAM_ALLOWED_CHAT_IDS=123456789

# Plusieurs chat IDs (séparés par des virgules)
TELEGRAM_ALLOWED_CHAT_IDS=123456789,987654321,555666777
```

**Vérifier votre Chat ID**:
1. Envoyez un message à votre bot
2. Consultez les logs du serveur - le chat ID sera affiché
3. Ajoutez-le à `TELEGRAM_ALLOWED_CHAT_IDS`

### 2. Validation des entrées utilisateur

**Problème résolu**: Aucune validation des inputs, risque d'injection.

**Solution**:
- Validation stricte de toutes les entrées utilisateur
- Longueur maximale configurable (`MAX_INPUT_LENGTH`)
- Détection de patterns suspects (SQL injection, command injection, XSS)
- Sanitisation automatique (suppression de null bytes, trim)

**Exemples**:
```typescript
// Validation automatique dans telegram-bot.ts
const validation = validateUserInput(msg.text, {
  maxLength: config.security.maxInputLength,
  allowEmpty: false,
  fieldName: 'Message',
});

if (!validation.valid) {
  await this.sendMessage(`❌ ${validation.error}`);
  return;
}
```

### 3. Sanitisation des messages d'erreur

**Problème résolu**: Messages d'erreur exposant trop d'informations techniques.

**Solution**:
- Mode `VERBOSE_ERRORS` pour développement/production
- Mapping des erreurs techniques vers messages utilisateur-friendly
- Fonction centralisée `sanitizeError()`

**Configuration**:
```bash
# Production (recommandé)
VERBOSE_ERRORS=false

# Développement (pour debugging)
VERBOSE_ERRORS=true
```

**Exemples de messages**:
| Erreur technique | Message utilisateur (production) |
|------------------|----------------------------------|
| `ECONNREFUSED` | "Erreur de connexion au serveur. Veuillez réessayer dans quelques instants." |
| `401 Unauthorized` | "Erreur d'authentification. Veuillez contacter l'administrateur." |
| `Timeout` | "La requête a pris trop de temps. Veuillez réessayer." |

### 4. Protection des secrets dans les logs

**Problème résolu**: Tokens/API keys visibles dans les logs.

**Solution**:
- Fonction `sanitizeUrl()` masque les tokens dans les URLs
- Fonction `sanitizeObjectForLog()` masque les clés sensibles
- Suppression de l'URL complète lors du téléchargement de fichiers vocaux

**Exemples**:
```typescript
// Avant
console.log(`URL: https://api.telegram.org/file/bot123456:ABC-DEF/voice.ogg`);

// Après (automatique)
console.log(`URL: https://api.telegram.org/file/bot***:***/voice.ogg`);
```

### 5. Logging des activités suspectes

**Fonctionnalités**:
- `logUnauthorizedAccess()`: Enregistre les tentatives d'accès non autorisées
- `logSuspiciousActivity()`: Détecte et log les activités suspectes
- Format de log standardisé avec timestamp et détails

**Exemple de log**:
```
🚨 [SECURITY] Tentative d'accès non autorisé
   Timestamp: 2025-01-15T10:30:45.123Z
   Chat ID: 999888777
   Username: suspicious_user
```

## 🛡️ Modules de sécurité

### `src/utils/security.ts`

Module centralisé pour la sécurité:

| Fonction | Description |
|----------|-------------|
| `sanitizeError()` | Nettoie les messages d'erreur |
| `sanitizeUrl()` | Masque les tokens dans les URLs |
| `sanitizeObjectForLog()` | Masque les clés sensibles dans les objets |
| `containsSuspiciousContent()` | Détecte les patterns malveillants |
| `logUnauthorizedAccess()` | Log les accès non autorisés |
| `logSuspiciousActivity()` | Log les activités suspectes |

### `src/utils/validation.ts`

Module centralisé pour la validation:

| Fonction | Description |
|----------|-------------|
| `validateUserInput()` | Validation générique d'input |
| `validateSupplierName()` | Validation spécifique pour les noms de fournisseurs |
| `validateInvoiceNumber()` | Validation spécifique pour les numéros de facture |
| `validateSearchTerm()` | Validation pour les recherches |
| `validateDate()` | Validation de dates avec parsing |
| `validateCommandArgs()` | Validation des arguments de commande |
| `sanitizeArgs()` | Sanitisation d'un tableau d'arguments |

## 🚀 Bonnes pratiques

### 1. Configuration en production

**Fichier `.env` minimal sécurisé**:
```bash
# APIs
BILLIT_API_KEY=votre_clé_billit_réelle
BILLIT_PARTY_ID=votre_party_id
GROQ_API_KEY=votre_clé_groq_réelle

# Telegram
TELEGRAM_BOT_TOKEN=votre_token_réel
TELEGRAM_CHAT_ID=votre_chat_id_réel
TELEGRAM_ALLOWED_CHAT_IDS=id1,id2,id3

# Sécurité (IMPORTANT!)
VERBOSE_ERRORS=false
MAX_INPUT_LENGTH=500
```

### 2. Permissions des fichiers

```bash
# Le fichier .env ne doit être lisible que par le propriétaire
chmod 600 .env

# Vérifier les permissions
ls -la .env
# Devrait afficher: -rw------- (600)
```

### 3. Rotation des secrets

**Recommandations**:
- Changer les API keys tous les 3-6 mois
- Révoquer immédiatement en cas de fuite suspectée
- Ne JAMAIS commiter `.env` dans Git (déjà dans `.gitignore`)

### 4. Monitoring

**À surveiller**:
```bash
# Suivre les logs en temps réel
pm2 logs billit-bot

# Rechercher les tentatives d'accès non autorisées
pm2 logs billit-bot | grep "SECURITY"

# Vérifier les erreurs
pm2 logs billit-bot --err
```

## 🔍 Détection d'incidents

### Patterns suspects détectés automatiquement

**Injection SQL**:
- `DROP TABLE`, `DELETE FROM`, `UNION SELECT`
- `; DROP`, `' OR '1'='1`

**Injection de commande**:
- `; rm -rf`, `| bash`, `$(command)`
- Backticks, `&&`, `||`

**XSS** (bien que Telegram échappe le HTML):
- `<script>`, `javascript:`, `onerror=`

### En cas d'incident

1. **Vérifier les logs**:
   ```bash
   grep "SECURITY" logs/billit-bot.log
   ```

2. **Identifier l'attaquant**:
   - Chat ID
   - Username
   - Timestamp

3. **Actions immédiates**:
   - Retirer le Chat ID de la whitelist
   - Révoquer et regénérer le bot token si nécessaire
   - Vérifier les données pour corruption

4. **Investigation**:
   - Analyser les commandes exécutées
   - Vérifier si des données ont été exfiltrées

## ⚠️ Limitations connues

1. **Pas de rate limiting**: Un utilisateur autorisé peut spammer le bot
   - **Mitigation**: Implémenter un rate limiter (prochaine version)

2. **Pas de chiffrement au repos**: Les données en cache ne sont pas chiffrées
   - **Mitigation**: Données stockées uniquement en mémoire, volatiles

3. **Pas d'authentification 2FA**: Seul le Chat ID sert d'authentification
   - **Mitigation**: Telegram gère l'authentification de l'utilisateur

4. **Logs en clair**: Les logs ne sont pas chiffrés
   - **Mitigation**: Protéger l'accès au serveur, chmod 600

## 📋 Checklist de déploiement sécurisé

Avant de déployer en production:

- [ ] `VERBOSE_ERRORS=false` dans `.env`
- [ ] `TELEGRAM_ALLOWED_CHAT_IDS` configuré correctement
- [ ] Toutes les API keys sont valides et sécurisées
- [ ] Fichier `.env` avec permissions 600
- [ ] `.env` dans `.gitignore` (déjà fait)
- [ ] Serveur à jour avec patches de sécurité
- [ ] Firewall configuré (ports 22, 443 uniquement)
- [ ] Monitoring des logs activé
- [ ] Sauvegarde régulière de la configuration

## 🆘 Support

En cas de problème de sécurité:

1. **Ne PAS publier** les détails sur GitHub/public
2. Contacter l'administrateur système
3. Documenter l'incident avec captures d'écran
4. Préserver les logs pour analyse

---

**Dernière mise à jour**: 23 décembre 2025
**Version**: 1.0.0
