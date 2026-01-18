#!/bin/bash

# Script de redémarrage robuste pour un seul bot
# Usage: ./restart-bot.sh

# Détecter le répertoire du bot
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BOT_NAME=$(basename "$SCRIPT_DIR")
cd "$SCRIPT_DIR"

echo "🔄 Redémarrage du bot $BOT_NAME..."
echo ""

# 1. Tuer TOUS les processus liés à ce bot dans ce répertoire
echo "🛑 Arrêt des processus existants..."

# Tuer les processus node dist/index-bot dans CE répertoire
for PID in $(pgrep -f "node.*dist/index-bot"); do
  PROC_DIR=$(pwdx $PID 2>/dev/null | awk '{print $2}')
  if [ "$PROC_DIR" == "$SCRIPT_DIR" ]; then
    echo "   🔪 Arrêt du bot (PID: $PID)"
    kill -9 $PID 2>/dev/null
  fi
done

# Tuer les processus npm dans CE répertoire
for PID in $(pgrep -f "npm.*start:bot"); do
  PROC_DIR=$(pwdx $PID 2>/dev/null | awk '{print $2}')
  if [ "$PROC_DIR" == "$SCRIPT_DIR" ]; then
    echo "   🔪 Arrêt du processus npm (PID: $PID)"
    kill -9 $PID 2>/dev/null
  fi
done

# Tuer les wrappers dans CE répertoire
pkill -9 -f "$SCRIPT_DIR.*start-bot-wrapper" 2>/dev/null

sleep 2
echo "✅ Nettoyage terminé"
echo ""

# 2. Démarrer UNE SEULE instance
echo "🚀 Démarrage du bot $BOT_NAME..."
nohup npm run start:bot > bot.log 2>&1 &
BOT_NPM_PID=$!

# 3. Attendre et vérifier le démarrage
echo "⏳ Vérification du démarrage (peut prendre jusqu'à 20 secondes)..."

# Vérifier avec plusieurs tentatives
for i in {1..20}; do
  BOT_PID=$(pgrep -f "$SCRIPT_DIR.*dist/index-bot" | head -1)
  if [ -n "$BOT_PID" ]; then
    echo "✅ Bot $BOT_NAME démarré avec succès !"
    echo "   📊 PID du bot: $BOT_PID"
    echo "   📊 PID du processus npm: $BOT_NPM_PID"
    echo "   📝 Logs: tail -f $SCRIPT_DIR/bot.log"
    echo ""
    echo "📌 Pour arrêter: kill $BOT_NPM_PID $BOT_PID"
    exit 0
  fi
  sleep 1
  echo -n "."
done

echo ""
echo "⚠️  Le bot n'a pas démarré dans les 20 secondes"
echo "📝 Vérifiez les logs: tail -f $SCRIPT_DIR/bot.log"
echo ""
echo "💡 Le bot peut quand même fonctionner - vérifiez manuellement avec:"
echo "   ps aux | grep dist/index-bot"
exit 1
