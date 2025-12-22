# 🎤 Configuration de la Reconnaissance Vocale

Le bot Billit supporte maintenant la reconnaissance vocale via **Groq Whisper** (gratuit et rapide) !

## 📋 Prérequis

1. Un compte Groq (gratuit)
2. Une clé API Groq

## 🚀 Installation

### Étape 1 : Obtenir une clé API Groq

1. Allez sur **https://console.groq.com**
2. Créez un compte (gratuit, pas de carte bancaire requise)
3. Connectez-vous
4. Allez dans **"API Keys"** dans le menu
5. Cliquez sur **"Create API Key"**
6. Copiez la clé générée

### Étape 2 : Configurer le bot

Ajoutez la clé API dans votre fichier `.env` :

```bash
GROQ_API_KEY=gsk_votre_cle_api_ici
```

### Étape 3 : Redémarrer le bot

```bash
npm run build
pm2 restart billit-bot
```

## 🎯 Utilisation

### Envoyer un message vocal

1. Ouvrez Telegram
2. Appuyez sur le bouton microphone 🎤
3. Enregistrez votre commande vocale
4. Envoyez le message

### Commandes vocales supportées

| Commande vocale | Action |
|----------------|--------|
| "Factures impayées" | Affiche toutes les factures impayées |
| "Factures en retard" | Affiche les factures en retard |
| "Statistiques" | Affiche les stats du mois |
| "Dernière facture de Foster" | Dernière facture d'un fournisseur |
| "Recherche Foster" | Recherche des factures |
| "Fournisseur Foster" | Toutes les factures d'un fournisseur |
| "Aide" | Affiche l'aide |

### Exemples

🎤 **"Montre-moi les factures impayées"**
→ Le bot affiche toutes les factures non payées

🎤 **"Dernière facture de Foster"**
→ Le bot affiche la dernière facture de Foster Fast Food

🎤 **"Recherche CIERS"**
→ Le bot recherche toutes les factures contenant "CIERS"

## 💰 Coût

**GRATUIT !** Groq offre l'API Whisper gratuitement avec des limites généreuses :
- Transcription illimitée pour un usage raisonnable
- Pas de carte bancaire requise
- Ultra rapide (plus rapide qu'OpenAI)

## 🔧 Dépannage

### Le bot ne répond pas aux messages vocaux

1. Vérifiez que `GROQ_API_KEY` est bien dans votre `.env`
2. Redémarrez le bot : `pm2 restart billit-bot`
3. Vérifiez les logs : `pm2 logs billit-bot`

### Erreur "La reconnaissance vocale n'est pas configurée"

→ Ajoutez `GROQ_API_KEY` dans votre fichier `.env`

### Erreur de transcription

→ Vérifiez que votre clé API Groq est valide sur https://console.groq.com

## 📝 Notes

- Le bot supporte le français automatiquement
- Les fichiers audio sont temporaires et supprimés après transcription
- La transcription prend généralement 1-2 secondes
- Format supporté : tous les formats audio Telegram (OGG, MP3, etc.)

## 🎉 C'est tout !

Vous pouvez maintenant parler à votre bot au lieu de taper ! 🚀
