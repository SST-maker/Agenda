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
revoke all on function public.update_member_presentation(uuid, text, text, text, date) from public;

grant execute on function public.current_family_id() to authenticated;
grant execute on function public.is_family_member(uuid) to authenticated;
grant execute on function public.is_family_admin(uuid) to authenticated;
grant execute on function public.create_agenda_family(text) to authenticated;
grant execute on function public.join_agenda_family(text, text) to authenticated;
grant execute on function public.rotate_family_invite() to authenticated;
grant execute on function public.update_my_avatar(text) to authenticated;
grant execute on function public.update_family_identity(text, text) to authenticated;
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

commit;
