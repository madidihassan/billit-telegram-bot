#!/bin/bash

# Script de démarrage SIMPLE du bot Telegram
# Tue proprement l'ancien processus et démarre un nouveau

set -e  # Arrêter en cas d'erreur

# Détecter le répertoire du bot
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BOT_DIR="$SCRIPT_DIR"
cd "$BOT_DIR"

BOT_NAME=$(basename "$BOT_DIR")
LOG_FILE="$BOT_DIR/bot.log"

echo "🚀 Démarrage simple du bot $BOT_NAME..."
echo ""

# Étape 1 : Tuer TOUS les processus liés au bot (méthode agressive)
echo "🔍 Recherche des processus existants..."
KILLED_COUNT=0

# Méthode 1 : Tuer par pattern de chemin complet
for PID in $(pgrep -f "$BOT_DIR.*dist/index-bot" 2>/dev/null); do
  echo "   🔪 Arrêt du processus (PID: $PID)"
  kill -15 "$PID" 2>/dev/null || kill -9 "$PID" 2>/dev/null
  KILLED_COUNT=$((KILLED_COUNT + 1))
done

# Méthode 2 : Tuer les shells qui ont lancé node dans ce répertoire
for PID in $(pgrep -f "sh -c node dist/index-bot" 2>/dev/null); do
  PROC_DIR=$(pwdx "$PID" 2>/dev/null | awk '{print $2}')
  if [ "$PROC_DIR" = "$BOT_DIR" ] || [ -z "$PROC_DIR" ]; then
    echo "   🔪 Arrêt du shell parent (PID: $PID)"
    kill -9 "$PID" 2>/dev/null
    KILLED_COUNT=$((KILLED_COUNT + 1))
  fi
done

# Méthode 3 : Sécurité - tuer tout node qui tourne dans ce répertoire
for PID in $(pgrep -f "node" 2>/dev/null); do
  PROC_DIR=$(pwdx "$PID" 2>/dev/null | awk '{print $2}')
  if [ "$PROC_DIR" = "$BOT_DIR" ]; then
    CMDLINE=$(ps -p $PID -o cmd= 2>/dev/null)
    if [[ "$CMDLINE" == *"dist/index-bot"* ]]; then
      echo "   🔪 Arrêt du processus orphelin (PID: $PID)"
      kill -9 "$PID" 2>/dev/null
      KILLED_COUNT=$((KILLED_COUNT + 1))
    fi
  fi
done

if [ $KILLED_COUNT -gt 0 ]; then
  echo "   ✅ $KILLED_COUNT processus arrêté(s)"
  sleep 3  # Attendre plus longtemps pour être sûr
else
  echo "   ✅ Aucun processus existant"
fi

# Étape 2 : Tuer les wrappers spécifiques à ce bot
pkill -9 -f "$BOT_DIR.*start-bot-wrapper" 2>/dev/null && echo "   ✅ Wrapper arrêté" || true
pkill -9 -f "$BOT_DIR.*start-bot.sh" 2>/dev/null || true

echo ""
echo "🔄 Démarrage du nouveau bot..."

# Étape 3 : Vérifier que dist/index-bot.js existe
if [ ! -f "$BOT_DIR/dist/index-bot.js" ]; then
  echo "❌ Erreur: dist/index-bot.js n'existe pas"
  echo "   Exécutez d'abord: npm run build"
  exit 1
fi

# Étape 4 : Démarrer le bot directement avec node (PAS npm run)
# Cela évite les processus intermédiaires
nohup node "$BOT_DIR/dist/index-bot.js" > "$LOG_FILE" 2>&1 &
BOT_PID=$!

echo "   🆔 PID: $BOT_PID"
echo ""

# Étape 5 : Attendre que le bot démarre vraiment
echo "⏳ Vérification du démarrage (max 15 secondes)..."
SUCCESS=0

for i in {1..15}; do
  sleep 1
  
  # Vérifier que le processus existe toujours
  if ps -p $BOT_PID > /dev/null 2>&1; then
    # Vérifier qu'il a bien démarré (chercher un message dans les logs)
    if grep -q "Bot interactif activé\|Surveillance active" "$LOG_FILE" 2>/dev/null; then
      SUCCESS=1
      break
    fi
  else
    echo "❌ Le processus s'est arrêté immédiatement"
    echo "📝 Dernières lignes du log:"
    tail -20 "$LOG_FILE"
    exit 1
  fi
  
  # Afficher un point tous les 2 secondes
  if [ $((i % 2)) -eq 0 ]; then
    echo -n "."
  fi
done

echo ""
echo ""

if [ $SUCCESS -eq 1 ]; then
  echo "✅ Bot $BOT_NAME démarré avec succès !"
  echo ""
  echo "🆔 PID: $BOT_PID"
  echo "📝 Logs: tail -f $LOG_FILE"
  echo "🛑 Arrêter: kill $BOT_PID"
  echo ""
  
  # Afficher les premières lignes du log
  echo "📊 Premières lignes du log:"
  tail -10 "$LOG_FILE" | sed 's/^/   /'
  echo ""
  
  exit 0
else
  echo "❌ Le bot n'a pas démarré correctement"
  echo ""
  echo "📝 Dernières lignes du log:"
  tail -20 "$LOG_FILE" | sed 's/^/   /'
  echo ""
  exit 1
fi
