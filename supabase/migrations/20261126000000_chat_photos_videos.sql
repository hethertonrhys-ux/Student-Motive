-- Photos and videos in chats.
--
-- Builds on 20261125000000_share_events_in_chats.sql (run that first).
--
--   1. A private storage bucket, chat-media, for the files. Each file lives
--      at <chat id>/<sender id>/<random name>. Only people who can use the
--      chat can see its files (the app asks for a link that expires after
--      an hour), and you can only upload into a chat you're in, under your
--      own name. 50 MB per file at most; photos (JPEG, PNG, WebP, HEIC) and
--      videos (MP4, MOV, WebM) only.
--   2. messages.media_path (and its size and length), and two new message
--      kinds, 'photo' and 'video'.
--   3. send_media(): posts the photo or video once it's uploaded. It checks
--      you're in the chat and that the file is yours, in that chat, and
--      really there. The text ("Sent a photo") is what older app versions
--      and notifications show.
--   4. Deleting a message also forgets its photo or video, so nobody can
--      open it afterwards.
--
-- Safe to run twice.

-- 1. The bucket and who can use it.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-media', 'chat-media', false, 52428800,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'video/mp4', 'video/quicktime', 'video/webm'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- The chat a file belongs to (its first folder), or null if the name isn't one of ours.
create or replace function public.chat_media_thread(object_name text)
returns uuid
language plpgsql immutable set search_path = ''
as $$
declare
  first text := split_part(object_name, '/', 1);
begin
  if first ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return first::uuid; end if;
  return null;
end;
$$;
grant execute on function public.chat_media_thread(text) to authenticated;

drop policy if exists chat_media_select on storage.objects;
create policy chat_media_select on storage.objects for select to authenticated
  using (bucket_id = 'chat-media' and public.can_use_thread(public.chat_media_thread(name)));

drop policy if exists chat_media_insert on storage.objects;
create policy chat_media_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'chat-media'
    and split_part(name, '/', 2) = (select auth.uid())::text
    and public.can_use_thread(public.chat_media_thread(name))
  );

-- 2. Photos and videos in messages.
alter table public.messages add column if not exists media_path text;
alter table public.messages add column if not exists media_width integer;
alter table public.messages add column if not exists media_height integer;
alter table public.messages add column if not exists media_duration_ms integer;
alter table public.messages drop constraint if exists messages_kind_check;
alter table public.messages add constraint messages_kind_check check (kind in ('message', 'left', 'rejoined', 'event', 'photo', 'video'));

-- 3. Posting it.
create or replace function public.send_media(tid uuid, media_kind text, path text, width integer, height integer, duration_ms integer)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  mid uuid;
begin
  if uid is null then raise exception 'Log in first'; end if;
  if media_kind not in ('photo', 'video') then raise exception 'Send a photo or a video'; end if;
  if not public.can_use_thread(tid) then raise exception 'You can''t send messages here'; end if;
  if path is null or split_part(path, '/', 1) <> tid::text or split_part(path, '/', 2) <> uid::text or split_part(path, '/', 3) = '' or split_part(path, '/', 4) <> '' then
    raise exception 'That file isn''t yours';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'chat-media' and o.name = path) then
    raise exception 'The upload didn''t finish. Try again.';
  end if;
  insert into public.messages (thread_id, sender_id, body, kind, media_path, media_width, media_height, media_duration_ms)
  values (tid, uid, case when media_kind = 'photo' then 'Sent a photo' else 'Sent a video' end, media_kind, path,
          nullif(greatest(width, 0), 0), nullif(greatest(height, 0), 0), nullif(greatest(duration_ms, 0), 0))
  returning id into mid;
  update public.threads set last_message_at = now() where id = tid;
  insert into public.thread_reads (thread_id, user_id, last_read_at) values (tid, uid, now())
  on conflict (thread_id, user_id) do update set last_read_at = now();
  return mid;
end;
$$;
revoke execute on function public.send_media(uuid, text, text, integer, integer, integer) from public, anon;
grant execute on function public.send_media(uuid, text, text, integer, integer, integer) to authenticated;

-- 4. Deleting a message (20261020000000_social.sql) also forgets its photo or video.
create or replace function public.delete_message(mid uuid)
returns void
language sql security definer set search_path = ''
as $$
  update public.messages set deleted_at = now(), body = '(deleted)', media_path = null
  where id = mid and (sender_id = (select auth.uid()) or public.is_motive_admin());
$$;
