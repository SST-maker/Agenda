-- AGENDA v3.3 — Migration pour un projet Supabase déjà en production.
-- Cette migration est auto-suffisante : elle inclut aussi les colonnes photo de profil de la v3.2.

begin;

alter table if exists public.profiles
  add column if not exists avatar_url text check (avatar_url is null or char_length(avatar_url) <= 500000);

alter table if exists public.families
  add column if not exists symbol text not null default '🌿' check (char_length(symbol) between 1 and 8);

alter table if exists public.members
  add column if not exists avatar_url text check (avatar_url is null or char_length(avatar_url) <= 500000),
  add column if not exists nickname text check (nickname is null or char_length(nickname) between 1 and 40),
  add column if not exists birthday date;

alter table if exists public.events
  add column if not exists all_day boolean not null default false,
  add column if not exists responsible_member_id uuid references public.members(id) on delete set null,
  add column if not exists series_id uuid,
  add column if not exists recurrence_rule text not null default 'none';

-- La contrainte est ajoutée séparément pour rester compatible avec les bases déjà existantes.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'events_recurrence_rule_check'
  ) then
    alter table public.events add constraint events_recurrence_rule_check
      check (recurrence_rule in ('none','daily','weekly','monthly','yearly'));
  end if;
end $$;

create index if not exists events_family_series_idx
  on public.events (family_id, series_id) where series_id is not null;

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
    select 1
    from public.members m
    where m.id = new.responsible_member_id
      and m.family_id = new.family_id
  ) then
    raise exception 'Le responsable sélectionné n’appartient pas à cette famille.';
  end if;

  return new;
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
  if char_length(v_name) < 2 then
    raise exception 'Nom de famille invalide.';
  end if;
  if char_length(v_symbol) < 1 then
    v_symbol := '🌿';
  end if;

  update public.families
  set name = v_name,
      symbol = v_symbol,
      updated_at = now()
  where id = v_family_id;

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
  if v_color !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'Couleur invalide.';
  end if;

  update public.members
  set nickname = v_nickname,
      color = v_color,
      avatar_url = v_avatar,
      birthday = p_birthday,
      updated_at = now()
  where id = p_member_id
    and family_id = v_family_id;

  if not found then
    raise exception 'Membre introuvable.';
  end if;

  return jsonb_build_object('updated', true);
end;
$$;

revoke all on function public.update_my_avatar(text) from public;
revoke all on function public.update_family_identity(text, text) from public;
revoke all on function public.update_member_presentation(uuid, text, text, text, date) from public;

grant execute on function public.update_my_avatar(text) to authenticated;
grant execute on function public.update_family_identity(text, text) to authenticated;
grant execute on function public.update_member_presentation(uuid, text, text, text, date) to authenticated;

commit;
