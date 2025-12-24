# 🔄 Commande de Synchronisation Automatique

## 🚀 Utilisation simplifiée

### Depuis n'importe où :
```bash
synchronise
```

### Depuis le répertoire du bot :
```bash
cd /home/ubuntu/Billit/tonton202
sync
```

## 📋 Ce que fait la commande `sync`

La commande détecte automatiquement sur quelle branche vous êtes et synchronise vers l'autre bot :

### Si vous êtes sur **main** (Tonton202)
→ Synchronise vers **mustfood**

### Si vous êtes sur **mustfood**
→ Synchronise vers **main**

## ⚡ Workflow automatique

La commande exécute **toutes ces étapes** automatiquement :

1. ✅ **Vérification** des modifications non commitées
2. ✅ **Commit** automatique (demande le message si nécessaire)
3. ✅ **Compilation** du code
4. ✅ **Push** vers GitHub (branche actuelle)
5. ✅ **Merge** vers l'autre branche
6. ✅ **Push** de l'autre branche
7. ✅ **Déploiement** sur l'instance de développement
8. ✅ **Redémarrage** du bot cible
9. ✅ **Retour** à votre branche de travail

## 📝 Exemples d'utilisation

### Scénario 1 : Travailler sur Tonton202 → partager vers Mustfood

```bash
# 1. Faire vos modifications
cd /home/ubuntu/Billit/tonton202
vim src/telegram-bot.ts

# 2. Tester localement
npm run build && npm run start:bot

# 3. Synchroniser vers Mustfood
sync

# C'est tout ! Tout est fait automatiquement ✨
```

### Scénario 2 : Travailler sur Mustfood → partager vers Tonton202

```bash
# 1. Basculer vers mustfood
git checkout mustfood

# 2. Faire vos modifications
vim src/config.ts

# 3. Tester
npm run build && npm run start:bot

# 4. Synchroniser vers Tonton202
sync

# Terminé ! 🎉
```

## 🎨 Messages affichés

La commande affiche chaque étape avec des couleurs :

- 🔵 **BLEU** - Information
- 🟢 **VERT** - Succès
- 🟡 **JAUNE** - Avertissement
- 🔴 **ROUGE** - Erreur

## ⚠️ En cas de conflits

Si des conflits Git surviennent lors du merge :

```bash
# La commande s'arrête et vous informe
# Résolvez les conflits :
vim src/fichier_conflit.ts

# Marquez comme résolu
git add src/fichier_conflit.ts

# Complétez le merge
git commit

# Relancez la sync
sync
```

## 🔧 Configuration

Les alias sont configurés dans `~/.bashrc` :

```bash
# Alias pour synchronisation
alias sync='./sync.sh'
alias synchronise='./sync.sh'
```

## 📊 Résumé final

Après chaque synchronisation, un résumé complet s'affiche :

```
═══════════════════════════════════════════════════════════
📊 RÉSUMÉ DE LA SYNCHRONISATION
═══════════════════════════════════════════════════════════

✨ Synchronisation terminée avec succès !

📋 Opérations effectuées:
   ✅ Modifications commitées sur main
   ✅ Code compilé
   ✅ Push GitHub (main)
   ✅ Merge vers mustfood
   ✅ Push GitHub (mustfood)
   ✅ Déploiement développement Mustfood
   ✅ Bot Mustfood redémarré
```

## 💡 Conseils

1. **Testez avant de sync** : Vérifiez toujours que votre code fonctionne localement
2. **Message de commit clair** : Décrivez bien vos modifications
3. **Surveillez les logs** : Après la sync, vérifiez que le bot démarre correctement
4. **Travaillez sur une seule branche** : Évitez de modifier les deux branches en même temps

## 🚨 En cas de problème

Si la commande échoue :

```bash
# Vérifier l'état Git
git status

# Voir les logs
git log --oneline -5

# Annuler le dernier merge (si nécessaire)
git reset --hard HEAD~1
```

## 📚 Commandes Git manuelles (si besoin)

```bash
# Commit manuel
git add .
git commit -m "message"

# Push manuel
git push origin main
git push origin mustfood

# Merge manuel
git checkout mustfood
git merge main

# Déploiement manuel
./deploy-all.sh
```

---

**Version** : 1.0
**Dernière mise à jour** : 24 décembre 2025

**Dispo** : tapez simplement `synchronise` ou `sync` ! 🚀
