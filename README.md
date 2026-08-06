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
