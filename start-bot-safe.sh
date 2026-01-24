#!/bin/bash

# Script de démarrage sécurisé pour éviter les doublons
# Tue l'ancien processus avant de démarrer un nouveau

# Détecter automatiquement le répertoire du bot
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BOT_DIR="$SCRIPT_DIR"
cd "$BOT_DIR"

# Détecter le nom du bot
BOT_NAME=$(basename "$BOT_DIR")

echo "🚀 Démarrage sécurisé du bot $BOT_NAME..."

# 1. Trouver et tuer TOUS les wrappers de ce bot d'abord
echo "🔍 Vérification des wrappers existants..."
for PID in $(pgrep -f "start-bot-wrapper"); do
  PROC_DIR=$(pwdx $PID 2>/dev/null | awk '{print $2}')
  if [ "$PROC_DIR" == "$BOT_DIR" ]; then
    echo "   ⚠️  Wrapper existant trouvé (PID: $PID) dans $PROC_DIR"
    echo "   🔪 Arrêt du wrapper..."
    kill -9 $PID 2>/dev/null
  fi
done

sleep 2

# 2. Trouver et tuer les processus bot dans CE répertoire
echo "🔍 Vérification des processus bot existants..."
for PID in $(pgrep -f "node dist/index-bot"); do
  PROC_DIR=$(pwdx $PID 2>/dev/null | awk '{print $2}')
  if [ "$PROC_DIR" == "$BOT_DIR" ]; then
    echo "   ⚠️  Processus bot existant trouvé (PID: $PID) dans $PROC_DIR"
    echo "   🔪 Arrêt du processus..."
    kill -9 $PID 2>/dev/null
  fi
done

sleep 1

echo "✅ Environnement nettoyé"
echo ""

# 3. Démarrer le bot en arrière-plan avec nohup
echo "🔄 Démarrage du bot..."
if [ "$BOT_NAME" = "mustfood" ]; then
  LOG_FILE="mustfood-bot.log"
else
  LOG_FILE="bot.log"
fi
nohup ./start-bot-wrapper.sh > "$LOG_FILE" 2>&1 &
WRAPPER_PID=$!

sleep 15

# 4. Vérifier que le bot a bien démarré
echo "⏳ Attente du démarrage complet..."
for i in {1..30}; do
  BOT_PID=$(pgrep -f "$BOT_DIR.*dist/index-bot" | head -1)
  if [ -n "$BOT_PID" ]; then
    echo "✅ Bot $BOT_NAME démarré avec succès (PID: $BOT_PID)"
    if [ "$BOT_NAME" = "mustfood" ]; then
      echo "📝 Logs: tail -f $BOT_DIR/mustfood-bot.log"
    else
      echo "📝 Logs: tail -f $BOT_DIR/bot.log"
    fi
    exit 0
  fi
  sleep 1
done

echo "❌ Le bot n'a pas démarré dans les 30 secondes"
if [ "$BOT_NAME" = "mustfood" ]; then
  echo "📝 Vérifiez les logs: tail -f $BOT_DIR/mustfood-bot.log"
else
  echo "📝 Vérifiez les logs: tail -f $BOT_DIR/bot.log"
fi
echo "🛑 Échec du démarrage - code d'erreur retourné"
exit 1  # Échouer pour que sync.sh sache que le démarrage a échoué
