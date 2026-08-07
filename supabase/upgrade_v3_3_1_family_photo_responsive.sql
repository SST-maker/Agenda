-- AGENDA v3.3.1 — Photo de famille.
-- À exécuter sur un projet qui possède déjà la migration v3.3.

begin;

alter table if exists public.families
  add column if not exists photo_url text check (photo_url is null or char_length(photo_url) <= 700000);

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

  update public.families
  set photo_url = v_photo, updated_at = now()
  where id = v_family_id;

  return jsonb_build_object('updated', true);
end;
$$;

revoke all on function public.update_family_photo(text) from public;
grant execute on function public.update_family_photo(text) to authenticated;

commit;
