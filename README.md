# AGENDA familial — Supabase + GitHub Pages


## Correctif v3.1

Cette version corrige le cache de `js/config.js`. La configuration Supabase est désormais chargée en priorité depuis le réseau après chaque déploiement. Le workflow accepte les valeurs GitHub enregistrées comme **Repository variables** ou comme **Repository secrets**.

Version **3.0.0** prête à être publiée comme PWA statique.

## Architecture

- **GitHub Pages** : héberge uniquement l’interface HTML/CSS/JavaScript et le Service Worker.
- **Supabase Auth** : comptes personnels de Nacer et Romane.
- **Supabase PostgreSQL** : familles, membres, paramètres et événements.
- **Row Level Security** : chaque requête est limitée à la famille de l’utilisateur connecté.
- **Supabase Realtime** : les changements apparaissent sur les deux téléphones.
- **Stockage local + file d’attente** : les modifications hors ligne sont envoyées au retour d’Internet.

Aucun serveur Node.js, Render, Cloudflare ou disque persistant n’est nécessaire.

## Démarrage

La procédure complète se trouve dans **GUIDE_MISE_EN_LIGNE.md**.

Résumé :

1. Créer un projet Supabase.
2. Exécuter `supabase/schema.sql` dans le SQL Editor.
3. Créer un dépôt GitHub et ajouter les deux variables Actions demandées.
4. Activer GitHub Pages avec la source **GitHub Actions**.
5. Ouvrir l’adresse publiée, choisir **Premier lancement**, puis créer le compte de Nacer.
6. Depuis l’application, générer l’invitation privée de Romane.

## Contrôle local

```bash
npm test
```

Pour servir l’interface localement :

```bash
python3 -m http.server 8080
```

Puis ouvrir `http://localhost:8080`. Pour une connexion réelle, renseigner temporairement `js/config.js`.

## Sécurité importante

La clé présente dans le navigateur doit être uniquement la **Publishable key** ou l’ancienne clé **anon**. Ne jamais utiliser la clé `service_role` ni une Secret key dans `js/config.js`, GitHub Pages ou les variables de déploiement.


## Nouveautés v3.2
- photo de profil pour chaque utilisateur connecté ;
- avatars visibles dans les filtres, cartes famille, événements et compte ;
- actions rapides sur l’accueil ;
- interface raffinée et plus lisible ;
- migration Supabase dédiée pour les projets déjà en production : `supabase/upgrade_v3_2_profile_photos.sql`.


## Nouveautés v3.3

- identité de famille personnalisable (nom + symbole) ;
- salutation dynamique avec le nom de famille ;
- résumé intelligent de la journée ;
- surnom, couleur, anniversaire et photo par membre ;
- anniversaires mis en avant dans l’agenda ;
- événements toute la journée ;
- événements récurrents ;
- responsable d’un événement ;
- suppression d’une occurrence ou de toute une série ;
- interface d’accueil plus intuitive.

Pour un projet déjà en ligne, suivre `MISE_A_JOUR_V3_3.md`.

## v3.3.1
- photo de famille commune, modifiable par l’administrateur ;
- affichage de la photo dans l’espace Famille ;
- suppression du scroll horizontal des actions rapides sur mobile ;
- les blocs « Prochain » et « Famille » s’adaptent désormais à la largeur de l’écran.


## Nouveautés v3.4
- tâches familiales partagées ;
- rappels configurables par rendez-vous et par tâche ;
- Web Push via Supabase Edge Functions ;
- résumé du matin ;
- panneau de notifications par appareil ;
- navigation directe depuis une notification.

Pour une mise à jour existante, voir `MISE_A_JOUR_V3_4.md`.

## v3.5 — Hub familial du quotidien
La v3.5 ajoute la liste de courses partagée, les routines familiales et un fil d'accueil unifié. Le module Repas reste volontairement hors périmètre. Pour une installation déjà en v3.4, voir `MISE_A_JOUR_V3_5.md`.


## v3.6 — Collaboration
La v3.6 ajoute un espace partagé aux rendez-vous et tâches : commentaires, réactions, accusés de lecture, pièces jointes privées, historique et recherche globale. Pour une installation déjà en v3.5, utiliser `supabase/upgrade_v3_6_collaboration.sql`.

## v3.7 — Notifications avancées et stabilité iPhone
La v3.7 ajoute les alertes de modification/annulation, les rappels de départ, routines et tâches en retard, le résumé du matin personnalisé, les actions Reporter/Terminer depuis les notifications, ainsi que les corrections de zoom clavier et de barre de navigation mobile. Voir `MISE_A_JOUR_V3_7.md`.


## v4.0 — Premium UX

Cette version finalise le rendu sans ajouter de nouveau module métier : surfaces vitrées cohérentes, transitions plus naturelles, micro-interactions tactiles, navigation basse raffinée, dialogues plus fluides, thème sombre harmonisé et respect de `prefers-reduced-motion`. Aucun nouveau SQL n’est requis.


## v4.1.0 — Animations vivantes

Orbites persistantes, réglage Système/Discrètes/Vivantes, détails premium continus et relance automatique des animations critiques sur iOS.
