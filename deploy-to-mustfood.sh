#!/bin/bash
# Script pour déployer les modifications sur le bot Mustfood

set -e

echo "🚀 Déploiement vers Mustfood..."
echo ""

# Sauvegarder la branche actuelle
CURRENT_BRANCH=$(git branch --show-current)
echo "📌 Branche actuelle: $CURRENT_BRANCH"

# Compiler le code
echo "🔨 Compilation du code..."
npm run build

# Copier les fichiers source vers mustfood (en préservant .env)
echo "📦 Copie des fichiers source vers mustfood..."
rsync -av --exclude='.env' \
    --exclude='data/' \
    --exclude='dist/' \
    --exclude='node_modules/' \
    --exclude='.git/' \
    --exclude='*.log' \
    src/ /home/ubuntu/Billit/bot_mustfood/src/

# Copier les fichiers de config nécessaires
echo "📋 Copie des fichiers de configuration..."
cp package.json package-lock.json tsconfig.json /home/ubuntu/Billit/bot_mustfood/
cp .env.example /home/ubuntu/Billit/bot_mustfood/

# Se déplacer dans mustfood
cd /home/ubuntu/Billit/bot_mustfood

# Installer les dépendances si nécessaire
if [ ! -d "node_modules" ]; then
    echo "📦 Installation des dépendances..."
    npm install
fi

# Compiler dans mustfood
echo "🔨 Compilation dans mustfood..."
npm run build

echo ""
echo "✅ Déploiement vers Mustfood terminé !"
echo "⚠️  N'oubliez pas de vérifier le fichier .env dans mustfood"
echo ""
echo "🔄 Pour redémarrer le bot mustfood, utilisez:"
echo "   cd /home/ubuntu/Billit/bot_mustfood && ./start-bot-wrapper.sh"
echo ""

# Retourner à la branche d'origine
cd /home/ubuntu/Billit/bot_tonton202
