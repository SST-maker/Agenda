-- Vérification AGENDA v3.4
select table_name from information_schema.tables
where table_schema='public' and table_name in ('tasks','notification_preferences','push_subscriptions','notification_deliveries')
order by table_name;

select column_name from information_schema.columns
where table_schema='public' and table_name='events' and column_name='reminder_minutes';

select column_name from information_schema.columns
where table_schema='public' and table_name='families' and column_name='timezone';

select routine_name from information_schema.routines
where routine_schema='public' and routine_name in ('get_due_push_notifications','validate_task_member')
order by routine_name;

select tablename, policyname from pg_policies
where schemaname='public' and tablename in ('tasks','notification_preferences','push_subscriptions')
order by tablename, policyname;
