#!/bin/bash
# Script de configuration complète des fournisseurs

echo "🔧 CONFIGURATION AUTOMATIQUE DES FOURNISSEURS"
echo "=============================================="
echo ""

# Analyser et ajouter les fournisseurs
echo "📊 Étape 1/3 : Analyse des transactions..."
npx ts-node auto-add-top-suppliers.ts

echo ""
echo "📦 Étape 2/3 : Compilation du code..."
npm run build

echo ""
echo "🔄 Étape 3/3 : Redémarrage du bot..."
pm2 restart billit-bot

echo ""
echo "=============================================="
echo "✅ Configuration terminée !"
echo ""
echo "📋 Fournisseurs configurés :"
npx ts-node list-suppliers.ts | grep "fournisseur(s) configuré(s)"
echo ""
echo "💡 Testez maintenant sur Telegram :"
echo "   'Donne-moi les transactions Foster'"
echo "=============================================="
