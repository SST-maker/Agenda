# Mise à jour vers AGENDA v3.3

Cette procédure est prévue pour le projet AGENDA déjà en ligne avec GitHub Pages + Supabase.

## 1. Ne remplace pas ta configuration Supabase

Ton dépôt GitHub contient déjà tes vraies valeurs dans `js/config.js`.

**Conserve ce fichier actuel.** Le ZIP complet contient un `config.js` générique pour pouvoir servir aussi à une installation neuve.

Si tu utilises le ZIP `AGENDA_v3.3_UPDATE_EXISTING.zip`, `js/config.js` n'est volontairement pas inclus : tu ne peux donc pas écraser ta configuration par erreur.

## 2. Mettre Supabase à niveau

Dans Supabase > SQL Editor, ouvre puis exécute entièrement :

`supabase/upgrade_v3_3_family_experience.sql`

Cette migration inclut également la mise à niveau des photos de profil de la v3.2. Il n'est pas nécessaire de relancer les anciennes migrations.

Tu peux ensuite exécuter :

`supabase/verify_v3_3.sql`

Les requêtes doivent retourner les nouvelles colonnes et fonctions.

## 3. Mettre GitHub à jour

Remplace les fichiers du dépôt par ceux du pack de mise à jour puis valide le commit sur `main`.

Le Service Worker passe en cache `agenda-shell-v3.3.0`, ce qui force les appareils à récupérer la nouvelle interface.

## 4. Premier lancement

Après le déploiement :

1. ouvre l'agenda dans Safari ;
2. recharge une fois si nécessaire ;
3. ouvre `Mon profil` ;
4. définis le nom et le symbole de la famille ;
5. dans `Famille`, personnalise les profils (surnom, couleur, anniversaire, photo).

## Nouveautés

- nom et symbole de famille personnalisables ;
- accueil dynamique : « Bonsoir, Famille Hamadi » ;
- résumé de la journée par membre ;
- prochain rendez-vous directement visible ;
- surnoms, couleurs, anniversaires et photos ;
- anniversaires visibles dans le calendrier et la timeline ;
- événements `Toute la journée` ;
- répétition quotidienne, hebdomadaire, mensuelle ou annuelle ;
- responsable d'un événement (`Qui s'en occupe ?`) ;
- suppression d'une occurrence ou de toute une série ;
- actions rapides mobile plus intuitives.

## Notifications

Les notifications ne sont volontairement pas activées dans cette version. Elles seront traitées séparément afin d'ajouter les rappels et préférences sans fragiliser la synchronisation actuelle.
