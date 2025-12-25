#!/bin/bash
# Script de synchronisation automatique multi-bots
# Usage: ./sync.sh

set -e

echo "════════════════════════════════════════════════════════════"
echo "🔄 SYNCHRONISATION AUTOMATIQUE MULTI-BOTS"
echo "════════════════════════════════════════════════════════════"
echo ""

# Couleurs pour les messages
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Fonction pour afficher les messages
info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
success() { echo -e "${GREEN}✅ $1${NC}"; }
warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
error() { echo -e "${RED}❌ $1${NC}"; }

# Détecter la branche actuelle
CURRENT_BRANCH=$(git branch --show-current)
info "Branche actuelle: ${CURRENT_BRANCH}"

# Déterminer la branche cible
if [ "$CURRENT_BRANCH" = "main" ]; then
    TARGET_BRANCH="mustfood"
    TARGET_NAME="Mustfood"
elif [ "$CURRENT_BRANCH" = "mustfood" ]; then
    TARGET_BRANCH="main"
    TARGET_NAME="Tonton202"
else
    error "Branche non reconnue: $CURRENT_BRANCH"
    info "Les branches supportées sont: main, mustfood"
    exit 1
fi

echo ""
info "Cible de synchronisation: ${TARGET_BRANCH} (${TARGET_NAME})"

# ─────────────────────────────────────────────────────────────────
# ÉTAPE 1: Vérifier les modifications non commitées
# ─────────────────────────────────────────────────────────────────
echo ""
echo "────────────────────────────────────────────────────────────"
echo "📋 ÉTAPE 1: Vérification des modifications"
echo "────────────────────────────────────────────────────────────"

if ! git diff-index --quiet HEAD --; then
    warning "Des modifications non commitées détectées !"
    echo ""
    git status --short
    echo ""
    
    # Demander le message de commit
    read -p "💬 Message de commit (ou Entrée pour 'chore: sync changes'): " commit_msg
    commit_msg=${commit_msg:-"chore: sync changes"}
    
    info "Commit des modifications..."
    git add .
    git commit -m "$commit_msg"
    success "Modifications commitées"
else
    success "Aucune modification à committer"
fi

# ─────────────────────────────────────────────────────────────────
# ÉTAPE 2: Compiler le code
# ─────────────────────────────────────────────────────────────────
echo ""
echo "────────────────────────────────────────────────────────────"
echo "🔨 ÉTAPE 2: Compilation du code"
echo "────────────────────────────────────────────────────────────"

npm run build > /dev/null 2>&1
if [ $? -eq 0 ]; then
    success "Code compilé avec succès"
else
    error "Erreur de compilation"
    exit 1
fi

# ─────────────────────────────────────────────────────────────────
# ÉTAPE 3: Pousser vers GitHub
# ─────────────────────────────────────────────────────────────────
echo ""
echo "────────────────────────────────────────────────────────────"
echo "☁️  ÉTAPE 3: Pousser vers GitHub"
echo "────────────────────────────────────────────────────────────"

info "Push vers ${CURRENT_BRANCH}..."
git push origin "$CURRENT_BRANCH" --force-with-lease
success "Push ${CURRENT_BRANCH} réussi"

# ─────────────────────────────────────────────────────────────────
# ÉTAPE 4: Basculer vers la branche cible
# ─────────────────────────────────────────────────────────────────
echo ""
echo "────────────────────────────────────────────────────────────"
echo "🔄 ÉTAPE 4: Synchronisation vers ${TARGET_NAME}"
echo "────────────────────────────────────────────────────────────"

info "Changement de branche vers ${TARGET_BRANCH}..."
git checkout "$TARGET_BRANCH"
success "Branche ${TARGET_BRANCH} activée"

# ─────────────────────────────────────────────────────────────────
# ÉTAPE 5: Merger les changements
# ─────────────────────────────────────────────────────────────────
echo ""
echo "────────────────────────────────────────────────────────────"
echo "🔀 ÉTAPE 5: Merge des changements"
echo "────────────────────────────────────────────────────────────"

info "Merge de ${CURRENT_BRANCH} vers ${TARGET_BRANCH}..."
if git merge "$CURRENT_BRANCH" -m "chore: auto-sync from ${CURRENT_BRANCH}"; then
    success "Merge réussi"
else
    error "Erreur de merge - conflits détectés"
    info "Veuillez résoudre les conflits manuellement"
    exit 1
fi

# ─────────────────────────────────────────────────────────────────
# ÉTAPE 6: Pousser la branche cible
# ─────────────────────────────────────────────────────────────────
echo ""
echo "────────────────────────────────────────────────────────────"
echo "☁️  ÉTAPE 6: Push de ${TARGET_BRANCH}"
echo "────────────────────────────────────────────────────────────"

