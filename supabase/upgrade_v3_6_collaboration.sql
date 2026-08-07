-- AGENDA v3.6 — Collaboration familiale
-- Commentaires, réactions, vu par, pièces jointes, historique.
-- À exécuter dans Supabase > SQL Editor sur un projet déjà en v3.5.

begin;

create table if not exists public.content_comments (
  id uuid primary key,
  family_id uuid not null references public.families(id) on delete cascade,
  parent_type text not null check (parent_type in ('event','task')),
  parent_id uuid not null,
  body text not null check (char_length(body) between 1 and 1000),
  author_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists content_comments_parent_idx
  on public.content_comments (family_id, parent_type, parent_id, created_at);

create table if not exists public.content_reactions (
  family_id uuid not null references public.families(id) on delete cascade,
  parent_type text not null check (parent_type in ('event','task')),
  parent_id uuid not null,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  reaction text not null check (reaction in ('👍','❤️','✅')),
  created_at timestamptz not null default now(),
  primary key (parent_type, parent_id, user_id, reaction)
);

create index if not exists content_reactions_parent_idx
  on public.content_reactions (family_id, parent_type, parent_id);

create table if not exists public.content_reads (
  family_id uuid not null references public.families(id) on delete cascade,
  parent_type text not null check (parent_type in ('event','task')),
  parent_id uuid not null,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (parent_type, parent_id, user_id)
);

create index if not exists content_reads_parent_idx
  on public.content_reads (family_id, parent_type, parent_id, read_at);

create table if not exists public.content_attachments (
  id uuid primary key,
  family_id uuid not null references public.families(id) on delete cascade,
  parent_type text not null check (parent_type in ('event','task')),
  parent_id uuid not null,
  file_name text not null check (char_length(file_name) between 1 and 140),
  mime_type text,
  file_size bigint not null default 0 check (file_size between 0 and 10485760),
  storage_path text not null unique check (char_length(storage_path) between 1 and 500),
  uploaded_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists content_attachments_parent_idx
  on public.content_attachments (family_id, parent_type, parent_id, created_at);

create table if not exists public.activity_log (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  entity_type text not null,
  entity_id uuid,
  action text not null,
  summary text,
  actor_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists activity_log_family_created_idx
  on public.activity_log (family_id, created_at desc);

create or replace function public.content_parent_belongs_to_family(p_family_id uuid, p_parent_type text, p_parent_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case p_parent_type
    when 'event' then exists(select 1 from public.events e where e.id = p_parent_id and e.family_id = p_family_id)
    when 'task' then exists(select 1 from public.tasks t where t.id = p_parent_id and t.family_id = p_family_id)
    else false
  end;
$$;

create or replace function public.validate_collaboration_parent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.content_parent_belongs_to_family(new.family_id, new.parent_type, new.parent_id) then
    raise exception 'Le contenu associé n’appartient pas à cette famille.';
  end if;
  return new;
end;
$$;

create or replace function public.log_agenda_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family_id uuid;
  v_id uuid;
  v_action text;
  v_summary text;
begin
  if tg_op = 'DELETE' then
    v_family_id := old.family_id;
    v_id := old.id;
  else
    v_family_id := new.family_id;
    v_id := new.id;
  end if;

  if tg_table_name = 'events' then
    v_summary := coalesce(case when tg_op = 'DELETE' then old.title else new.title end, 'Rendez-vous');
    v_action := case when tg_op = 'INSERT' then 'created' when tg_op = 'UPDATE' then 'updated' else 'deleted' end;
  elsif tg_table_name = 'tasks' then
    v_summary := coalesce(case when tg_op = 'DELETE' then old.title else new.title end, 'Tâche');
    if tg_op = 'UPDATE' and old.status is distinct from new.status and new.status = 'done' then v_action := 'completed';
    elsif tg_op = 'UPDATE' and old.status is distinct from new.status and new.status = 'pending' then v_action := 'reopened';
    else v_action := case when tg_op = 'INSERT' then 'created' when tg_op = 'UPDATE' then 'updated' else 'deleted' end;
    end if;
  elsif tg_table_name = 'shopping_items' then
    v_summary := coalesce(case when tg_op = 'DELETE' then old.name else new.name end, 'Course');
    v_action := case when tg_op = 'INSERT' then 'shopping_added' when tg_op = 'UPDATE' and new.checked then 'shopping_checked' when tg_op = 'UPDATE' then 'shopping_updated' else 'shopping_deleted' end;
  elsif tg_table_name = 'routines' then
    v_summary := coalesce(case when tg_op = 'DELETE' then old.title else new.title end, 'Routine');
    v_action := case when tg_op = 'INSERT' then 'routine_created' when tg_op = 'UPDATE' then 'routine_updated' else 'routine_deleted' end;
  end if;

  insert into public.activity_log (family_id, entity_type, entity_id, action, summary, actor_user_id)
  values (v_family_id, case when tg_table_name = 'events' then 'event' when tg_table_name = 'tasks' then 'task' else tg_table_name end, v_id, v_action, v_summary, auth.uid());

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function public.cleanup_collaboration_parent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type text := case when tg_table_name = 'events' then 'event' else 'task' end;
begin
  delete from public.content_comments where family_id = old.family_id and parent_type = v_type and parent_id = old.id;
  delete from public.content_reactions where family_id = old.family_id and parent_type = v_type and parent_id = old.id;
  delete from public.content_reads where family_id = old.family_id and parent_type = v_type and parent_id = old.id;
  delete from public.content_attachments where family_id = old.family_id and parent_type = v_type and parent_id = old.id;
  return old;
end;
$$;

create or replace function public.log_comment_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.activity_log (family_id, entity_type, entity_id, action, summary, actor_user_id)
    values (new.family_id, new.parent_type, new.parent_id, 'commented', left(new.body, 140), auth.uid());
  end if;
  return new;
end;
$$;

create or replace function public.log_attachment_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.activity_log (family_id, entity_type, entity_id, action, summary, actor_user_id)
    values (new.family_id, new.parent_type, new.parent_id, 'attached', new.file_name, auth.uid());
  end if;
  return new;
end;
$$;

alter table public.content_comments enable row level security;
alter table public.content_reactions enable row level security;
alter table public.content_reads enable row level security;
alter table public.content_attachments enable row level security;
alter table public.activity_log enable row level security;

-- Commentaires
drop policy if exists content_comments_select_family on public.content_comments;
create policy content_comments_select_family on public.content_comments
for select to authenticated using (public.is_family_member(family_id));

drop policy if exists content_comments_insert_family on public.content_comments;
create policy content_comments_insert_family on public.content_comments
for insert to authenticated with check (
  public.is_family_member(family_id)
  and author_user_id = auth.uid()
  and public.content_parent_belongs_to_family(family_id, parent_type, parent_id)
);

drop policy if exists content_comments_update_own on public.content_comments;
create policy content_comments_update_own on public.content_comments
for update to authenticated using (author_user_id = auth.uid()) with check (author_user_id = auth.uid());

drop policy if exists content_comments_delete_own_or_admin on public.content_comments;
create policy content_comments_delete_own_or_admin on public.content_comments
for delete to authenticated using (author_user_id = auth.uid() or public.is_family_admin(family_id));

-- Réactions
drop policy if exists content_reactions_select_family on public.content_reactions;
create policy content_reactions_select_family on public.content_reactions
for select to authenticated using (public.is_family_member(family_id));

drop policy if exists content_reactions_insert_own on public.content_reactions;
create policy content_reactions_insert_own on public.content_reactions
for insert to authenticated with check (
  public.is_family_member(family_id)
  and user_id = auth.uid()
  and public.content_parent_belongs_to_family(family_id, parent_type, parent_id)
);

drop policy if exists content_reactions_delete_own on public.content_reactions;
create policy content_reactions_delete_own on public.content_reactions
for delete to authenticated using (user_id = auth.uid());

-- Vu par
drop policy if exists content_reads_select_family on public.content_reads;
create policy content_reads_select_family on public.content_reads
for select to authenticated using (public.is_family_member(family_id));

drop policy if exists content_reads_insert_own on public.content_reads;
create policy content_reads_insert_own on public.content_reads
for insert to authenticated with check (
  public.is_family_member(family_id)
  and user_id = auth.uid()
  and public.content_parent_belongs_to_family(family_id, parent_type, parent_id)
);

drop policy if exists content_reads_update_own on public.content_reads;
create policy content_reads_update_own on public.content_reads
for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Pièces jointes
drop policy if exists content_attachments_select_family on public.content_attachments;
create policy content_attachments_select_family on public.content_attachments
for select to authenticated using (public.is_family_member(family_id));

drop policy if exists content_attachments_insert_family on public.content_attachments;
create policy content_attachments_insert_family on public.content_attachments
for insert to authenticated with check (
  public.is_family_member(family_id)
  and uploaded_by = auth.uid()
  and public.content_parent_belongs_to_family(family_id, parent_type, parent_id)
);

drop policy if exists content_attachments_delete_own_or_admin on public.content_attachments;
create policy content_attachments_delete_own_or_admin on public.content_attachments
for delete to authenticated using (uploaded_by = auth.uid() or public.is_family_admin(family_id));

-- Historique : lecture seule côté application.
drop policy if exists activity_log_select_family on public.activity_log;
create policy activity_log_select_family on public.activity_log
for select to authenticated using (public.is_family_member(family_id));

grant select, insert, update, delete on public.content_comments to authenticated;
grant select, insert, delete on public.content_reactions to authenticated;
grant select, insert, update on public.content_reads to authenticated;
grant select, insert, delete on public.content_attachments to authenticated;
grant select on public.activity_log to authenticated;

revoke all on function public.content_parent_belongs_to_family(uuid,text,uuid) from public;
grant execute on function public.content_parent_belongs_to_family(uuid,text,uuid) to authenticated;

-- Déclencheurs de validation / activité.
drop trigger if exists content_comments_validate_parent on public.content_comments;
create trigger content_comments_validate_parent before insert or update on public.content_comments
for each row execute function public.validate_collaboration_parent();

drop trigger if exists content_comments_touch_updated_at on public.content_comments;
create trigger content_comments_touch_updated_at before update on public.content_comments
for each row execute function public.touch_updated_at();

drop trigger if exists content_reactions_validate_parent on public.content_reactions;
create trigger content_reactions_validate_parent before insert or update on public.content_reactions
for each row execute function public.validate_collaboration_parent();

drop trigger if exists content_reads_validate_parent on public.content_reads;
create trigger content_reads_validate_parent before insert or update on public.content_reads
for each row execute function public.validate_collaboration_parent();

drop trigger if exists content_attachments_validate_parent on public.content_attachments;
create trigger content_attachments_validate_parent before insert or update on public.content_attachments
for each row execute function public.validate_collaboration_parent();


-- Historique métier
drop trigger if exists events_collaboration_cleanup on public.events;
create trigger events_collaboration_cleanup before delete on public.events
for each row execute function public.cleanup_collaboration_parent();

drop trigger if exists tasks_collaboration_cleanup on public.tasks;
create trigger tasks_collaboration_cleanup before delete on public.tasks
for each row execute function public.cleanup_collaboration_parent();

drop trigger if exists events_activity_log on public.events;
create trigger events_activity_log after insert or update or delete on public.events
for each row execute function public.log_agenda_activity();

drop trigger if exists tasks_activity_log on public.tasks;
create trigger tasks_activity_log after insert or update or delete on public.tasks
for each row execute function public.log_agenda_activity();

drop trigger if exists shopping_activity_log on public.shopping_items;
create trigger shopping_activity_log after insert or update or delete on public.shopping_items
for each row execute function public.log_agenda_activity();

drop trigger if exists routines_activity_log on public.routines;
create trigger routines_activity_log after insert or update or delete on public.routines
for each row execute function public.log_agenda_activity();

drop trigger if exists comments_activity_log on public.content_comments;
create trigger comments_activity_log after insert on public.content_comments
for each row execute function public.log_comment_activity();

drop trigger if exists attachments_activity_log on public.content_attachments;
create trigger attachments_activity_log after insert on public.content_attachments
for each row execute function public.log_attachment_activity();

-- Bucket privé de pièces jointes (10 Mo max, images + PDF).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('agenda-attachments', 'agenda-attachments', false, 10485760, array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Le premier dossier du chemin est l'id de famille.
drop policy if exists agenda_attachments_storage_select on storage.objects;
create policy agenda_attachments_storage_select on storage.objects
for select to authenticated using (
  bucket_id = 'agenda-attachments'
  and (storage.foldername(name))[1] = public.current_family_id()::text
);

drop policy if exists agenda_attachments_storage_insert on storage.objects;
create policy agenda_attachments_storage_insert on storage.objects
for insert to authenticated with check (
  bucket_id = 'agenda-attachments'
  and (storage.foldername(name))[1] = public.current_family_id()::text
);

drop policy if exists agenda_attachments_storage_delete on storage.objects;
create policy agenda_attachments_storage_delete on storage.objects
for delete to authenticated using (
  bucket_id = 'agenda-attachments'
  and (storage.foldername(name))[1] = public.current_family_id()::text
);

-- Realtime collaboration.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='content_comments') then alter publication supabase_realtime add table public.content_comments; end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='content_reactions') then alter publication supabase_realtime add table public.content_reactions; end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='content_reads') then alter publication supabase_realtime add table public.content_reads; end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='content_attachments') then alter publication supabase_realtime add table public.content_attachments; end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='activity_log') then alter publication supabase_realtime add table public.activity_log; end if;
end $$;

commit;
