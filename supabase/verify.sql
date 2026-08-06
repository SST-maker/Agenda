-- Contrôle après installation. Cette requête ne modifie aucune donnée.
select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('profiles', 'families', 'family_users', 'members', 'events')
order by c.relname;

select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name in ('create_agenda_family', 'join_agenda_family', 'rotate_family_invite')
order by routine_name;

select schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
  and schemaname = 'public'
  and tablename in ('families', 'members', 'events')
order by tablename;

select column_name from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'avatar_url';
select column_name from information_schema.columns where table_schema = 'public' and table_name = 'members' and column_name = 'avatar_url';
select routine_name from information_schema.routines where routine_schema = 'public' and routine_name = 'update_my_avatar';
