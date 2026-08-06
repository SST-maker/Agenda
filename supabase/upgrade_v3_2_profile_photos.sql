-- Mise à jour AGENDA v3.2 : photos de profil et modernisation

begin;

alter table if exists public.profiles
  add column if not exists avatar_url text check (avatar_url is null or char_length(avatar_url) <= 500000);

alter table if exists public.members
  add column if not exists avatar_url text check (avatar_url is null or char_length(avatar_url) <= 500000);

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

revoke all on function public.update_my_avatar(text) from public;
grant execute on function public.update_my_avatar(text) to authenticated;

commit;
