-- AGENDA v3.8.0 — vérification rapide
select to_regclass('public.user_preferences') as user_preferences_table;
select column_name, data_type from information_schema.columns where table_schema='public' and table_name='user_preferences' order by ordinal_position;
select policyname, cmd from pg_policies where schemaname='public' and tablename='user_preferences' order by policyname;
select trigger_name from information_schema.triggers where event_object_schema='public' and event_object_table='user_preferences';
