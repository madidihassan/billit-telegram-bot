# Correction du formatage des noms d'employés

## Problème
Les noms d'employés étaient stockés sans espaces dans la base de données (ex: "Ellallaouiyasmina", "Madidihassan").

## Solution appliquée

### 1. Scripts de correction créés
- `fix-employee-names.ts` : Reformate les noms avec des espaces appropriés
- `remove-duplicates.ts` : Supprime les employés en double
- `inspect-employees.ts` : Affiche la liste des employés pour vérification

### 2. Corrections apportées (tonton202)
✅ 12 noms reformatés
✅ 2 doublons supprimés (Madidihassan, Madidisoufiane)
✅ Total: 23 employés avec noms bien formatés

### 3. Pour appliquer sur mustfood

Si vous devez appliquer les mêmes corrections sur mustfood :

```bash
cd /home/ubuntu/Billit/mustfood

# 1. Inspecter les noms actuels
npx ts-node inspect-employees.ts

# 2. Corriger les noms
npx ts-node fix-employee-names.ts

# 3. Supprimer les doublons
npx ts-node remove-duplicates.ts

# 4. Vérifier le résultat
npx ts-node inspect-employees.ts

# 5. Redémarrer le bot
pkill -f "/home/ubuntu/Billit/mustfood.*node.*dist/index-bot"
./start-bot-wrapper.sh &
```

## Résultat attendu

Avant :
- Ellallaouiyasmina
- Madidihassan
- Zamounlamya

Après :
- Yasmina El Lalaoui
- Hassan Madidi
- Lamya Zamoun

## Notes
- Les scripts sont dans .gitignore (test-*.ts, fix-*.ts, etc.)
- La base de données (data/*.db) n'est pas synchronisée par Git
- Chaque instance (tonton202, mustfood) a sa propre base de données
