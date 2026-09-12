# 💪 FitTracker

Application web de suivi de mensurations fitness — 100% côté client, conçue pour le mobile.

## Fonctionnalités

- 📋 **Saisie** quotidienne des mesures : poids, poitrine, taille, bras, cuisses, mollets, cou…
- 📊 **Graphiques** interactifs (Chart.js) avec objectif et écarts affichés
- 🎯 **Objectifs** par métrique, matérialisés sur les courbes
- 📅 **Historique** complet avec suppression
- ⬇️ **Export / import** des données en JSON, export CSV

## Une PWA installable

- ✅ Installable sur Android / iOS / desktop via le **manifest** (`manifest.json`)
- ✅ **Hors-ligne** total grâce au service worker (`sw.js`) — toutes les ressources sont pré-cachées
- 🗄️ Les données sont stockées en **localStorage** (aucun serveur) — pensez à exporter régulièrement

## Démarrage local

```bash
# Option 1 : simple
python -m http.server 8000

# Option 2 : depuis le repo à la racine
npx serve .
```

Puis ouvrez `http://localhost:8000`.

> Le service worker nécessite un serveur HTTP (pas d'ouverture en `file://`).

## Structure

```
├── index.html              # Structure de l'app
├── manifest.json           # Métadonnées PWA
├── sw.js                   # Service worker (precache + offline)
├── vendor/                 # Chart.js (self-hosted)
├── assets/
│   ├── css/style.css       # Styles
│   ├── js/app.js           # Logique applicative
│   └── icons/              # Icônes PWA générées
└── tools/
    └── generate-icons.ps1  # Script de génération des icônes
```

### Régénérer les icônes

```powershell
powershell -ExecutionPolicy Bypass -File tools/generate-icons.ps1
```

## Gradients à venir

- Workflow GitHub Actions (`deploy.yml`) pour publier automatiquement sur GitHub Pages
- Synchronisation des données multi-appareils