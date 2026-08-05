# AGENDA — PWA familiale premium

## Vision
AGENDA transforme le calendrier partagé en expérience vivante : dashboard quotidien, timeline verticale, navigation gestuelle, filtres par membre, panorama hebdomadaire ondulant et espace « respiration ».

## Charte extraite du pack logo
- Bleu pétrole : `#224A54`
- Vert profond : `#0E392A`
- Crème : `#F6EED8`
- Or : `#C79A5C`
- Brun : `#8B5E3C`

Le symbole arbre-cœur devient le fil conducteur de l’interface : lien familial, croissance, calme et confiance.

## Fonctionnalités incluses
- Dashboard mobile-first, tablette et desktop.
- Vue globale ou filtrée par membre.
- Timeline journalière avec geste gauche/droite entre les jours.
- Vue agenda en flux et vue semaine « wave ».
- Création et suppression d’événements.
- Persistance locale immédiate avec `localStorage`.
- Synchronisation entre onglets avec `BroadcastChannel`.
- Synchronisation réelle entre appareils avec le serveur Node fourni.
- Flux temps réel avec Server-Sent Events, sans dépendance externe.
- Code familial partageable par lien.
- Manifest PWA, Service Worker, cache hors-ligne et icônes du pack.
- Détection hors-ligne, installation et micro-interactions.
- Accessibilité : balises sémantiques, focus visibles, labels et réduction des animations.

## Démarrage recommandé — mode partagé
Node.js 18 ou supérieur suffit. Aucune installation de paquet n’est nécessaire.

```bash
npm start
```

Puis ouvre :

```text
http://localhost:8080
```

Pour tester sur plusieurs téléphones connectés au même Wi-Fi :

```bash
HOST=0.0.0.0 PORT=8080 npm start
```

Ouvre ensuite l’adresse IP locale de l’ordinateur sur chaque téléphone, puis partage le lien familial depuis l’écran « Respirer ».

## Mode statique uniquement
La PWA peut aussi être publiée telle quelle sur GitHub Pages, Cloudflare Pages ou Netlify. Dans ce cas elle reste entièrement fonctionnelle hors ligne, mais les données restent enregistrées sur chaque appareil.

```bash
python3 -m http.server 8080
```

## Architecture
- `index.html` : structure sémantique complète.
- `styles.css` : design system responsive et animations.
- `js/app.js` : contrôleur UI, navigation, rendu et interactions.
- `js/store.js` : couche de données locale-first et synchronisation distante.
- `server.js` : serveur statique, API JSON et flux temps réel SSE.
- `service-worker.js` : stratégie de cache PWA.
- `manifest.json` : métadonnées d’installation.
- `assets/` : logos et icônes provenant du pack fourni.
- `data/` : stockage JSON généré par le serveur.

## Sécurité et passage en production
Le serveur fourni est un socle autonome pour démonstration, réseau privé ou MVP. Le code familial sépare les espaces, mais ne remplace pas une authentification forte. Pour une commercialisation publique, ajoute une authentification par e-mail ou passkey, une base PostgreSQL, des règles d’autorisation, du chiffrement en transit via HTTPS et une stratégie de sauvegarde.
