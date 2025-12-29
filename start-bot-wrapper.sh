#!/bin/bash

# Script wrapper pour redémarrer automatiquement le bot
# Le bot peut se redémarrer lui-même en faisant process.exit(0)

# Détecter automatiquement le répertoire du script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "🚀 Démarrage du Billit Bot avec auto-redémarrage..."
echo "📝 Le bot sera redémarré automatiquement quel que soit le code de sortie"
echo "📝 Pour arrêter définitivement : pkill -f 'start-bot-wrapper'"
echo ""

while true; do
  echo "🔄 $(date '+%Y-%m-%d %H:%M:%S') - Démarrage du bot..."

  # Démarrer le bot
  npm run start:bot
  EXIT_CODE=$?

  echo ""
  if [ $EXIT_CODE -eq 0 ]; then
    echo "✅ Bot arrêté proprement (exit code 0)"
  else
    echo "⚠️  Bot arrêté avec code $EXIT_CODE"
  fi

  echo "🔄 Redémarrage automatique dans 5 secondes..."
  echo "   (Ctrl+C ou pkill pour arrêter définitivement)"
  echo "----------------------------------------"
  sleep 5
  # Toujours redémarrer, peu importe le code de sortie
done
