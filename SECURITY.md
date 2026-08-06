# Sécurité

## Modèle appliqué

- Authentification gérée par Supabase Auth.
- Sessions persistées par le SDK officiel dans le stockage du navigateur.
- Accès aux lignes contrôlé dans PostgreSQL avec Row Level Security.
- Une personne ne peut lire ou modifier que la famille liée à son compte.
- Les invitations sont stockées sous forme de condensat SHA-256, expirent après 72 heures et sont invalidées après utilisation.
- La clé du navigateur est une clé publique limitée par RLS.
- Les appels Supabase et les données privées ne sont jamais mis en cache par le Service Worker.

## Interdictions

Ne jamais placer dans le navigateur :

- une clé `service_role` ;
- une Secret key Supabase ;
- le mot de passe de la base de données ;
- un jeton personnel GitHub.

## Limites honnêtes

- GitHub Pages ne permet pas de définir tous les en-têtes HTTP de sécurité d’un serveur dédié. Une CSP est néanmoins présente dans le HTML.
- Le cache local du navigateur n’est pas un coffre chiffré indépendant : il dépend de la sécurité du téléphone et de son code de verrouillage.
- Le mode hors ligne conserve temporairement des données sur l’appareil connecté.
- Le forfait gratuit Supabase n’offre pas les mêmes garanties de sauvegarde et de disponibilité qu’un forfait payant. L’export JSON est prévu comme sauvegarde complémentaire.
