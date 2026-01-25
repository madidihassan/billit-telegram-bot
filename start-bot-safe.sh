#!/bin/bash

# Script de démarrage sécurisé pour éviter les doublons
# Tue l'ancien processus avant de démarrer un nouveau
# Utilise un fichier PID pour garantir qu'un seul wrapper tourne

# Détecter automatiquement le répertoire du bot
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BOT_DIR="$SCRIPT_DIR"
cd "$BOT_DIR"

# Détecter le nom du bot
BOT_NAME=$(basename "$BOT_DIR")

# Fichier PID pour le wrapper
PID_FILE="$BOT_DIR/.bot-wrapper.pid"

# Fichier de verrouillage pour empêcher lancements multiples
LOCK_FILE="$BOT_DIR/.bot-start.lock"

echo "🚀 Démarrage sécurisé du bot $BOT_NAME..."

# Vérifier si un autre start-bot-safe.sh tourne déjà
if [ -f "$LOCK_FILE" ]; then
  LOCK_PID=$(cat "$LOCK_FILE")
  if kill -0 "$LOCK_PID" 2>/dev/null; then
    echo "⚠️  Un autre processus de démarrage est déjà en cours (PID: $LOCK_PID)"
    echo "❌ Abandon pour éviter les doublons"
    exit 1
  fi
  # Le processus de verrouillage est mort, on peut continuer
  rm -f "$LOCK_FILE"
fi

# Créer le verrouillage
echo $$ > "$LOCK_FILE"

# Nettoyer le verrouillage à la sortie
cleanup_lock() {
  rm -f "$LOCK_FILE"
}
trap cleanup_lock EXIT

# 1. Vérifier et tuer le wrapper depuis le fichier PID
if [ -f "$PID_FILE" ]; then
  OLD_WRAPPER_PID=$(cat "$PID_FILE")
  if [ -n "$OLD_WRAPPER_PID" ] && kill -0 "$OLD_WRAPPER_PID" 2>/dev/null; then
    echo "   ⚠️  Wrapper existant trouvé depuis PID file (PID: $OLD_WRAPPER_PID)"
    echo "   🔪 Arrêt du wrapper..."
    kill -9 "$OLD_WRAPPER_PID" 2>/dev/null
    sleep 1
  fi
  rm -f "$PID_FILE"
fi

# 2. Trouver et tuer TOUS les wrappers de ce bot (sécurité supplémentaire)
echo "🔍 Vérification des wrappers orphelins..."
WRAPPER_COUNT=0
for PID in $(pgrep -f "bash.*start-bot-wrapper.sh"); do
  PROC_DIR=$(pwdx $PID 2>/dev/null | awk '{print $2}')
  if [ "$PROC_DIR" == "$BOT_DIR" ]; then
    echo "   ⚠️  Wrapper orphelin trouvé (PID: $PID) dans $PROC_DIR"
    echo "   🔪 Arrêt du wrapper orphelin..."
    kill -9 $PID 2>/dev/null
    WRAPPER_COUNT=$((WRAPPER_COUNT + 1))
  fi
done

if [ $WRAPPER_COUNT -gt 0 ]; then
  echo "   ✅ $WRAPPER_COUNT wrapper(s) orphelin(s) arrêté(s)"
  sleep 2
fi

# 3. Trouver et tuer les processus bot dans CE répertoire
echo "🔍 Vérification des processus bot existants..."
BOT_COUNT=0
for PID in $(pgrep -f "node dist/index-bot"); do
  PROC_DIR=$(pwdx $PID 2>/dev/null | awk '{print $2}')
  if [ "$PROC_DIR" == "$BOT_DIR" ]; then
    echo "   ⚠️  Processus bot existant trouvé (PID: $PID) dans $PROC_DIR"
    echo "   🔪 Arrêt du processus..."
    kill -9 $PID 2>/dev/null
    BOT_COUNT=$((BOT_COUNT + 1))
  fi
done

if [ $BOT_COUNT -gt 0 ]; then
  echo "   ✅ $BOT_COUNT processus bot(s) arrêté(s)"
fi

sleep 1

echo "✅ Environnement nettoyé"
echo ""

# 4. Démarrer le bot en arrière-plan avec nohup
echo "🔄 Démarrage du bot..."
if [ "$BOT_NAME" = "mustfood" ]; then
  LOG_FILE="mustfood-bot.log"
else
  LOG_FILE="bot.log"
fi
nohup ./start-bot-wrapper.sh > "$LOG_FILE" 2>&1 &
WRAPPER_PID=$!

# Sauvegarder le PID du wrapper dans le fichier
echo "$WRAPPER_PID" > "$PID_FILE"
echo "   📝 PID du wrapper sauvegardé: $WRAPPER_PID"

sleep 15

# 5. Vérifier que le bot a bien démarré
echo "⏳ Attente du démarrage complet..."
for i in {1..30}; do
  # Chercher tous les processus bot, puis filtrer par répertoire
  for PID in $(pgrep -f "node dist/index-bot" 2>/dev/null); do
    PROC_DIR=$(pwdx $PID 2>/dev/null | awk '{print $2}')
    if [ "$PROC_DIR" == "$BOT_DIR" ]; then
      echo "✅ Bot $BOT_NAME démarré avec succès (PID: $PID)"
      if [ "$BOT_NAME" = "mustfood" ]; then
        echo "📝 Logs: tail -f $BOT_DIR/mustfood-bot.log"
      else
        echo "📝 Logs: tail -f $BOT_DIR/bot.log"
      fi
      exit 0
    fi
  done
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
