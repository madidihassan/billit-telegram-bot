#!/bin/bash

# Script pour suivre les logs en temps réel pendant les tests

echo "🔴 SUIVI DES LOGS EN DIRECT"
echo "Appuyez sur Ctrl+C pour arrêter"
echo ""
echo "Maintenant, utilise le bot sur Telegram et observe ici ce qui se passe..."
echo ""

# Créer les dossiers logs s'ils n'existent pas
mkdir -p logs

# Suivre les logs en temps réel
tail -f logs/bot-$(date +%Y-%m-%d).log 2>/dev/null &
LOG_PID=$!

# Attendre l'arrêt
trap "kill $LOG_PID 2>/dev/null; echo ''; echo '✅ Arrêt du monitoring'; exit 0" INT

wait
