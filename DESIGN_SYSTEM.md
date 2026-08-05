# Design System — AGENDA

## Intention
Le logo associe un arbre et un cœur. L’interface reprend cette dualité :
- structure et lisibilité pour l’arbre ;
- chaleur et proximité pour le cœur.

L’objectif n’est pas de reproduire un calendrier administratif, mais de montrer le rythme réel d’une famille.

## Palette fonctionnelle
| Rôle | Couleur | Usage |
|---|---|---|
| Primaire | `#224A54` | navigation, boutons, filtres actifs |
| Profondeur | `#0E392A` | cartes héro, titres, surfaces premium |
| Surface | `#F6EED8` | arrière-plans doux, contraste chaleureux |
| Accent | `#C79A5C` | heures, actions importantes, progression |
| Accent secondaire | `#8B5E3C` | catégories et nuances organiques |

## Principes UI
1. **Temps continu** : ruban de jours et timeline, plutôt qu’une grille rigide.
2. **Hiérarchie calme** : peu de couleurs fortes simultanément, grandes respirations.
3. **Gestes natifs** : glissement entre les jours, feuille modale, navigation fixe.
4. **État visible** : membre actif, date active, charge familiale et statut de synchronisation.
5. **Offline-first** : l’ajout reste immédiat même sans réseau.

## Typographie
La pile système évite toute dépendance réseau : `Inter`, `SF Pro Display`, `Segoe UI`, puis `sans-serif`. Les touches éditoriales utilisent `Georgia` uniquement sur les phrases émotionnelles.

## Rayons et profondeur
- petits contrôles : 16 px ;
- cartes : 22 à 28 px ;
- cartes héro et feuilles modales : 31 à 34 px ;
- ombres diffuses, peu contrastées, teintées en bleu pétrole ou vert profond.

## Mouvement
Les animations utilisent une courbe de sortie douce `cubic-bezier(.22, 1, .36, 1)`. Le mode `prefers-reduced-motion` désactive automatiquement les mouvements décoratifs.
