#!/bin/bash

# Script wrapper pour redémarrer automatiquement le bot
# Le bot peut se redémarrer lui-même en faisant process.exit(0)

cd /home/ubuntu/Billit/tonton202

echo "🚀 Démarrage du Billit Bot avec auto-redémarrage..."
echo "📝 Le bot sera redémarré automatiquement s'il s'arrête avec le code 0"
echo ""

while true; do
  echo "🔄 $(date '+%Y-%m-%d %H:%M:%S') - Démarrage du bot..."

  # Démarrer le bot
  npm run start:bot
  EXIT_CODE=$?

  # Vérifier le code de sortie
  if [ $EXIT_CODE -eq 0 ]; then
    echo ""
    echo "✅ Bot arrêté proprement (exit code 0)"
    echo "🔄 Redémarrage automatique dans 3 secondes..."
    echo "----------------------------------------"
    sleep 3
    # Continuer la boucle = redémarrer
  else
    echo ""
    echo "❌ Bot arrêté avec erreur (exit code $EXIT_CODE)"
    echo "🛑 Arrêt du script wrapper"
    exit $EXIT_CODE
  fi
done
