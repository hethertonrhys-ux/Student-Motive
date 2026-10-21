-- 20261126000000_chat_photos_videos.sql: photos and videos in chats.
--
--   Sam and Bea are friends (a private chat between them). Cas is in
--   neither. A society event's group chat that Bea and Cas are going to.
--
-- Everything runs in one transaction that is rolled back at the end.
begin;

create or replace function pg_temp.as_server() returns void language plpgsql as $$
begin
  perform set_config('role', 'none', false);
  perform set_config('request.jwt.claim.sub', '', false);
end $$;
create or replace function pg_temp.error_of(statement text) returns text language plpgsql as $$
begin
  execute statement;
  return null;
exception when others then
  return sqlerrm;
end $$;

-- ---------------------------------------------------------------------
-- 0. Running the migration a second time works
-- ---------------------------------------------------------------------
reset role;
\ir ../migrations/20261126000000_chat_photos_videos.sql
select pg_temp.expect((select not public and file_size_limit = 52428800 from storage.buckets where id = 'chat-media'), 'chat-media is a private bucket with a 50 MB limit');
select pg_temp.expect((select p.prosecdef and p.proconfig = array['search_path=""'] from pg_proc p where p.oid = 'public.send_media(uuid, text, text, integer, integer, integer)'::regprocedure), 'send_media is security definer with an empty search path');
select pg_temp.expect(not has_function_privilege('anon', 'public.send_media(uuid, text, text, integer, integer, integer)', 'execute'), 'logged-out visitors cannot send media');

-- ---------------------------------------------------------------------
-- Set-up
-- ---------------------------------------------------------------------
select pg_temp.as_server();
insert into public.friendships (requester_id, addressee_id, status) values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'accepted') on conflict do nothing;
insert into public.threads (user_a, user_b) values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002') on conflict do nothing;
create temp table ids (name text primary key, id uuid);
grant all on ids to anon, authenticated;
create or replace function pg_temp.id(n text) returns uuid language sql as $$ select id from ids where name = n $$;
insert into ids select 'dm', id from public.threads where user_a = '00000000-0000-0000-0000-000000000001' and user_b = '00000000-0000-0000-0000-000000000002';
insert into public.societies (id, slug, name, university) values ('7d000000-0000-0000-0000-000000000001', 'pv-s', 'Photo Society', 'LSE');
with x as (
  insert into public.events (society_id, title, category, venue_id, starts_at, ends_at, audience)
  values ('7d000000-0000-0000-0000-000000000001', 'PV Night', 'social', (select id from public.venues order by id limit 1), now() + interval '2 days', now() + interval '2 days 3 hours', 'london')
  returning id)
insert into ids select 'event', id from x;
insert into public.event_entries (event_id, user_id, status) values
  (pg_temp.id('event'), '00000000-0000-0000-0000-000000000002', 'going'),
  (pg_temp.id('event'), '00000000-0000-0000-0000-000000000003', 'going');
insert into public.threads (event_id) values (pg_temp.id('event')) on conflict (event_id) do nothing;
insert into ids select 'chat', id from public.threads where event_id = pg_temp.id('event');

create or replace function pg_temp.upload(path text) returns boolean language plpgsql as $$
begin
  insert into storage.objects (bucket_id, name) values ('chat-media', path);
  return true;
exception when others then
  return false;
end $$;
create or replace function pg_temp.dm_path(who text, file text) returns text language sql as $$ select pg_temp.id('dm') || '/' || who || '/' || file $$;

-- ---------------------------------------------------------------------
-- 1. Uploading
-- ---------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
select pg_temp.expect(pg_temp.upload(pg_temp.dm_path('00000000-0000-0000-0000-000000000001', 'a.jpg')), 'Sam uploads a photo into his chat with Bea');
select pg_temp.expect(not pg_temp.upload(pg_temp.dm_path('00000000-0000-0000-0000-000000000002', 'b.jpg')), 'Sam cannot upload under Bea''s name');
select pg_temp.expect(not pg_temp.upload(pg_temp.id('chat') || '/00000000-0000-0000-0000-000000000001/c.jpg'), 'Sam cannot upload into a group chat he is not in');
select pg_temp.expect(not pg_temp.upload('not-a-chat/00000000-0000-0000-0000-000000000001/d.jpg'), 'files must go in a chat''s folder');

