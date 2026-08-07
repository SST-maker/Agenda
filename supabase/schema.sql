-- AGENDA familial — Schéma Supabase complet
-- À exécuter une seule fois dans Supabase > SQL Editor.

begin;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 60),
  avatar_url text check (avatar_url is null or char_length(avatar_url) <= 500000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 100),
  symbol text not null default '🌿' check (char_length(symbol) between 1 and 8),
  photo_url text check (photo_url is null or char_length(photo_url) <= 700000),
  created_by uuid not null references auth.users(id) on delete restrict,
  quiet_mode boolean not null default false,
  invite_code_hash text,
  invite_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.family_users (
  family_id uuid not null references public.families(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (family_id, user_id),
  unique (user_id)
);

create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  nickname text check (nickname is null or char_length(nickname) between 1 and 40),
  birthday date,
  role_label text not null check (char_length(role_label) between 1 and 40),
  initials text not null check (char_length(initials) between 1 and 4),
  color text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  avatar_url text check (avatar_url is null or char_length(avatar_url) <= 500000),
  linked_user_id uuid references auth.users(id) on delete set null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists members_family_name_unique
  on public.members (family_id, lower(name));

create table if not exists public.events (
  id uuid primary key,
  family_id uuid not null references public.families(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  event_date date not null,
  event_time time not null,
  duration_minutes smallint not null check (duration_minutes between 15 and 1440),
  category text not null check (category in ('family', 'school', 'health', 'work', 'sport', 'home')),
  location text check (location is null or char_length(location) <= 100),
  notes text check (notes is null or char_length(notes) <= 300),
  member_ids uuid[] not null default '{}',
  all_day boolean not null default false,
  responsible_member_id uuid references public.members(id) on delete set null,
  series_id uuid,
  recurrence_rule text not null default 'none' check (recurrence_rule in ('none','daily','weekly','monthly','yearly')),
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  updated_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (cardinality(member_ids) between 1 and 20)
);

create index if not exists events_family_date_idx
  on public.events (family_id, event_date, event_time);

create index if not exists events_family_series_idx
  on public.events (family_id, series_id) where series_id is not null;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.current_family_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select fu.family_id
  from public.family_users fu
  where fu.user_id = auth.uid()
  limit 1;
$$;

create or replace function public.is_family_member(p_family_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.family_users fu
    where fu.family_id = p_family_id
      and fu.user_id = auth.uid()
  );
$$;

create or replace function public.is_family_admin(p_family_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.family_users fu
    where fu.family_id = p_family_id
      and fu.user_id = auth.uid()
      and fu.role = 'admin'
  );
$$;

create or replace function public.validate_event_members()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from unnest(new.member_ids) as selected_member_id
    left join public.members m
      on m.id = selected_member_id
     and m.family_id = new.family_id
    where m.id is null
  ) then
    raise exception 'Un membre sélectionné n’appartient pas à cette famille.';
  end if;
  if new.responsible_member_id is not null and not exists (
    select 1 from public.members m where m.id = new.responsible_member_id and m.family_id = new.family_id
  ) then
    raise exception 'Le responsable sélectionné n’appartient pas à cette famille.';
  end if;
  return new;
end;
$$;

create or replace function public.create_agenda_family(p_display_name text default 'Nacer')
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_family_id uuid;
  v_display_name text := coalesce(nullif(trim(p_display_name), ''), 'Nacer');
  v_code text;
begin
  if v_user_id is null then
    raise exception 'Authentification requise.';
  end if;

  if exists (select 1 from public.family_users where user_id = v_user_id) then
    raise exception 'Ce compte appartient déjà à une famille.';
  end if;

  insert into public.profiles (id, display_name)
  values (v_user_id, left(v_display_name, 60))
  on conflict (id) do update
    set display_name = excluded.display_name,
        updated_at = now();

  v_code := 'AGENDA-' || upper(encode(extensions.gen_random_bytes(6), 'hex'));

  insert into public.families (
    name,
    created_by,
    invite_code_hash,
    invite_expires_at
  ) values (
    'Famille Hamadi',
    v_user_id,
    encode(extensions.digest(upper(v_code), 'sha256'), 'hex'),
    now() + interval '72 hours'
  ) returning id into v_family_id;

  insert into public.family_users (family_id, user_id, role)
  values (v_family_id, v_user_id, 'admin');

  insert into public.members (family_id, name, role_label, initials, color, linked_user_id, sort_order)
  values
    (v_family_id, 'Nacer', 'Papa', 'NA', '#224A54', v_user_id, 10),
    (v_family_id, 'Romane', 'Maman', 'RO', '#C79A5C', null, 20),
    (v_family_id, 'Chacha', 'Enfant', 'CH', '#739A87', null, 30);

  return jsonb_build_object(
    'family_id', v_family_id,
    'invite_code', v_code
  );
end;
$$;

create or replace function public.join_agenda_family(p_code text, p_display_name text default 'Romane')
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_family_id uuid;
  v_display_name text := coalesce(nullif(trim(p_display_name), ''), 'Romane');
  v_hash text := encode(extensions.digest(upper(trim(p_code)), 'sha256'), 'hex');
begin
  if v_user_id is null then
    raise exception 'Authentification requise.';
  end if;

  if exists (select 1 from public.family_users where user_id = v_user_id) then
    raise exception 'Ce compte appartient déjà à une famille.';
  end if;

  select id into v_family_id
  from public.families
  where invite_code_hash = v_hash
    and invite_expires_at > now()
  for update;

  if v_family_id is null then
    raise exception 'Code d’invitation invalide ou expiré.';
  end if;

  insert into public.profiles (id, display_name)
  values (v_user_id, left(v_display_name, 60))
  on conflict (id) do update
    set display_name = excluded.display_name,
        updated_at = now();

  insert into public.family_users (family_id, user_id, role)
  values (v_family_id, v_user_id, 'member');

  update public.members
  set linked_user_id = v_user_id,
      updated_at = now()
  where family_id = v_family_id
    and lower(name) = lower(v_display_name)
    and linked_user_id is null;

  update public.families
  set invite_code_hash = null,
      invite_expires_at = null,
      updated_at = now()
  where id = v_family_id;

  return jsonb_build_object('family_id', v_family_id);
end;
$$;

create or replace function public.update_family_identity(p_name text, p_symbol text default '🌿')
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_family_id uuid := public.current_family_id();
  v_name text := left(trim(coalesce(p_name, '')), 100);
  v_symbol text := left(trim(coalesce(p_symbol, '🌿')), 8);
begin
  if v_family_id is null or not public.is_family_admin(v_family_id) then
    raise exception 'Seul l’administrateur peut modifier l’identité de la famille.';
  end if;
  if char_length(v_name) < 2 then raise exception 'Nom de famille invalide.'; end if;
  if char_length(v_symbol) < 1 then v_symbol := '🌿'; end if;
  update public.families set name = v_name, symbol = v_symbol, updated_at = now() where id = v_family_id;
  return jsonb_build_object('name', v_name, 'symbol', v_symbol);
end;
$$;

create or replace function public.update_family_photo(p_photo_url text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_family_id uuid := public.current_family_id();
  v_photo text := case when p_photo_url is null or length(trim(p_photo_url)) = 0 then null else trim(p_photo_url) end;
begin
  if v_family_id is null or not public.is_family_admin(v_family_id) then
    raise exception 'Seul l’administrateur peut modifier la photo de famille.';
  end if;
  if v_photo is not null and char_length(v_photo) > 700000 then
    raise exception 'Photo de famille trop volumineuse.';
  end if;
  update public.families set photo_url = v_photo, updated_at = now() where id = v_family_id;
  return jsonb_build_object('updated', true);
end;
$$;

create or replace function public.update_member_presentation(
  p_member_id uuid,
  p_nickname text default null,
  p_color text default null,
  p_avatar_url text default null,
  p_birthday date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_family_id uuid := public.current_family_id();
  v_color text := coalesce(nullif(trim(p_color), ''), '#224A54');
  v_nickname text := nullif(left(trim(coalesce(p_nickname, '')), 40), '');
  v_avatar text := case when p_avatar_url is null or length(trim(p_avatar_url)) = 0 then null else trim(p_avatar_url) end;
begin
  if v_family_id is null or not public.is_family_admin(v_family_id) then
    raise exception 'Seul l’administrateur peut personnaliser les profils familiaux.';
  end if;
  if v_color !~ '^#[0-9A-Fa-f]{6}$' then raise exception 'Couleur invalide.'; end if;
  update public.members
  set nickname = v_nickname, color = v_color, avatar_url = v_avatar, birthday = p_birthday, updated_at = now()
  where id = p_member_id and family_id = v_family_id;
  if not found then raise exception 'Membre introuvable.'; end if;
  return jsonb_build_object('updated', true);
end;
$$;

create or replace function public.update_my_avatar(p_avatar_url text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_family_id uuid := public.current_family_id();
  v_avatar text := case when p_avatar_url is null or length(trim(p_avatar_url)) = 0 then null else trim(p_avatar_url) end;
begin
  if v_user_id is null then
    raise exception 'Authentification requise.';
  end if;

  update public.profiles
  set avatar_url = v_avatar,
      updated_at = now()
  where id = v_user_id;

  update public.members
  set avatar_url = v_avatar,
      updated_at = now()
  where family_id = v_family_id
    and linked_user_id = v_user_id;

  return jsonb_build_object('updated', true);
end;
$$;

create or replace function public.rotate_family_invite()
returns text
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_family_id uuid := public.current_family_id();
  v_code text;
begin
  if v_family_id is null or not public.is_family_admin(v_family_id) then
    raise exception 'Seul l’administrateur peut créer une invitation.';
  end if;

  v_code := 'AGENDA-' || upper(encode(extensions.gen_random_bytes(6), 'hex'));

  update public.families
  set invite_code_hash = encode(extensions.digest(upper(v_code), 'sha256'), 'hex'),
      invite_expires_at = now() + interval '72 hours',
      updated_at = now()
  where id = v_family_id;

  return v_code;
end;
$$;

revoke all on function public.current_family_id() from public;
revoke all on function public.is_family_member(uuid) from public;
revoke all on function public.is_family_admin(uuid) from public;
revoke all on function public.create_agenda_family(text) from public;
revoke all on function public.join_agenda_family(text, text) from public;
revoke all on function public.rotate_family_invite() from public;
revoke all on function public.update_my_avatar(text) from public;
revoke all on function public.update_family_identity(text, text) from public;
revoke all on function public.update_family_photo(text) from public;
revoke all on function public.update_member_presentation(uuid, text, text, text, date) from public;

grant execute on function public.current_family_id() to authenticated;
grant execute on function public.is_family_member(uuid) to authenticated;
grant execute on function public.is_family_admin(uuid) to authenticated;
grant execute on function public.create_agenda_family(text) to authenticated;
grant execute on function public.join_agenda_family(text, text) to authenticated;
grant execute on function public.rotate_family_invite() to authenticated;
grant execute on function public.update_my_avatar(text) to authenticated;
grant execute on function public.update_family_identity(text, text) to authenticated;
grant execute on function public.update_family_photo(text) to authenticated;
grant execute on function public.update_member_presentation(uuid, text, text, text, date) to authenticated;

alter table public.profiles enable row level security;
alter table public.families enable row level security;
alter table public.family_users enable row level security;
alter table public.members enable row level security;
alter table public.events enable row level security;

drop policy if exists profiles_select_self on public.profiles;
create policy profiles_select_self on public.profiles
for select to authenticated
using (id = auth.uid());

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists families_select_member on public.families;
create policy families_select_member on public.families
for select to authenticated
using (public.is_family_member(id));

drop policy if exists families_update_member on public.families;
create policy families_update_member on public.families
for update to authenticated
using (public.is_family_member(id))
with check (public.is_family_member(id));

drop policy if exists family_users_select_same_family on public.family_users;
create policy family_users_select_same_family on public.family_users
for select to authenticated
using (public.is_family_member(family_id));

drop policy if exists members_select_family on public.members;
create policy members_select_family on public.members
for select to authenticated
using (public.is_family_member(family_id));

drop policy if exists members_insert_family on public.members;
create policy members_insert_family on public.members
for insert to authenticated
with check (public.is_family_admin(family_id));

drop policy if exists members_update_family on public.members;
create policy members_update_family on public.members
for update to authenticated
using (public.is_family_admin(family_id))
with check (public.is_family_admin(family_id));

drop policy if exists members_delete_family on public.members;
create policy members_delete_family on public.members
for delete to authenticated
using (public.is_family_admin(family_id));

drop policy if exists events_select_family on public.events;
create policy events_select_family on public.events
for select to authenticated
using (public.is_family_member(family_id));

drop policy if exists events_insert_family on public.events;
create policy events_insert_family on public.events
for insert to authenticated
with check (
  public.is_family_member(family_id)
  and created_by = auth.uid()
  and updated_by = auth.uid()
);

drop policy if exists events_update_family on public.events;
create policy events_update_family on public.events
for update to authenticated
using (public.is_family_member(family_id))
with check (
  public.is_family_member(family_id)
  and updated_by = auth.uid()
);

drop policy if exists events_delete_family on public.events;
create policy events_delete_family on public.events
for delete to authenticated
using (public.is_family_member(family_id));

grant usage on schema public to authenticated;
grant select, update on public.profiles to authenticated;
grant select on public.families to authenticated;
grant update (quiet_mode) on public.families to authenticated;
grant select on public.family_users to authenticated;
grant select, insert, update, delete on public.members to authenticated;
grant select, insert, update, delete on public.events to authenticated;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
before update on public.profiles
for each row execute function public.touch_updated_at();

drop trigger if exists families_touch_updated_at on public.families;
create trigger families_touch_updated_at
before update on public.families
for each row execute function public.touch_updated_at();

drop trigger if exists members_touch_updated_at on public.members;
create trigger members_touch_updated_at
before update on public.members
for each row execute function public.touch_updated_at();

drop trigger if exists events_touch_updated_at on public.events;
create trigger events_touch_updated_at
before update on public.events
for each row execute function public.touch_updated_at();

drop trigger if exists events_validate_members on public.events;
create trigger events_validate_members
before insert or update on public.events
for each row execute function public.validate_event_members();

-- Active Realtime uniquement pour les tables utiles.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'events'
  ) then alter publication supabase_realtime add table public.events; end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'members'
  ) then alter publication supabase_realtime add table public.members; end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'families'
  ) then alter publication supabase_realtime add table public.families; end if;
end $$;

-- Extensions v3.4
alter table public.families
  add column if not exists timezone text not null default 'Europe/Paris';

alter table public.events
  add column if not exists reminder_minutes smallint default 60
  check (reminder_minutes is null or reminder_minutes between 0 and 10080);

create table if not exists public.tasks (
  id uuid primary key,
  family_id uuid not null references public.families(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  due_date date not null,
  due_time time,
  responsible_member_id uuid references public.members(id) on delete set null,
  priority text not null default 'normal' check (priority in ('low','normal','high')),
  status text not null default 'pending' check (status in ('pending','done')),
  notes text check (notes is null or char_length(notes) <= 300),
  reminder_minutes smallint default 60 check (reminder_minutes is null or reminder_minutes between 0 and 10080),
  completed_at timestamptz,
  completed_by uuid references auth.users(id) on delete set null,
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  updated_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tasks_family_due_idx on public.tasks (family_id, status, due_date, due_time);

create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  push_enabled boolean not null default false,
  event_reminders boolean not null default true,
  task_reminders boolean not null default true,
  daily_summary boolean not null default true,
  daily_summary_time time not null default '07:30',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id, enabled);

create table if not exists public.notification_deliveries (
  id bigint generated by default as identity primary key,
  subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  delivery_key text not null,
  kind text not null check (kind in ('event','task','summary')),
  sent_at timestamptz not null default now(),
  unique (subscription_id, delivery_key)
);

create or replace function public.validate_task_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.responsible_member_id is not null and not exists (
    select 1 from public.members m
    where m.id = new.responsible_member_id
      and m.family_id = new.family_id
  ) then
    raise exception 'Le responsable sélectionné n’appartient pas à cette famille.';
  end if;
  return new;
end;
$$;

-- Retourne uniquement les notifications arrivées à échéance et non encore envoyées.
-- Cette fonction n’est exécutable que par le rôle serveur de la fonction Edge.
create or replace function public.get_due_push_notifications(p_now timestamptz default now())
returns table (
  subscription_id uuid,
  user_id uuid,
  endpoint text,
  p256dh text,
  auth text,
  delivery_key text,
  kind text,
  title text,
  body text,
  url text,
  tag text
)
language sql
security definer
set search_path = public
as $$
with base as (
  select
    ps.id as subscription_id,
    ps.user_id,
    ps.endpoint,
    ps.p256dh,
    ps.auth,
    fu.family_id,
    f.name as family_name,
    f.symbol,
    f.timezone,
    f.quiet_mode,
    m.id as member_id,
    np.event_reminders,
    np.task_reminders,
    np.daily_summary,
    np.daily_summary_time
  from public.push_subscriptions ps
  join public.notification_preferences np
    on np.user_id = ps.user_id
   and np.family_id = ps.family_id
  join public.family_users fu
    on fu.user_id = ps.user_id
   and fu.family_id = ps.family_id
  join public.families f on f.id = fu.family_id
  left join public.members m
    on m.family_id = fu.family_id
   and m.linked_user_id = ps.user_id
  where ps.enabled = true
    and np.push_enabled = true
), event_candidates as (
  select
    b.subscription_id, b.user_id, b.endpoint, b.p256dh, b.auth,
    'event:' || e.id::text || ':' || coalesce(e.reminder_minutes::text, 'none') as delivery_key,
    'event'::text as kind,
    coalesce(b.symbol, '🌿') || ' ' || b.family_name as title,
    case
      when e.all_day then 'Aujourd’hui · ' || e.title
      when e.reminder_minutes = 1440 then 'Demain · ' || e.title
      when e.reminder_minutes = 60 then 'Dans 1 h · ' || e.title
      when e.reminder_minutes = 120 then 'Dans 2 h · ' || e.title
      when e.reminder_minutes = 0 then 'Maintenant · ' || e.title
      else 'Dans ' || e.reminder_minutes::text || ' min · ' || e.title
    end as body,
    './?event=' || e.id::text as url,
    'agenda-event-' || e.id::text as tag
  from base b
  join public.events e on e.family_id = b.family_id
  cross join lateral (
    select ((e.event_date + (case when e.all_day then time '09:00' else e.event_time end)) at time zone b.timezone)
      - make_interval(mins => e.reminder_minutes) as remind_at
  ) r
  where b.event_reminders = true
    and e.reminder_minutes is not null
    and (b.member_id is null or b.member_id = any(e.member_ids) or e.responsible_member_id = b.member_id)
    and p_now >= r.remind_at
    and p_now < r.remind_at + interval '5 minutes'
), task_candidates as (
  select
    b.subscription_id, b.user_id, b.endpoint, b.p256dh, b.auth,
    'task:' || t.id::text || ':' || coalesce(t.reminder_minutes::text, 'none') as delivery_key,
    'task'::text as kind,
    '✅ Tâche · ' || coalesce(b.symbol, '🌿') || ' ' || b.family_name as title,
    case
      when t.reminder_minutes = 1440 then 'À prévoir demain · ' || t.title
      when t.reminder_minutes = 60 then 'À faire dans 1 h · ' || t.title
      when t.reminder_minutes = 120 then 'À faire dans 2 h · ' || t.title
      when t.reminder_minutes = 0 then 'À faire maintenant · ' || t.title
      else 'À faire dans ' || t.reminder_minutes::text || ' min · ' || t.title
    end as body,
    './?task=' || t.id::text as url,
    'agenda-task-' || t.id::text as tag
  from base b
  join public.tasks t on t.family_id = b.family_id
  cross join lateral (
    select ((t.due_date + coalesce(t.due_time, time '09:00')) at time zone b.timezone)
      - make_interval(mins => t.reminder_minutes) as remind_at
  ) r
  where b.task_reminders = true
    and t.status = 'pending'
    and t.reminder_minutes is not null
    and (t.responsible_member_id is null or b.member_id is null or t.responsible_member_id = b.member_id)
    and p_now >= r.remind_at
    and p_now < r.remind_at + interval '5 minutes'
), summary_candidates as (
  select
    b.subscription_id, b.user_id, b.endpoint, b.p256dh, b.auth,
    'summary:' || b.user_id::text || ':' || ((p_now at time zone b.timezone)::date)::text as delivery_key,
    'summary'::text as kind,
    coalesce(b.symbol, '🌿') || ' Bonjour ' || b.family_name as title,
    (
      select count(*)::text || ' rendez-vous · '
      from public.events e
      where e.family_id = b.family_id
        and e.event_date = (p_now at time zone b.timezone)::date
        and (b.member_id is null or b.member_id = any(e.member_ids) or e.responsible_member_id = b.member_id)
    ) || (
      select count(*)::text || ' tâche(s) à suivre aujourd’hui'
      from public.tasks t
      where t.family_id = b.family_id
        and t.status = 'pending'
        and t.due_date <= (p_now at time zone b.timezone)::date
        and (t.responsible_member_id is null or b.member_id is null or t.responsible_member_id = b.member_id)
    ) as body,
    './'::text as url,
    'agenda-summary-' || ((p_now at time zone b.timezone)::date)::text as tag
  from base b
  cross join lateral (
    select (((p_now at time zone b.timezone)::date + b.daily_summary_time) at time zone b.timezone) as summary_at
  ) s
  where b.daily_summary = true
    and b.quiet_mode = false
    and p_now >= s.summary_at
    and p_now < s.summary_at + interval '5 minutes'
), candidates as (
  select * from event_candidates
  union all
  select * from task_candidates
  union all
  select * from summary_candidates
)
select c.*
from candidates c
where not exists (
  select 1
  from public.notification_deliveries d
  where d.subscription_id = c.subscription_id
    and d.delivery_key = c.delivery_key
)
order by c.kind, c.delivery_key
limit 250;
$$;

revoke all on function public.get_due_push_notifications(timestamptz) from public;
grant execute on function public.get_due_push_notifications(timestamptz) to service_role;

alter table public.tasks enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notification_deliveries enable row level security;

-- Tâches : toute la famille peut gérer les tâches de sa famille.
drop policy if exists tasks_select_family on public.tasks;
create policy tasks_select_family on public.tasks
for select to authenticated
using (public.is_family_member(family_id));

drop policy if exists tasks_insert_family on public.tasks;
create policy tasks_insert_family on public.tasks
for insert to authenticated
with check (public.is_family_member(family_id) and created_by = auth.uid() and updated_by = auth.uid() and (completed_by is null or completed_by = auth.uid()));

drop policy if exists tasks_update_family on public.tasks;
create policy tasks_update_family on public.tasks
for update to authenticated
using (public.is_family_member(family_id))
with check (public.is_family_member(family_id) and updated_by = auth.uid() and (completed_by is null or completed_by = auth.uid()));

drop policy if exists tasks_delete_family on public.tasks;
create policy tasks_delete_family on public.tasks
for delete to authenticated
using (public.is_family_member(family_id));

-- Préférences : chaque utilisateur ne voit et ne modifie que les siennes.
drop policy if exists notification_preferences_self_select on public.notification_preferences;
create policy notification_preferences_self_select on public.notification_preferences
for select to authenticated using (user_id = auth.uid());

drop policy if exists notification_preferences_self_insert on public.notification_preferences;
create policy notification_preferences_self_insert on public.notification_preferences
for insert to authenticated
with check (user_id = auth.uid() and public.is_family_member(family_id));

drop policy if exists notification_preferences_self_update on public.notification_preferences;
create policy notification_preferences_self_update on public.notification_preferences
for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid() and public.is_family_member(family_id));

drop policy if exists notification_preferences_self_delete on public.notification_preferences;
create policy notification_preferences_self_delete on public.notification_preferences
for delete to authenticated using (user_id = auth.uid());

-- Abonnements Push : chaque utilisateur ne gère que ses propres appareils.
drop policy if exists push_subscriptions_self_select on public.push_subscriptions;
create policy push_subscriptions_self_select on public.push_subscriptions
for select to authenticated using (user_id = auth.uid());

drop policy if exists push_subscriptions_self_insert on public.push_subscriptions;
create policy push_subscriptions_self_insert on public.push_subscriptions
for insert to authenticated
with check (user_id = auth.uid() and public.is_family_member(family_id));

drop policy if exists push_subscriptions_self_update on public.push_subscriptions;
create policy push_subscriptions_self_update on public.push_subscriptions
for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid() and public.is_family_member(family_id));

