-- SQL Editor only. First create and confirm the user in Authentication > Users.
-- Replace this placeholder with that user's real UUID. Never accept a browser UID.
begin;
do $$
declare target_user uuid := '8ac266b0-a95f-4f55-8713-e1231aeaa07e';
begin
 if target_user='00000000-0000-0000-0000-000000000000' then raise exception 'Replace target_user with the actual Auth User ID first'; end if;
 if not exists(select 1 from auth.users where id=target_user) then raise exception 'Auth user does not exist'; end if;
 insert into public.tournament_admins(user_id) values(target_user) on conflict(user_id) do nothing;
end $$;
commit;
