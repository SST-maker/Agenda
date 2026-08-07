-- OPTIONNEL : automatiser les rappels toutes les minutes depuis Supabase Cron.
-- 1) Remplace les deux valeurs ci-dessous.
-- 2) Exécute ce script APRÈS avoir déployé la fonction Edge agenda-notifications.

create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists supabase_vault;

select vault.create_secret('https://myvnrhyoypjkhkmdokqf.supabase.co', 'agenda_project_url');
select vault.create_secret('B5y3UfP7m3h1L_urnx5ZR3LPyrH-FpwhkavEPEyPEKM', 'agenda_cron_secret');

select cron.schedule(
  'agenda-notifications-every-minute',
  '* * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'agenda_project_url') || '/functions/v1/agenda-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'agenda_cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