drop policy if exists push_subscriptions_self_delete on public.push_subscriptions;
create policy push_subscriptions_self_delete on public.push_subscriptions
for delete to authenticated using (user_id = auth.uid());

-- Aucun accès client aux traces d’envoi.
revoke all on public.notification_deliveries from anon, authenticated;

grant select, insert, update, delete on public.tasks to authenticated;
grant select, insert, update, delete on public.notification_preferences to authenticated;
grant select, insert, update, delete on public.push_subscriptions to authenticated;

drop trigger if exists tasks_touch_updated_at on public.tasks;
create trigger tasks_touch_updated_at before update on public.tasks
for each row execute function public.touch_updated_at();

drop trigger if exists notification_preferences_touch_updated_at on public.notification_preferences;
create trigger notification_preferences_touch_updated_at before update on public.notification_preferences
for each row execute function public.touch_updated_at();

drop trigger if exists push_subscriptions_touch_updated_at on public.push_subscriptions;
create trigger push_subscriptions_touch_updated_at before update on public.push_subscriptions
for each row execute function public.touch_updated_at();

drop trigger if exists tasks_validate_member on public.tasks;
create trigger tasks_validate_member before insert or update on public.tasks
for each row execute function public.validate_task_member();

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tasks'
  ) then alter publication supabase_realtime add table public.tasks; end if;
