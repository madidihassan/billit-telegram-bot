# 💡 Suggestions d'amélioration des aliases

## Fournisseurs qui pourraient bénéficier de plus d'aliases

### Sogle ✅ (Déjà corrigé)
```json
"aliases": ["sogle", "socle"]
```

### Team Précompte Prof
Erreurs courantes : "precompte", "précompte", "team precompte"
```json
"teamprecompteprof": {
  "aliases": [
    "teamprecompteprof",
    "team precompte prof",
    "team précompte",
    "precompte prof"
  ]
}
```

### Collibry vs Collibry BV
Fusionner les deux entrées :
```json
"collibry": {
  "aliases": [
    "collibry",
    "colibri",
    "collibri",
    "collibry bv"
  ]
}
```

### Foster vs Foster Fast Food
Fusionner les deux entrées :
```json
"foster": {
  "aliases": [
    "foster",
    "foster fast food",
    "foster fastfood",
    "fosterfastfood"
  ]
}
```

### ONSS
Variantes : "onss", "o.n.s.s", "securite sociale"
```json
"onss": {
  "aliases": [
    "onss",
    "o.n.s.s",
    "securite sociale",
    "sécurité sociale"
  ]
}
```

### Vivaqua
Variantes : "vivaqua", "viva qua", "eau"
```json
"vivaqua": {
  "aliases": [
    "vivaqua",
    "viva qua"
  ]
}
```

## Comment appliquer ces améliorations ?

### Méthode 1 : Éditer manuellement
```bash
nano /home/ubuntu/Billit/supplier-aliases.json
```

### Méthode 2 : Script automatique
```bash
npx ts-node add-supplier.ts
# Entrez le nom existant pour le mettre à jour
```

### Méthode 3 : Tout remplacer
Créez un nouveau fichier optimisé et remplacez l'ancien.

---

## ✅ Avantages d'ajouter plus d'aliases

- 📈 Meilleur taux de reconnaissance
- 🗣️ Gère les fautes de prononciation (vocal)
- ⌨️ Gère les fautes de frappe
- 🌍 Gère les variantes linguistiques (accent/sans accent)

---

## 🔄 Après modification

```bash
pm2 restart billit-bot
```

Pas besoin de recompiler si vous modifiez juste le JSON !
