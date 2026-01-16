#!/bin/bash

clear

cat << "EOF"
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║          🎯 DASHBOARD DE TEST - NIVEAU 1                     ║
║          Streaming + Validation + Métriques                  ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝

EOF

echo "📅 Date: $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

echo "═══════════════════════════════════════════════════════════════"
echo "1️⃣  STATUT DES BOTS"
echo "═══════════════════════════════════════════════════════════════"

BOT_COUNT=$(ps aux | grep "node dist/index-bot" | grep -v grep | wc -l)
echo "✅ Nombre de bots actifs: $BOT_COUNT"
echo ""

echo "Processus détaillés:"
ps aux | grep "node dist/index-bot" | grep -v grep | awk '{print "   PID " $2 " | CPU: " $3 "% | RAM: " $4 "%"}'

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "2️⃣  LOGS WINSTON (15 dernières lignes)"
echo "═══════════════════════════════════════════════════════════════"

LOG_FILE="logs/bot-$(date +%Y-%m-%d).log"

if [ -f "$LOG_FILE" ]; then
    echo "📄 Fichier: $LOG_FILE"
    echo ""
    tail -15 "$LOG_FILE" | sed 's/^/   /'
else
    echo "   ⚠️  Aucun log aujourd'hui - bot pas encore utilisé"
    echo "   💡 Les logs apparaîtront dès la première requête"
fi

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "3️⃣  ERREURS RÉCENTES"
echo "═══════════════════════════════════════════════════════════════"

ERROR_FILE="logs/error-$(date +%Y-%m-%d).log"

if [ -f "$ERROR_FILE" ]; then
    ERROR_COUNT=$(wc -l < "$ERROR_FILE")
    echo "⚠️  $ERROR_COUNT erreur(s) détectée(s)"
    echo ""
    tail -10 "$ERROR_FILE" | sed 's/^/   /'
else
    echo "   ✅ Aucune erreur détectée"
fi

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "4️⃣  LOGS D'AUDIT (validations)"
echo "═══════════════════════════════════════════════════════════════"

AUDIT_FILE="logs/audit-$(date +%Y-%m-%d).log"

if [ -f "$AUDIT_FILE" ]; then
    AUDIT_COUNT=$(wc -l < "$AUDIT_FILE")
    echo "📋 $AUDIT_COUNT action(s) auditée(s)"
    echo ""
    tail -10 "$AUDIT_FILE" | sed 's/^/   /'
else
    echo "   ℹ️  Aucun audit aujourd'hui"
    echo "   💡 Les audits apparaîtront lors de l'utilisation des outils"
fi

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "5️⃣  SCÉNARIOS DE TEST RECOMMANDÉS"
echo "═══════════════════════════════════════════════════════════════"

cat << "TEST_SCENARIOS"

📱 Ouvre Telegram et envoie ces messages à @Assistant_tonton202_bot:

   ✅ TEST 1 - Streaming basique:
      "factures impayées"

      Attendu:
      • Typing indicator (...)
      • "🤖 L'IA travaille..."
      • Réponse s'affiche PROGRESSIVEMENT (pas d'un coup)

   ✅ TEST 2 - Validation anti-hallucination:
      "combien de factures en décembre ?"

      Attendu:
      • Chiffre EXACT (ex: "8 factures")
      • JAMAIS "environ" ou "approximativement"

   ✅ TEST 3 - Vocal + streaming:
      🎤 [Enregistre] "balance du mois"

      Attendu:
      • "🎤 Analyse de votre commande vocale..."
      • Réponse streamée

   ✅ TEST 4 - Longue réponse:
      "analyse les salaires de décembre"

      Attendu:
      • Streaming visible sur texte long
      • Plusieurs chunks progressifs

TEST_SCENARIOS

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "6️⃣  MONITORING EN TEMPS RÉEL"
echo "═══════════════════════════════════════════════════════════════"

cat << "MONITORING"

Pour observer EN DIRECT ce qui se passe:

   Terminal 1 (ce dashboard):
   $ watch -n 2 ./test-dashboard.sh

   Terminal 2 (logs en direct):
   $ tail -f logs/bot-$(date +%Y-%m-%d).log

Puis utilise le bot sur Telegram et observe les logs défiler! 🚀

MONITORING

echo ""
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║  ✅ Le bot est prêt pour les tests !                         ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""