git push origin "$TARGET_BRANCH" --force-with-lease
success "Push ${TARGET_BRANCH} réussi"

# ─────────────────────────────────────────────────────────────────
# ÉTAPE 7: Déployer sur l'instance de développement
# ─────────────────────────────────────────────────────────────────
echo ""
echo "────────────────────────────────────────────────────────────"
echo "📦 ÉTAPE 7: Déploiement développement ${TARGET_NAME}"
echo "────────────────────────────────────────────────────────────"

if [ "$TARGET_BRANCH" = "mustfood" ]; then
    DEV_PATH="/home/ubuntu/Billit/mustfood"
elif [ "$TARGET_BRANCH" = "main" ]; then
    DEV_PATH="/home/ubuntu/Billit/tonton202"
fi

if [ -d "$DEV_PATH" ]; then
    info "Copie des fichiers vers $DEV_PATH..."
    rsync -av --quiet \
        --exclude='.env' \
        --exclude='data/' \
        --exclude='dist/' \
        --exclude='node_modules/' \
        --exclude='.git/' \
        --exclude='*.log' \
        src/ "$DEV_PATH/src/"

    cp package.json tsconfig.json start-bot-safe.sh start-bot-wrapper.sh "$DEV_PATH/" 2>/dev/null || true
    chmod +x "$DEV_PATH/start-bot-safe.sh" "$DEV_PATH/start-bot-wrapper.sh" 2>/dev/null || true
    
    cd "$DEV_PATH"
    npm run build > /dev/null 2>&1
    success "Développement ${TARGET_NAME} mis à jour"
    
    # ─────────────────────────────────────────────────────────────────
    # ÉTAPE 8: Redémarrer le bot
    # ─────────────────────────────────────────────────────────────────
    echo ""
    echo "────────────────────────────────────────────────────────────"
    echo "🔄 ÉTAPE 8: Redémarrage du bot ${TARGET_NAME}"
    echo "────────────────────────────────────────────────────────────"
    
    info "Arrêt de l'ancien processus..."
    # Trouver les PIDs des processus node dist/index-bot
    OLD_PIDS=$(pgrep -f "node dist/index-bot" || true)
    if [ -n "$OLD_PIDS" ]; then
        for pid in $OLD_PIDS; do
            # Vérifier le répertoire de travail du processus
            PWD_PATH=$(pwdx "$pid" 2>/dev/null | awk '{print $2}')
            if [ "$PWD_PATH" = "$DEV_PATH" ]; then
                info "Arrêt du processus $pid (répertoire: $PWD_PATH)"
                kill -9 "$pid" 2>/dev/null || true
            fi
        done
    fi
    sleep 2
    
    info "Démarrage du nouveau bot avec start-bot-safe.sh..."
    cd "$DEV_PATH"
    ./start-bot-safe.sh

    # Le script start-bot-safe.sh gère déjà la vérification
    success "Bot ${TARGET_NAME} redémarré (voir les détails ci-dessus)"
else
    warning "Répertoire $DEV_PATH non trouvé - déploiement développement ignoré"
fi

# ─────────────────────────────────────────────────────────────────
# RETOUR À LA BRANCHE D'ORIGINE
# ─────────────────────────────────────────────────────────────────
echo ""
echo "────────────────────────────────────────────────────────────"
echo "🔙 RETOUR À LA BRANCHE D'ORIGINE"
echo "────────────────────────────────────────────────────────────"

cd /home/ubuntu/Billit/tonton202
git checkout "$CURRENT_BRANCH"
success "Retour à la branche ${CURRENT_BRANCH}"

# ─────────────────────────────────────────────────────────────────
# RÉSUMÉ
# ─────────────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════════════════"
echo "📊 RÉSUMÉ DE LA SYNCHRONISATION"
echo "════════════════════════════════════════════════════════════"
echo ""
success "✨ Synchronisation terminée avec succès !"
echo ""
echo "📋 Opérations effectuées:"
echo "   ✅ Modifications commitées sur ${CURRENT_BRANCH}"
echo "   ✅ Code compilé"
echo "   ✅ Push GitHub (${CURRENT_BRANCH})"
echo "   ✅ Merge vers ${TARGET_BRANCH}"
echo "   ✅ Push GitHub (${TARGET_BRANCH})"
echo "   ✅ Déploiement développement ${TARGET_NAME}"
echo "   ✅ Bot ${TARGET_NAME} redémarré"
echo ""
echo "🔄 Prochaine action:"
echo "   • Tester le bot ${TARGET_NAME} sur Telegram"
echo "   • Continuer vos modifications sur ${CURRENT_BRANCH}"
echo ""
echo "════════════════════════════════════════════════════════════"
