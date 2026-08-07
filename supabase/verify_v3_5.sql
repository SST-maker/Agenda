-- Vérification AGENDA v3.5
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('shopping_items','routines','routine_completions')
order by table_name;

select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name in ('validate_routine_member','validate_routine_completion_family')
order by routine_name;

select schemaname, tablename, policyname
from pg_policies
where schemaname = 'public'
  and tablename in ('shopping_items','routines','routine_completions')
order by tablename, policyname;

select schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
  and schemaname = 'public'
  and tablename in ('shopping_items','routines','routine_completions')
order by tablename;
