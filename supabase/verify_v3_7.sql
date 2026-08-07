-- Vérification AGENDA v3.7
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'notification_preferences'
  and column_name in (
    'routine_reminders','change_alerts','departure_reminders','departure_minutes',
    'overdue_task_reminders','snooze_minutes'
  )
order by column_name;

select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('notification_change_events','notification_snoozes')
order by table_name;

select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name in ('get_due_push_notifications','snooze_my_notification')
order by routine_name;

select trigger_name, event_object_table
from information_schema.triggers
where trigger_schema = 'public'
  and trigger_name in ('events_advanced_notification','tasks_advanced_notification')
order by trigger_name;
