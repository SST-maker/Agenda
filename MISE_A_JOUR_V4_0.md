# AGENDA v4.0 — Premium UX

## Objectif

Cette version ne rajoute pas de gros module. Elle transforme la v3.8 en finition premium plus proche d’une application iPhone native.

## Nouveautés

- animation d’entrée discrète des cartes et des vues
- micro-interactions tactiles et effet de pression
- ripple très léger sur les boutons
- barre supérieure vitrée qui gagne en contraste au défilement
- hero plus profond avec reflet extrêmement subtil
- dock de navigation basse retravaillé avec indicateur actif animé
- cartes, filtres et boutons avec mouvements plus naturels
- bottom sheets / dialogues plus fluides
- focus des champs plus lisible
- toasts plus premium
- transitions clair / sombre harmonisées
- prise en charge de `prefers-reduced-motion` pour l’accessibilité
- conservation des correctifs iPhone v3.8 : champs >= 16 px et barre basse stabilisée avec le clavier

## Installation sur un agenda existant

Aucun SQL n’est nécessaire.

1. Décompresser `AGENDA_v4.0_UPDATE_EXISTING.zip`
2. Remplacer les fichiers correspondants dans le dépôt GitHub
3. Ne pas modifier `js/config.js` ni `js/push-config.js`
4. Commit sur `main`
5. Attendre le redéploiement GitHub Pages
6. Fermer puis rouvrir la PWA une fois pour laisser le service worker v4 prendre le contrôle

## Données

Aucune table, politique RLS ou donnée existante n’est modifiée par cette version.
