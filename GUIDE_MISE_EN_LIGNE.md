# Mise en ligne pas à pas — 0 € par mois pour l’usage familial

## 1. Créer Supabase

1. Ouvrir Supabase et créer un nouveau projet.
2. Choisir une région européenne proche.
3. Conserver le mot de passe de base de données dans un gestionnaire de mots de passe.
4. Attendre que le projet soit prêt.

## 2. Installer la base sécurisée

1. Dans Supabase, ouvrir **SQL Editor**.
2. Créer une nouvelle requête.
3. Copier tout le contenu de `supabase/schema.sql`.
4. Exécuter la requête.
5. Vérifier qu’aucune erreur rouge n’apparaît.
6. Exécuter ensuite `supabase/verify.sql` : les cinq tables doivent afficher `rls_enabled = true` et les trois tables Realtime doivent apparaître.

Ce script crée les tables, fonctions d’invitation, index, validations, règles RLS et publications Realtime.

## 3. Récupérer les deux valeurs publiques

Dans Supabase, ouvrir les réglages API du projet et copier :

- **Project URL** → `SUPABASE_URL`
- **Publishable key** → `SUPABASE_PUBLISHABLE_KEY`

Une ancienne clé `anon` fonctionne également. Ne jamais copier `service_role` ou une Secret key.

## 4. Préparer GitHub

1. Créer un dépôt, par exemple `agenda-familial`.
2. Déposer **le contenu du dossier**, pas le dossier parent, à la racine du dépôt.
3. Vérifier que `index.html`, `supabase/` et `.github/` sont visibles à la racine.
4. Utiliser la branche `main`.

Avec GitHub Free, le dépôt doit normalement être public pour GitHub Pages. Le code sera visible, mais ni les mots de passe ni les rendez-vous ne seront dans GitHub : ils restent dans Supabase et sont protégés par RLS.

## 5. Ajouter les variables GitHub

Dans le dépôt :

1. **Settings**.
2. **Secrets and variables**.
3. **Actions**.
4. Onglet **Variables**.
5. Créer :
   - `SUPABASE_URL`
   - `SUPABASE_PUBLISHABLE_KEY`

Le workflow génère automatiquement `js/config.js` au moment du déploiement.

## 6. Activer GitHub Pages

1. Dans **Settings > Pages**.
2. À **Build and deployment > Source**, choisir **GitHub Actions**.
3. Aller dans l’onglet **Actions**.
4. Ouvrir le workflow **Déployer AGENDA sur GitHub Pages**.
5. Attendre la coche verte.
6. Ouvrir l’adresse indiquée par le déploiement.

L’adresse sera généralement :

`https://VOTRE-COMPTE.github.io/agenda-familial/`

## 7. Autoriser l’adresse dans Supabase Auth

Dans Supabase, ouvrir la configuration des URL Auth :

- **Site URL** : l’adresse GitHub Pages exacte, avec le `/` final.
- **Redirect URLs** : ajouter la même adresse et sa variante générique :
  `https://VOTRE-COMPTE.github.io/agenda-familial/**`

Garder la confirmation d’e-mail activée est recommandé.

## 8. Premier lancement par Nacer

1. Ouvrir l’application.
2. Appuyer sur **Premier lancement : créer l’agenda**.
3. Saisir l’e-mail de Nacer et un mot de passe d’au moins 10 caractères.
4. Confirmer l’e-mail si Supabase le demande.
5. Après le retour dans l’application, la famille et les trois profils sont créés automatiquement :
   - Nacer — Papa
   - Romane — Maman
   - Chacha — Enfant
6. L’agenda est vide.

## 9. Donner l’accès à Romane

1. Depuis le compte de Nacer, ouvrir l’icône du compte.
2. Appuyer sur **Inviter Romane**.
3. Copier le lien.
4. Envoyer ce lien à Romane.
5. Romane ouvre le lien et crée son compte.
6. Après confirmation éventuelle de son e-mail, son compte rejoint la même famille.

Le code est utilisable une seule fois et expire après 72 heures.

## 10. Installer la PWA

### iPhone

Safari → bouton Partager → **Sur l’écran d’accueil**.

### Android

Chrome → menu → **Installer l’application** ou **Ajouter à l’écran d’accueil**.

## 11. Vérifications finales

- Créer un rendez-vous sur le téléphone de Nacer.
- Vérifier son apparition sur celui de Romane.
- Modifier puis supprimer un rendez-vous.
- Couper Internet, créer un rendez-vous, remettre Internet et vérifier la synchronisation.
- Tester les vues Flux, Semaine et Mois.
- Télécharger une sauvegarde JSON depuis le compte.


## Mise à jour depuis une version déjà en ligne
Si ton agenda fonctionne déjà, exécute simplement `supabase/upgrade_v3_2_profile_photos.sql` dans Supabase, puis remplace les fichiers du dépôt GitHub par cette version et valide un nouveau commit.
