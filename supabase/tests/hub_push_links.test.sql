-- 20261123000000_hub_push_links.sql: the three Society Hub pushes open the
-- Hub, and the migration is safe to run twice.
--
--   P  hub-links-p  LSE, a Founding Society managed by Sam (agreed 10 days
--                   ago, nothing posted since), with Sam and Bea's phones
--                   set up for pushes
--
-- Everything runs in one transaction that is rolled back at the end, so the
-- other test files never see this society.
begin;

create or replace function pg_temp.as_server() returns void language plpgsql as $$
begin
  perform set_config('role', 'none', false);
  perform set_config('request.jwt.claim.sub', '', false);
end $$;

-- ---------------------------------------------------------------------
-- 1. Running the migration a second time works and changes nothing
-- ---------------------------------------------------------------------
reset role;
\ir ../migrations/20261123000000_hub_push_links.sql

-- Still server-side functions with an empty search path, and the same
-- grants as before: committees can add managers; nobody using the app can
-- call the trigger function or the reminders.
select pg_temp.expect((select bool_and(p.prosecdef and p.proconfig = array['search_path=""']) from pg_proc p
  where p.oid in ('public.add_society_manager(uuid, uuid)'::regprocedure, 'public.push_on_request_live()'::regprocedure, 'public.queue_hub_reminders()'::regprocedure)),
  'all three are security definer with an empty search path');
select pg_temp.expect(has_function_privilege('authenticated', 'public.add_society_manager(uuid, uuid)', 'execute'), 'logged-in people can still call add_society_manager (it checks who they are)');
select pg_temp.expect(not has_function_privilege('anon', 'public.add_society_manager(uuid, uuid)', 'execute'), 'logged-out visitors cannot call add_society_manager');
select pg_temp.expect(not has_function_privilege('anon', 'public.push_on_request_live()', 'execute')
  and not has_function_privilege('authenticated', 'public.push_on_request_live()', 'execute'), 'nobody using the app can call push_on_request_live');
select pg_temp.expect(not has_function_privilege('anon', 'public.queue_hub_reminders()', 'execute')
  and not has_function_privilege('authenticated', 'public.queue_hub_reminders()', 'execute'), 'nobody using the app can call queue_hub_reminders');
select pg_temp.expect(exists (select 1 from pg_trigger t where t.tgname = 'feature_requests_push_live'
  and t.tgrelid = 'public.feature_requests'::regclass and t.tgfoid = 'public.push_on_request_live()'::regprocedure), 'the "request is live" trigger still calls the function');

-- ---------------------------------------------------------------------
-- 2. Where each push opens
-- ---------------------------------------------------------------------
select pg_temp.as_server();
update public.profiles set display_name = 'Sam Student' where id = '00000000-0000-0000-0000-000000000001';
insert into public.societies (id, slug, name, university) values
  ('b1000000-0000-0000-0000-000000000001', 'hub-links-p', 'Hub Links Society', 'LSE');
insert into public.society_admins (society_id, user_id) values
  ('b1000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001');
insert into public.push_tokens (user_id, platform, token) values
  ('00000000-0000-0000-0000-000000000001', 'ios', 'ExponentPushToken[links-sam]'),
  ('00000000-0000-0000-0000-000000000002', 'android', 'ExponentPushToken[links-bea]')
on conflict (token) do nothing;
-- Society Hub pushes on for both (an earlier test file switches Bea's off).
delete from public.notification_settings where user_id in ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002');
delete from public.push_queue;

-- Sam adds Bea as a manager: her push opens the society's Hub.
select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
select public.add_society_manager('b1000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002');
select pg_temp.as_server();
select pg_temp.expect((select title || '|' || body || '|' || url from public.push_queue
  where dedupe_key = 'manager-added:b1000000-0000-0000-0000-000000000001:00000000-0000-0000-0000-000000000002')
  = 'You''re now a manager of Hub Links Society|Open the Society Hub to see it.|/hub/b1000000-0000-0000-0000-000000000001',
  'the "now a manager" push says "Open the Society Hub to see it." and opens the Hub');

-- Sam's feature request goes live: each manager's push opens the Hub's Requests page.
select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
insert into public.feature_requests (id, society_id, need) values
  ('b1000000-0000-0000-0000-0000000000f1', 'b1000000-0000-0000-0000-000000000001', 'Raffle tickets at the door');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a0');
update public.feature_requests set status = 'live' where id = 'b1000000-0000-0000-0000-0000000000f1';
select pg_temp.as_server();
select pg_temp.expect((select count(*) from public.push_queue where dedupe_key like 'request-live:b1000000-0000-0000-0000-0000000000f1:%'
  and title = 'Your feature request is live' and url = '/hub/b1000000-0000-0000-0000-000000000001/requests') = 2,
  'Sam and Bea each get a "request is live" push opening the Hub''s Requests page');

-- The weekly Founding nudge opens the society's Hub.
update public.societies set is_founding = true where id = 'b1000000-0000-0000-0000-000000000001';
insert into public.founding_agreements (society_id, agreed_by, agreed_at) values
  ('b1000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', now() - interval '10 days');
select public.queue_hub_reminders();
select pg_temp.expect((select count(*) from public.push_queue where user_id = '00000000-0000-0000-0000-000000000001'
  and dedupe_key like 'founding-nudge:b1000000-0000-0000-0000-000000000001:%'
  and title = 'Time to post your next event?' and url = '/hub/b1000000-0000-0000-0000-000000000001') = 1,
  'Sam''s Founding nudge opens the society''s Hub');
select pg_temp.expect(not exists (select 1 from public.push_queue where kind = 'hub' and url like '/dashboard/%' and dedupe_key not like 'ea:%'),
  'no Society Hub push opens the dashboard, apart from the event admin checklist reminders');

rollback;
