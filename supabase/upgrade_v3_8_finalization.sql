-- AGENDA v3.8.0 — préférences utilisateur synchronisées
-- À exécuter une fois dans Supabase SQL Editor AVANT de publier les fichiers v3.8

create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  theme text not null default 'system' check (theme in ('system','light','dark')),
  home_widgets jsonb not null default '{"tools":true,"feed":true,"tasks":true,"members":true,"week":true,"timeline":true,"insights":true}'::jsonb,
  onboarding_complete boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.user_preferences enable row level security;

drop policy if exists user_preferences_self_select on public.user_preferences;
create policy user_preferences_self_select on public.user_preferences
for select to authenticated
using (user_id = auth.uid() and family_id = public.current_family_id());

drop policy if exists user_preferences_self_insert on public.user_preferences;
create policy user_preferences_self_insert on public.user_preferences
for insert to authenticated
with check (user_id = auth.uid() and family_id = public.current_family_id());

drop policy if exists user_preferences_self_update on public.user_preferences;
create policy user_preferences_self_update on public.user_preferences
for update to authenticated
using (user_id = auth.uid() and family_id = public.current_family_id())
with check (user_id = auth.uid() and family_id = public.current_family_id());

drop policy if exists user_preferences_self_delete on public.user_preferences;
create policy user_preferences_self_delete on public.user_preferences
for delete to authenticated
using (user_id = auth.uid() and family_id = public.current_family_id());

grant select, insert, update, delete on public.user_preferences to authenticated;

drop trigger if exists user_preferences_touch_updated_at on public.user_preferences;
create trigger user_preferences_touch_updated_at
before update on public.user_preferences
for each row execute function public.touch_updated_at();

insert into public.user_preferences (user_id, family_id)
select fu.user_id, fu.family_id
from public.family_users fu
where not exists (select 1 from public.user_preferences up where up.user_id = fu.user_id)
on conflict (user_id) do nothing;
