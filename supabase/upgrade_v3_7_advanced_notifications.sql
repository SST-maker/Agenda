-- AGENDA v3.7 — notifications avancées
-- À exécuter une seule fois dans Supabase > SQL Editor APRÈS la v3.6.

begin;

alter table public.notification_preferences
  add column if not exists routine_reminders boolean not null default true,
  add column if not exists change_alerts boolean not null default true,
  add column if not exists departure_reminders boolean not null default true,
  add column if not exists departure_minutes smallint not null default 20 check (departure_minutes between 5 and 180),
  add column if not exists overdue_task_reminders boolean not null default true,
  add column if not exists snooze_minutes smallint not null default 30 check (snooze_minutes between 5 and 1440);

-- Le type de livraison accepte désormais les rappels avancés.
alter table public.notification_deliveries
  drop constraint if exists notification_deliveries_kind_check;
alter table public.notification_deliveries
  add constraint notification_deliveries_kind_check
  check (kind in ('event','task','summary','routine','change','departure','overdue','snooze'));

-- File légère des changements à notifier aux autres membres concernés.
create table if not exists public.notification_change_events (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  entity_type text not null check (entity_type in ('event','task')),
  entity_id uuid not null,
  action text not null check (action in ('created','updated','deleted','completed','reopened')),
  title text not null,
  member_ids uuid[] not null default '{}',
  responsible_member_id uuid references public.members(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists notification_change_events_due_idx
  on public.notification_change_events (created_at desc, family_id);

-- Rappels reportés depuis l’action « Reporter » d’une notification.
create table if not exists public.notification_snoozes (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_type text not null check (entity_type in ('event','task','routine')),
  entity_id uuid not null,
  title text not null,
  body text not null,
  url text not null default './',
  tag text not null,
  remind_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists notification_snoozes_due_idx
  on public.notification_snoozes (user_id, remind_at);

create or replace function public.queue_agenda_change_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family_id uuid;
  v_entity_id uuid;
  v_title text;
  v_member_ids uuid[] := '{}';
  v_responsible uuid;
  v_action text;
begin
  v_family_id := case when tg_op = 'DELETE' then old.family_id else new.family_id end;
  v_entity_id := case when tg_op = 'DELETE' then old.id else new.id end;

  if tg_table_name = 'events' then
    v_title := coalesce(case when tg_op = 'DELETE' then old.title else new.title end, 'Rendez-vous');
    v_member_ids := coalesce(case when tg_op = 'DELETE' then old.member_ids else new.member_ids end, '{}');
    v_responsible := case when tg_op = 'DELETE' then old.responsible_member_id else new.responsible_member_id end;
    v_action := case tg_op when 'INSERT' then 'created' when 'DELETE' then 'deleted' else 'updated' end;
  elsif tg_table_name = 'tasks' then
    v_title := coalesce(case when tg_op = 'DELETE' then old.title else new.title end, 'Tâche');
    v_responsible := case when tg_op = 'DELETE' then old.responsible_member_id else new.responsible_member_id end;
    if tg_op = 'INSERT' then
      v_action := 'created';
    elsif tg_op = 'DELETE' then
      v_action := 'deleted';
    elsif old.status is distinct from new.status and new.status = 'done' then
      v_action := 'completed';
    elsif old.status is distinct from new.status and new.status = 'pending' then
      v_action := 'reopened';
    else
      v_action := 'updated';
    end if;
  else
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  insert into public.notification_change_events (
    family_id, entity_type, entity_id, action, title, member_ids,
    responsible_member_id, actor_user_id
  ) values (
    v_family_id,
    case when tg_table_name = 'events' then 'event' else 'task' end,
    v_entity_id,
    v_action,
    left(v_title, 140),
    v_member_ids,
    v_responsible,
    auth.uid()
  );

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

-- L’utilisateur peut reporter son propre rappel sans exposer de clé serveur.
create or replace function public.snooze_my_notification(
  p_entity_type text,
  p_entity_id uuid,
  p_minutes integer default 30
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_family_id uuid := public.current_family_id();
  v_member_id uuid;
  v_title text;
  v_body text;
  v_url text;
  v_tag text;
  v_id uuid;
  v_minutes integer := greatest(5, least(coalesce(p_minutes, 30), 1440));
begin
  if v_user_id is null or v_family_id is null then
    raise exception 'Authentification familiale requise.';
  end if;

  select id into v_member_id
  from public.members
  where family_id = v_family_id and linked_user_id = v_user_id
  limit 1;

  if p_entity_type = 'event' then
    select e.title,
           'Rappel reporté · ' || e.title,
           './?event=' || e.id::text,
           'agenda-snooze-event-' || e.id::text
      into v_title, v_body, v_url, v_tag
    from public.events e
    where e.id = p_entity_id
      and e.family_id = v_family_id
      and (v_member_id is null or v_member_id = any(e.member_ids) or e.responsible_member_id = v_member_id);
  elsif p_entity_type = 'task' then
    select t.title,
           'Toujours à faire · ' || t.title,
           './?task=' || t.id::text,
           'agenda-snooze-task-' || t.id::text
      into v_title, v_body, v_url, v_tag
    from public.tasks t
    where t.id = p_entity_id
      and t.family_id = v_family_id
      and (t.responsible_member_id is null or v_member_id is null or t.responsible_member_id = v_member_id);
  elsif p_entity_type = 'routine' then
    select r.title,
           'Routine reportée · ' || r.title,
           './?action=routines',
           'agenda-snooze-routine-' || r.id::text
      into v_title, v_body, v_url, v_tag
    from public.routines r
    where r.id = p_entity_id
      and r.family_id = v_family_id
      and (r.responsible_member_id is null or v_member_id is null or r.responsible_member_id = v_member_id);
  else
    raise exception 'Type de rappel non pris en charge.';
  end if;

  if v_title is null then
    raise exception 'Élément introuvable ou non autorisé.';
  end if;

  insert into public.notification_snoozes (
    family_id, user_id, entity_type, entity_id, title, body, url, tag, remind_at
  ) values (
    v_family_id, v_user_id, p_entity_type, p_entity_id, v_title, v_body, v_url, v_tag,
    now() + make_interval(mins => v_minutes)
  ) returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.snooze_my_notification(text, uuid, integer) from public;
grant execute on function public.snooze_my_notification(text, uuid, integer) to authenticated;

alter table public.notification_change_events enable row level security;
alter table public.notification_snoozes enable row level security;
revoke all on public.notification_change_events from anon, authenticated;
revoke all on public.notification_snoozes from anon, authenticated;

-- Les changements sont collectés après les triggers métier existants.
drop trigger if exists events_advanced_notification on public.events;
create trigger events_advanced_notification
after insert or update or delete on public.events
for each row execute function public.queue_agenda_change_notification();

drop trigger if exists tasks_advanced_notification on public.tasks;
create trigger tasks_advanced_notification
after insert or update or delete on public.tasks
for each row execute function public.queue_agenda_change_notification();

-- Moteur unique de notifications v3.7.
-- La signature gagne des métadonnées pour les actions de notification.
drop function if exists public.get_due_push_notifications(timestamptz);
create function public.get_due_push_notifications(p_now timestamptz default now())
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
  tag text,
  entity_type text,
  entity_id uuid,
  snooze_minutes integer
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
    np.routine_reminders,
    np.change_alerts,
    np.departure_reminders,
    np.departure_minutes,
    np.overdue_task_reminders,
    np.daily_summary,
    np.daily_summary_time,
    np.snooze_minutes
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
    'agenda-event-' || e.id::text as tag,
    'event'::text as entity_type,
    e.id as entity_id,
    b.snooze_minutes::integer as snooze_minutes
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
    'agenda-task-' || t.id::text as tag,
    'task'::text as entity_type,
    t.id as entity_id,
    b.snooze_minutes::integer as snooze_minutes
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
), departure_candidates as (
  select
    b.subscription_id, b.user_id, b.endpoint, b.p256dh, b.auth,
    'departure:' || e.id::text || ':' || b.departure_minutes::text as delivery_key,
    'departure'::text as kind,
    '🚗 Départ à prévoir'::text as title,
    'Dans ' || b.departure_minutes::text || ' min · ' || e.title || case when coalesce(e.location,'') <> '' then ' · ' || e.location else '' end as body,
    './?event=' || e.id::text as url,
    'agenda-departure-' || e.id::text as tag,
    'event'::text as entity_type,
    e.id as entity_id,
    b.snooze_minutes::integer as snooze_minutes
  from base b
  join public.events e on e.family_id = b.family_id
  cross join lateral (
    select ((e.event_date + e.event_time) at time zone b.timezone)
      - make_interval(mins => b.departure_minutes) as remind_at
  ) r
  where b.departure_reminders = true
    and e.all_day = false
    and coalesce(trim(e.location),'') <> ''
    and (b.member_id is null or e.responsible_member_id = b.member_id or (e.responsible_member_id is null and b.member_id = any(e.member_ids)))
    and p_now >= r.remind_at
    and p_now < r.remind_at + interval '5 minutes'
), overdue_candidates as (
  select
    b.subscription_id, b.user_id, b.endpoint, b.p256dh, b.auth,
    'overdue:' || t.id::text as delivery_key,
    'overdue'::text as kind,
    case when t.priority = 'high' then '⚠️ Tâche importante en attente' else '✅ Tâche toujours en attente' end as title,
    t.title || case when t.due_time is not null then ' · prévue à ' || to_char(t.due_time, 'HH24:MI') else '' end as body,
    './?task=' || t.id::text as url,
    'agenda-overdue-' || t.id::text as tag,
    'task'::text as entity_type,
    t.id as entity_id,
    b.snooze_minutes::integer as snooze_minutes
  from base b
  join public.tasks t on t.family_id = b.family_id
  cross join lateral (
    select case
      when t.due_time is not null then ((t.due_date + t.due_time) at time zone b.timezone) + interval '30 minutes'
      else ((t.due_date + time '18:00') at time zone b.timezone)
    end as remind_at
  ) r
  where b.overdue_task_reminders = true
    and t.status = 'pending'
    and (t.responsible_member_id is null or b.member_id is null or t.responsible_member_id = b.member_id)
    and p_now >= r.remind_at
    and p_now < r.remind_at + interval '5 minutes'
), routine_candidates as (
  select
    b.subscription_id, b.user_id, b.endpoint, b.p256dh, b.auth,
    'routine:' || r.id::text || ':' || ((p_now at time zone b.timezone)::date)::text as delivery_key,
    'routine'::text as kind,
    '🔁 Routine · ' || coalesce(b.symbol, '🌿') || ' ' || b.family_name as title,
    'C’est le moment · ' || r.title as body,
    './?action=routines'::text as url,
    'agenda-routine-' || r.id::text || '-' || ((p_now at time zone b.timezone)::date)::text as tag,
    'routine'::text as entity_type,
    r.id as entity_id,
    b.snooze_minutes::integer as snooze_minutes
  from base b
  join public.routines r on r.family_id = b.family_id
  cross join lateral (
    select ((((p_now at time zone b.timezone)::date + coalesce(r.routine_time, time '18:00')) at time zone b.timezone)) as remind_at,
           (p_now at time zone b.timezone)::date as local_date,
           extract(isodow from (p_now at time zone b.timezone))::smallint as local_weekday
  ) x
  where b.routine_reminders = true
    and r.active = true
    and x.local_weekday = any(r.weekdays)
    and (r.responsible_member_id is null or b.member_id is null or r.responsible_member_id = b.member_id)
    and not exists (
      select 1 from public.routine_completions rc
      where rc.routine_id = r.id and rc.completion_date = x.local_date
    )
    and p_now >= x.remind_at
    and p_now < x.remind_at + interval '5 minutes'
), change_candidates as (
  select
    b.subscription_id, b.user_id, b.endpoint, b.p256dh, b.auth,
    'change:' || n.id::text as delivery_key,
    'change'::text as kind,
    case n.action
      when 'created' then '➕ Nouveau dans l’agenda'
      when 'deleted' then '🗑️ Élément annulé'
      when 'completed' then '✅ Tâche terminée'
      when 'reopened' then '↩️ Tâche rouverte'
      else '✏️ Agenda mis à jour'
    end as title,
    n.title as body,
    case when n.action = 'deleted' then './' when n.entity_type = 'event' then './?event=' || n.entity_id::text else './?task=' || n.entity_id::text end as url,
    'agenda-change-' || n.id::text as tag,
    n.entity_type,
    n.entity_id,
    b.snooze_minutes::integer as snooze_minutes
  from base b
  join public.notification_change_events n on n.family_id = b.family_id
  where b.change_alerts = true
    and n.created_at >= p_now - interval '10 minutes'
    and n.created_at <= p_now
    and n.actor_user_id is distinct from b.user_id
    and (
      b.member_id is null
      or n.responsible_member_id = b.member_id
      or (cardinality(n.member_ids) > 0 and b.member_id = any(n.member_ids))
      or (n.entity_type = 'task' and n.responsible_member_id is null)
    )
), summary_candidates as (
  select
    b.subscription_id, b.user_id, b.endpoint, b.p256dh, b.auth,
    'summary:' || b.user_id::text || ':' || ((p_now at time zone b.timezone)::date)::text as delivery_key,
    'summary'::text as kind,
    coalesce(b.symbol, '🌿') || ' Bonjour ' || b.family_name as title,
    left(
      coalesce((
        select 'Prochain : ' || e.title || case when e.all_day then '' else ' à ' || to_char(e.event_time, 'HH24:MI') end
        from public.events e
        where e.family_id = b.family_id
          and e.event_date = (p_now at time zone b.timezone)::date
          and (b.member_id is null or b.member_id = any(e.member_ids) or e.responsible_member_id = b.member_id)
        order by e.all_day desc, e.event_time
        limit 1
      ), 'Aucun rendez-vous')
      || ' · ' || (
        select count(*)::text || ' tâche(s)'
        from public.tasks t
        where t.family_id = b.family_id
          and t.status = 'pending'
          and t.due_date <= (p_now at time zone b.timezone)::date
          and (t.responsible_member_id is null or b.member_id is null or t.responsible_member_id = b.member_id)
      )
      || ' · ' || (
        select count(*)::text || ' routine(s)'
        from public.routines r
        where r.family_id = b.family_id
          and r.active = true
          and extract(isodow from (p_now at time zone b.timezone))::smallint = any(r.weekdays)
          and (r.responsible_member_id is null or b.member_id is null or r.responsible_member_id = b.member_id)
          and not exists (
            select 1 from public.routine_completions rc
            where rc.routine_id = r.id and rc.completion_date = (p_now at time zone b.timezone)::date
          )
      )
      || ' · ' || (
        select count(*)::text || ' course(s)'
        from public.shopping_items s
        where s.family_id = b.family_id and s.checked = false
      ), 260
    ) as body,
    './'::text as url,
    'agenda-summary-' || b.user_id::text || '-' || ((p_now at time zone b.timezone)::date)::text as tag,
    null::text as entity_type,
    null::uuid as entity_id,
    b.snooze_minutes::integer as snooze_minutes
  from base b
  cross join lateral (
    select (((p_now at time zone b.timezone)::date + b.daily_summary_time) at time zone b.timezone) as summary_at
  ) s
  where b.daily_summary = true
    and b.quiet_mode = false
    and p_now >= s.summary_at
    and p_now < s.summary_at + interval '5 minutes'
), snooze_candidates as (
  select
    b.subscription_id, b.user_id, b.endpoint, b.p256dh, b.auth,
    'snooze:' || s.id::text as delivery_key,
    'snooze'::text as kind,
    '⏰ Rappel reporté'::text as title,
    s.body,
    s.url,
    s.tag || '-' || s.id::text as tag,
    s.entity_type,
    s.entity_id,
    b.snooze_minutes::integer as snooze_minutes
  from base b
  join public.notification_snoozes s
    on s.user_id = b.user_id and s.family_id = b.family_id
  where p_now >= s.remind_at
    and p_now < s.remind_at + interval '5 minutes'
), candidates as (
  select * from event_candidates
  union all select * from task_candidates
  union all select * from departure_candidates
  union all select * from overdue_candidates
  union all select * from routine_candidates
  union all select * from change_candidates
  union all select * from summary_candidates
  union all select * from snooze_candidates
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
limit 300;
$$;

revoke all on function public.get_due_push_notifications(timestamptz) from public;
grant execute on function public.get_due_push_notifications(timestamptz) to service_role;

commit;