-- ---------------------------------------------------------------------
-- 2. Posting
-- ---------------------------------------------------------------------
select public.send_media(pg_temp.id('dm'), 'photo', pg_temp.dm_path('00000000-0000-0000-0000-000000000001', 'a.jpg'), 1200, 900, null);
select pg_temp.expect((select kind || '|' || body || '|' || media_width || 'x' || media_height from public.messages where thread_id = pg_temp.id('dm') and kind = 'photo') = 'photo|Sent a photo|1200x900', 'the photo is posted with its size and "Sent a photo"');
select pg_temp.expect(pg_temp.error_of($$select public.send_media(pg_temp.id('dm'), 'photo', pg_temp.dm_path('00000000-0000-0000-0000-000000000001', 'never-uploaded.jpg'), 1, 1, null)$$) like '%didn''t finish%', 'a file that was never uploaded cannot be posted');
select pg_temp.expect(pg_temp.error_of($$select public.send_media(pg_temp.id('dm'), 'gif', pg_temp.dm_path('00000000-0000-0000-0000-000000000001', 'a.jpg'), 1, 1, null)$$) is not null, 'only photos and videos');
select pg_temp.expect(pg_temp.error_of($$select public.send_media(pg_temp.id('chat'), 'photo', pg_temp.dm_path('00000000-0000-0000-0000-000000000001', 'a.jpg'), 1, 1, null)$$) is not null, 'Sam cannot post into a chat he is not in');

-- Bea can't post Sam's file as hers.
select pg_temp.act_as('00000000-0000-0000-0000-000000000002');
select pg_temp.expect(pg_temp.error_of($$select public.send_media(pg_temp.id('dm'), 'photo', pg_temp.dm_path('00000000-0000-0000-0000-000000000001', 'a.jpg'), 1, 1, null)$$) like '%isn''t yours%', 'Bea cannot post a file Sam uploaded');
select pg_temp.expect(pg_temp.upload(pg_temp.dm_path('00000000-0000-0000-0000-000000000002', 'clip.mp4')), 'Bea uploads a video');
select public.send_media(pg_temp.id('dm'), 'video', pg_temp.dm_path('00000000-0000-0000-0000-000000000002', 'clip.mp4'), 720, 1280, 15000);
select pg_temp.expect((select media_duration_ms from public.messages where kind = 'video' and thread_id = pg_temp.id('dm')) = 15000, 'the video is posted with its length');

-- ---------------------------------------------------------------------
-- 3. Who can see the files
-- ---------------------------------------------------------------------
select pg_temp.expect((select count(*) from storage.objects where bucket_id = 'chat-media' and name like pg_temp.id('dm') || '/%') = 2, 'Bea sees both files in her chat with Sam');
select pg_temp.act_as('00000000-0000-0000-0000-000000000003');
select pg_temp.expect(not exists (select 1 from storage.objects where bucket_id = 'chat-media' and name like pg_temp.id('dm') || '/%'), 'Cas cannot see files from a chat he is not in');
select pg_temp.act_as(null);
select pg_temp.expect(not exists (select 1 from storage.objects where bucket_id = 'chat-media'), 'logged-out visitors see no chat files');

-- A group chat member's upload is visible to the group; leaving hides it.
select pg_temp.act_as('00000000-0000-0000-0000-000000000003');
select pg_temp.expect(pg_temp.upload(pg_temp.id('chat') || '/00000000-0000-0000-0000-000000000003/g.jpg'), 'Cas uploads into the group chat');
select public.send_media(pg_temp.id('chat'), 'photo', pg_temp.id('chat') || '/00000000-0000-0000-0000-000000000003/g.jpg', 800, 800, null);
select pg_temp.act_as('00000000-0000-0000-0000-000000000002');
select pg_temp.expect(exists (select 1 from storage.objects where bucket_id = 'chat-media' and name like pg_temp.id('chat') || '/%'), 'Bea (going) sees the group''s photo');
select public.leave_thread(pg_temp.id('chat'));
select pg_temp.expect(not exists (select 1 from storage.objects where bucket_id = 'chat-media' and name like pg_temp.id('chat') || '/%'), 'after leaving, Bea can no longer see it');

-- ---------------------------------------------------------------------
-- 4. Deleting forgets the file
-- ---------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
select public.delete_message((select id from public.messages where thread_id = pg_temp.id('dm') and kind = 'photo'));
select pg_temp.expect((select media_path is null and deleted_at is not null from public.messages where thread_id = pg_temp.id('dm') and kind = 'photo'), 'a deleted photo message no longer points at the file');
select public.delete_message((select id from public.messages where thread_id = pg_temp.id('dm') and kind = 'video'));
select pg_temp.expect((select media_path is not null from public.messages where thread_id = pg_temp.id('dm') and kind = 'video'), 'Sam cannot delete Bea''s video');

rollback;
