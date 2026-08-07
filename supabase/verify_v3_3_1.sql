select column_name from information_schema.columns where table_schema='public' and table_name='families' and column_name='photo_url';
select routine_name from information_schema.routines where routine_schema='public' and routine_name='update_family_photo';
