-- AGENDA v3.5 — Liste de courses partagée + routines familiales
-- À exécuter dans Supabase > SQL Editor sur un projet déjà en v3.4.

begin;

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
