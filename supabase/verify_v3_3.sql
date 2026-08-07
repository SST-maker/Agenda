select column_name from information_schema.columns
where table_schema='public' and table_name='families' and column_name='symbol';

select column_name from information_schema.columns
where table_schema='public' and table_name='members' and column_name in ('nickname','avatar_url','birthday')
order by column_name;

select column_name from information_schema.columns
where table_schema='public' and table_name='events'
  and column_name in ('all_day','responsible_member_id','series_id','recurrence_rule')
order by column_name;

select routine_name from information_schema.routines
where routine_schema='public'
  and routine_name in ('update_my_avatar','update_family_identity','update_member_presentation')
order by routine_name;
