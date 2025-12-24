#!/bin/bash
# Script principal pour déployer les modifications sur toutes les instances

set -e

echo "🚀 Déploiement multi-instances Billit Bot"
echo "=========================================="
echo ""

# Vérifier qu'on est sur la bonne branche
CURRENT_BRANCH=$(git branch --show-current)
echo "📌 Branche actuelle: $CURRENT_BRANCH"

if [ "$CURRENT_BRANCH" = "main" ]; then
    TARGET_BOT="tonton202"
elif [ "$CURRENT_BRANCH" = "mustfood" ]; then
    TARGET_BOT="mustfood"
else
    echo "⚠️  Branche non reconnue: $CURRENT_BRANCH"
    echo "   Les branches supportées sont: main, mustfood"
    read -p "Continuer quand même ? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
    TARGET_BOT="$CURRENT_BRANCH"
fi

echo ""
echo "🎯 Bot cible: $TARGET_BOT"
echo ""

# 1. Commiter les modifications si nécessaire
if ! git diff-index --quiet HEAD --; then
    echo "📝 Des modifications non commitées détectées"
    read -p "Voulez-vous committer maintenant ? (y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        read -p "Message de commit: " commit_msg
        git add .
        git commit -m "$commit_msg"
        echo "✅ Modifications commitées"
    fi
fi

# 2. Compiler le code
echo ""
echo "🔨 Compilation du code..."
npm run build
echo "✅ Code compilé"

# 3. Copier vers l'instance de développement
if [ "$TARGET_BOT" = "tonton202" ]; then
    DEV_PATH="/home/ubuntu/Billit/tonton202"
elif [ "$TARGET_BOT" = "mustfood" ]; then
    DEV_PATH="/home/ubuntu/Billit/mustfood"
fi

if [ -d "$DEV_PATH" ] && [ "$DEV_PATH" != "$(pwd)" ]; then
    echo ""
    echo "📦 Copie vers $DEV_PATH..."
    rsync -av --exclude='.env' \
        --exclude='data/' \
        --exclude='dist/' \
        --exclude='node_modules/' \
        --exclude='.git/' \
        --exclude='*.log' \
        src/ "$DEV_PATH/src/"
    cp package.json tsconfig.json "$DEV_PATH/"
    
    cd "$DEV_PATH"
    npm run build
    echo "✅ Instance de développement mise à jour"
fi

# 4. Proposer le déploiement en production
echo ""
read -p "🚀 Déployer en production ? (y/N) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    if [ "$TARGET_BOT" = "tonton202" ]; then
        PROD_PATH="/home/ubuntu/tonton.app/apps/production/tonton202"
    elif [ "$TARGET_BOT" = "mustfood" ]; then
        PROD_PATH="/home/ubuntu/tonton.app/apps/production/mustfood"
    fi
    
    if [ -d "$PROD_PATH" ]; then
        echo "📦 Copie vers $PROD_PATH..."
        rsync -av --exclude='.env' \
            --exclude='data/' \
            --exclude='dist/' \
            --exclude='node_modules/' \
            --exclude='*.log' \
            src/ "$PROD_PATH/src/"
        cp package.json tsconfig.json "$PROD_PATH/"
        
        cd "$PROD_PATH"
        npm run build
        echo "✅ Production mise à jour"
        
        echo ""
        read -p "🔄 Redémarrer le bot en production ? (y/N) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            pkill -f "node dist/index-bot" || true
            sleep 2
            cd "$PROD_PATH"
            ./start-bot-wrapper.sh &
            echo "✅ Bot redémarré"
        fi
    fi
fi

echo ""
echo "✅ Déploiement terminé !"
echo ""
echo "📋 Résumé:"
echo "   - Bot: $TARGET_BOT"
echo "   - Branche: $CURRENT_BRANCH"
echo ""

# Retour au répertoire initial
cd /home/ubuntu/Billit/tonton202