end $$;


-- v3.5 — Liste de courses partagée + routines familiales

create table if not exists public.shopping_items (
  id uuid primary key,
  family_id uuid not null references public.families(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  quantity text check (quantity is null or char_length(quantity) <= 30),
  category text not null default 'other' check (category in ('fresh','grocery','household','hygiene','other')),
  checked boolean not null default false,
  checked_at timestamptz,
  checked_by uuid references auth.users(id) on delete set null,
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  updated_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists shopping_items_family_checked_idx
  on public.shopping_items (family_id, checked, created_at);

create table if not exists public.routines (
  id uuid primary key,
  family_id uuid not null references public.families(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  weekdays smallint[] not null,
  routine_time time,
  responsible_member_id uuid references public.members(id) on delete set null,
  notes text check (notes is null or char_length(notes) <= 300),
  active boolean not null default true,
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  updated_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (cardinality(weekdays) between 1 and 7),
  check (weekdays <@ array[1,2,3,4,5,6,7]::smallint[])
);

create index if not exists routines_family_active_idx
  on public.routines (family_id, active, routine_time);

create table if not exists public.routine_completions (
  routine_id uuid not null references public.routines(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  completion_date date not null,
  completed_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (routine_id, completion_date)
);

create index if not exists routine_completions_family_date_idx
  on public.routine_completions (family_id, completion_date);

create or replace function public.validate_routine_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.responsible_member_id is not null and not exists (
    select 1 from public.members m
    where m.id = new.responsible_member_id
      and m.family_id = new.family_id
  ) then
    raise exception 'Le responsable sélectionné n’appartient pas à cette famille.';
  end if;
  return new;
end;
$$;

create or replace function public.validate_routine_completion_family()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.routines r
    where r.id = new.routine_id
      and r.family_id = new.family_id
  ) then
    raise exception 'Cette routine n’appartient pas à cette famille.';
  end if;
  return new;
end;
$$;

alter table public.shopping_items enable row level security;
alter table public.routines enable row level security;
alter table public.routine_completions enable row level security;

-- Courses : tous les membres de la famille peuvent gérer la liste.
drop policy if exists shopping_items_select_family on public.shopping_items;
create policy shopping_items_select_family on public.shopping_items
for select to authenticated
using (public.is_family_member(family_id));

drop policy if exists shopping_items_insert_family on public.shopping_items;
create policy shopping_items_insert_family on public.shopping_items
for insert to authenticated
with check (
  public.is_family_member(family_id)
  and created_by = auth.uid()
  and updated_by = auth.uid()
  and (checked_by is null or checked_by = auth.uid())
);

drop policy if exists shopping_items_update_family on public.shopping_items;
create policy shopping_items_update_family on public.shopping_items
for update to authenticated
using (public.is_family_member(family_id))
with check (
  public.is_family_member(family_id)
  and updated_by = auth.uid()
  and (checked_by is null or checked_by = auth.uid())
);

drop policy if exists shopping_items_delete_family on public.shopping_items;
create policy shopping_items_delete_family on public.shopping_items
for delete to authenticated
using (public.is_family_member(family_id));

-- Routines : tous les membres peuvent créer et ajuster les habitudes familiales.
drop policy if exists routines_select_family on public.routines;
create policy routines_select_family on public.routines
for select to authenticated
using (public.is_family_member(family_id));

drop policy if exists routines_insert_family on public.routines;
create policy routines_insert_family on public.routines
for insert to authenticated
with check (public.is_family_member(family_id) and created_by = auth.uid() and updated_by = auth.uid());

drop policy if exists routines_update_family on public.routines;
create policy routines_update_family on public.routines
for update to authenticated
using (public.is_family_member(family_id))
with check (public.is_family_member(family_id) and updated_by = auth.uid());

drop policy if exists routines_delete_family on public.routines;
create policy routines_delete_family on public.routines
for delete to authenticated
using (public.is_family_member(family_id));

-- Validation quotidienne d'une routine.
drop policy if exists routine_completions_select_family on public.routine_completions;
create policy routine_completions_select_family on public.routine_completions
for select to authenticated
using (public.is_family_member(family_id));

drop policy if exists routine_completions_insert_family on public.routine_completions;
create policy routine_completions_insert_family on public.routine_completions
for insert to authenticated
with check (public.is_family_member(family_id) and completed_by = auth.uid());

drop policy if exists routine_completions_delete_family on public.routine_completions;
create policy routine_completions_delete_family on public.routine_completions
for delete to authenticated
using (public.is_family_member(family_id));

grant select, insert, update, delete on public.shopping_items to authenticated;
grant select, insert, update, delete on public.routines to authenticated;
grant select, insert, delete on public.routine_completions to authenticated;

drop trigger if exists shopping_items_touch_updated_at on public.shopping_items;
create trigger shopping_items_touch_updated_at
before update on public.shopping_items
for each row execute function public.touch_updated_at();

drop trigger if exists routines_touch_updated_at on public.routines;
create trigger routines_touch_updated_at
before update on public.routines
for each row execute function public.touch_updated_at();

drop trigger if exists routines_validate_member on public.routines;
create trigger routines_validate_member
before insert or update on public.routines
for each row execute function public.validate_routine_member();

drop trigger if exists routine_completions_validate_family on public.routine_completions;
create trigger routine_completions_validate_family
before insert or update on public.routine_completions
for each row execute function public.validate_routine_completion_family();

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'shopping_items'
  ) then alter publication supabase_realtime add table public.shopping_items; end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'routines'
  ) then alter publication supabase_realtime add table public.routines; end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'routine_completions'
  ) then alter publication supabase_realtime add table public.routine_completions; end if;
end $$;

commit;
