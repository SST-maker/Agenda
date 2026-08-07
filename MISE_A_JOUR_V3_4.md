# AGENDA v3.4 — Tâches + notifications

Cette version ajoute deux briques importantes sans modifier les comptes ni les événements existants.

## Nouveautés

- tâches familiales partagées en temps réel ;
- responsable, date, heure, priorité, note et rappel pour chaque tâche ;
- coche « terminé » avec synchronisation familiale ;
- bloc « À faire aujourd’hui » directement sur l’accueil ;
- vue complète des tâches : Aujourd’hui / À venir / Terminées ;
- rappel configurable dans chaque rendez-vous ;
- Web Push par appareil ;
- rappels de rendez-vous et de tâches ;
- résumé familial du matin ;
- mode doux : le résumé du matin est suspendu, les rappels importants restent actifs ;
- clic sur une notification : ouverture directe du rendez-vous ou de la tâche concernée.

## Mise à jour d’un agenda déjà en v3.3.1

1. Dans Supabase > SQL Editor, exécuter `supabase/upgrade_v3_4_tasks_notifications.sql`.
2. Vérifier avec `supabase/verify_v3_4.sql`.
3. Mettre à jour les fichiers GitHub avec le pack `AGENDA_v3.4_UPDATE_EXISTING`.
4. Ne jamais remplacer votre `js/config.js` actuel : il n’est volontairement pas inclus dans le pack de mise à jour.
5. Pour les notifications lorsque l’application est fermée, suivre `GUIDE_NOTIFICATIONS_V3_4.md`.

## Important

La gestion des tâches fonctionne dès que le SQL v3.4 et les fichiers GitHub sont déployés.

Les notifications système nécessitent en plus la fonction Edge `agenda-notifications` et le Cron Supabase. La PWA peut cependant tester immédiatement l’autorisation de notification sur l’appareil une fois la fonction configurée.
