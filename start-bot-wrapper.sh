#!/bin/bash

# Script wrapper pour redémarrer automatiquement le bot
# Le bot peut se redémarrer lui-même en faisant process.exit(0)

# Détecter automatiquement le répertoire du script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ========================================
# PRÉVENTION DES DOUBLONS
# ========================================
echo "🔍 Vérification des processus existants dans $SCRIPT_DIR..."

# Fonction pour tuer les processus d'un type donné dans ce répertoire
kill_processes_in_dir() {
  local pattern="$1"
  local description="$2"

  pgrep -f "$pattern" 2>/dev/null | while read pid; do
    # Vérifier le répertoire de travail du processus
    dir=$(pwdx "$pid" 2>/dev/null | awk '{print $2}')

    # Si le processus tourne dans notre répertoire, le tuer (sauf nous-même)
    if [ "$dir" = "$SCRIPT_DIR" ] && [ "$pid" != "$$" ]; then
      parent_pid=$(ps -o ppid= -p "$pid" 2>/dev/null | tr -d ' ')
      if [ "$parent_pid" != "$$" ]; then
        echo "  ⚠️  Arrêt de $description existant (PID $pid)"
        kill -9 "$pid" 2>/dev/null
      fi
    fi
  done
}

# Tuer les anciens wrappers (sauf le processus actuel)
kill_processes_in_dir "start-bot-wrapper" "wrapper"

# Tuer les anciens bots Node.js
kill_processes_in_dir "node dist/index-bot" "bot"

echo "✅ Nettoyage terminé - démarrage du nouveau bot"
echo ""

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
