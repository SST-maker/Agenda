-- AGENDA v3.6 — vérifications rapides
select table_name from information_schema.tables
where table_schema='public' and table_name in ('content_comments','content_reactions','content_reads','content_attachments','activity_log')
order by table_name;

select id, public, file_size_limit from storage.buckets where id='agenda-attachments';

select routine_name from information_schema.routines
where routine_schema='public' and routine_name in ('content_parent_belongs_to_family','validate_collaboration_parent','log_agenda_activity');

select tablename, policyname from pg_policies
where schemaname in ('public','storage') and (tablename in ('content_comments','content_reactions','content_reads','content_attachments','activity_log','objects'))
order by tablename, policyname;
