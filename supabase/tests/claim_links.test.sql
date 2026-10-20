-- 20261118000000_society_claim_links.sql: instant claim links.
--
--   K  claim-k  LSE, no manager (the links are for this one)
--   M  claim-m  LSE, managed by Sam
reset role;
insert into public.societies (id, slug, name, university) values
  ('30000000-0000-0000-0000-000000000001', 'claim-k', 'Claim K Society', 'LSE'),
  ('30000000-0000-0000-0000-000000000002', 'claim-m', 'Claim M Society', 'LSE')
on conflict do nothing;
insert into public.society_admins (society_id, user_id) values
  ('30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001')
on conflict do nothing;
-- Bea had already asked to manage K the old way.
insert into public.society_claims (society_id, user_id, committee_role) values
  ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'President');

-- The error message a statement raises (null if it works).
create or replace function pg_temp.error_of(statement text) returns text language plpgsql as $$
begin
  execute statement;
  return null;
exception when others then
  return sqlerrm;
end $$;

-- 1. Only Function admins can make a link.
select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
select pg_temp.expect(pg_temp.fails($$select public.create_society_claim_link('30000000-0000-0000-0000-000000000001')$$), 'a student cannot make a link');
select pg_temp.expect(pg_temp.fails($$select public.create_society_claim_link('30000000-0000-0000-0000-000000000002')$$), 'a manager cannot make a link for their own society');
select pg_temp.act_as(null);
select pg_temp.expect(pg_temp.fails($$select public.create_society_claim_link('30000000-0000-0000-0000-000000000001')$$), 'a logged-out visitor cannot make a link');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a0');
select pg_temp.expect(pg_temp.fails($$select public.create_society_claim_link('30000000-0000-0000-0000-0000000000ff')$$), 'no link for a society that doesn''t exist');
select set_config('test.tok', (select c.token from public.create_society_claim_link('30000000-0000-0000-0000-000000000001') c), false);
select pg_temp.expect(current_setting('test.tok') ~ '^[0-9a-f]{64}$', 'the secret is 64 lowercase hex characters');
select set_config('test.tok2', (select c.token from public.create_society_claim_link('30000000-0000-0000-0000-000000000001') c), false);
select set_config('test.tok3', (select c.token from public.create_society_claim_link('30000000-0000-0000-0000-000000000001') c), false);
select pg_temp.expect(current_setting('test.tok') <> current_setting('test.tok2') and current_setting('test.tok2') <> current_setting('test.tok3'), 'every secret is different');

-- 2. Only the hash is stored, never the secret.
reset role;
select pg_temp.expect((select count(*) from public.society_claim_links c where c::text like '%' || current_setting('test.tok') || '%') = 0, 'no column holds the secret');
select pg_temp.expect((select count(*) from public.society_claim_links c
  where c.token_hash = encode(sha256(convert_to(current_setting('test.tok'), 'UTF8')), 'hex')
    and c.society_id = '30000000-0000-0000-0000-000000000001'
    and c.created_by = '00000000-0000-0000-0000-0000000000a0'
    and c.expires_at between now() + interval '7 days' - interval '1 minute' and now() + interval '7 days' + interval '1 minute'
    and c.used_by is null and c.used_at is null and c.revoked_at is null) = 1, 'the link stores its hash, who made it, and expires in 7 days');

-- 3. Only Function admins can read the links; nobody writes to them directly.
select pg_temp.act_as('00000000-0000-0000-0000-000000000002');
select pg_temp.expect((select count(*) from public.society_claim_links) = 0, 'a student sees no links');
select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
select pg_temp.expect((select count(*) from public.society_claim_links) = 0, 'a society manager sees no links');
select pg_temp.act_as(null);
select pg_temp.expect(pg_temp.fails($$select count(*) from public.society_claim_links$$), 'a logged-out visitor cannot read links');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a0');
select pg_temp.expect((select count(*) from public.society_claim_links where society_id = '30000000-0000-0000-0000-000000000001') = 3, 'a Function admin sees the links');
select pg_temp.expect(pg_temp.fails($$select token_hash from public.society_claim_links$$), 'not even a Function admin reads the hashes');
select pg_temp.expect(pg_temp.fails($$insert into public.society_claim_links (society_id, token_hash, expires_at) values ('30000000-0000-0000-0000-000000000001', 'x', now() + interval '1 day')$$), 'a Function admin cannot insert a link directly');
select pg_temp.expect(pg_temp.fails($$update public.society_claim_links set expires_at = now() + interval '1 year'$$), 'a Function admin cannot change a link directly');
select pg_temp.expect(pg_temp.fails($$delete from public.society_claim_links$$), 'a Function admin cannot delete a link directly');
select pg_temp.act_as('00000000-0000-0000-0000-000000000002');
select pg_temp.expect(pg_temp.fails($$update public.society_claim_links set used_by = '00000000-0000-0000-0000-000000000002', used_at = now()$$), 'a student cannot mark a link used');

-- 4. Anyone, even logged out, can see what a ready link is for.
select pg_temp.act_as(null);
select pg_temp.expect((select status = 'ready' and society_name = 'Claim K Society' and society_slug = 'claim-k' and university = 'LSE' and society_id = '30000000-0000-0000-0000-000000000001' and expires_at > now()
  from public.claim_link_info(current_setting('test.tok'))), 'a logged-out visitor sees a ready link and its society');

-- 5. Bea uses it: she becomes a manager of K, and the link is marked used.
select pg_temp.act_as('00000000-0000-0000-0000-000000000002');
select pg_temp.expect(public.redeem_society_claim_link(current_setting('test.tok')) = '30000000-0000-0000-0000-000000000001', 'redeeming returns the society');
reset role;
select pg_temp.expect(exists (select 1 from public.society_admins where society_id = '30000000-0000-0000-0000-000000000001' and user_id = '00000000-0000-0000-0000-000000000002'), 'Bea is now a manager of K');
select pg_temp.expect((select used_by = '00000000-0000-0000-0000-000000000002' and used_at > now() - interval '1 minute'
  from public.society_claim_links where token_hash = encode(sha256(convert_to(current_setting('test.tok'), 'UTF8')), 'hex')), 'the link records who used it and when');
select pg_temp.expect((select is_admin from public.profiles where id = '00000000-0000-0000-0000-000000000002') = false, 'Bea is still not a Function admin');
select pg_temp.expect((select status = 'approved' and reviewed_at is not null from public.society_claims
  where society_id = '30000000-0000-0000-0000-000000000001' and user_id = '00000000-0000-0000-0000-000000000002'), 'Bea''s old request is marked approved');
select pg_temp.expect((select count(*) from public.society_admins where society_id = '30000000-0000-0000-0000-000000000001') = 1, 'only Bea manages K');

-- 6. Bea opening it again is fine (refreshing the page).
select pg_temp.act_as('00000000-0000-0000-0000-000000000002');
select pg_temp.expect(public.redeem_society_claim_link(current_setting('test.tok')) = '30000000-0000-0000-0000-000000000001', 'redeeming again returns the society');
select pg_temp.expect((select status from public.claim_link_info(current_setting('test.tok'))) = 'used_by_you', 'Bea sees the link as used by her');

-- 7. Nobody else can use it, and they aren't told who did.
select pg_temp.act_as('00000000-0000-0000-0000-000000000003');
select pg_temp.expect(pg_temp.error_of(format('select public.redeem_society_claim_link(%L)', current_setting('test.tok'))) like '%already been used%', 'a second person cannot use the link');
select pg_temp.expect((select status from public.claim_link_info(current_setting('test.tok'))) = 'used', 'Cas sees the link as used');
select pg_temp.act_as(null);
select pg_temp.expect((select status from public.claim_link_info(current_setting('test.tok'))) = 'used', 'a logged-out visitor sees the link as used');
reset role;
select pg_temp.expect(not exists (select 1 from public.society_admins where society_id = '30000000-0000-0000-0000-000000000001' and user_id = '00000000-0000-0000-0000-000000000003'), 'Cas is not a manager of K');

-- 8. An expired link can't be used.
update public.society_claim_links set expires_at = now() - interval '1 hour'
  where token_hash = encode(sha256(convert_to(current_setting('test.tok2'), 'UTF8')), 'hex');
select pg_temp.act_as('00000000-0000-0000-0000-000000000003');
select pg_temp.expect((select status from public.claim_link_info(current_setting('test.tok2'))) = 'expired', 'an expired link says so');
select pg_temp.expect(pg_temp.error_of(format('select public.redeem_society_claim_link(%L)', current_setting('test.tok2'))) like '%expired%', 'an expired link cannot be used');
reset role;
select pg_temp.expect(not exists (select 1 from public.society_admins where society_id = '30000000-0000-0000-0000-000000000001' and user_id = '00000000-0000-0000-0000-000000000003'), 'Cas is still not a manager after an expired link');

-- 9. Only Function admins can cancel a link; a cancelled link can't be used.
select set_config('test.link3', (select id::text from public.society_claim_links where token_hash = encode(sha256(convert_to(current_setting('test.tok3'), 'UTF8')), 'hex')), false);
select set_config('test.link1', (select id::text from public.society_claim_links where token_hash = encode(sha256(convert_to(current_setting('test.tok'), 'UTF8')), 'hex')), false);
select pg_temp.act_as('00000000-0000-0000-0000-000000000001');
select pg_temp.expect(pg_temp.fails(format('select public.revoke_society_claim_link(%L)', current_setting('test.link3'))), 'a student cannot cancel a link');
select pg_temp.act_as(null);
select pg_temp.expect(pg_temp.fails(format('select public.revoke_society_claim_link(%L)', current_setting('test.link3'))), 'a logged-out visitor cannot cancel a link');
reset role;
select pg_temp.expect((select revoked_at is null from public.society_claim_links where id = current_setting('test.link3')::uuid), 'the link is still live');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a0');
select public.revoke_society_claim_link(current_setting('test.link3')::uuid);
select public.revoke_society_claim_link(current_setting('test.link1')::uuid);
reset role;
select pg_temp.expect((select revoked_at is not null from public.society_claim_links where id = current_setting('test.link3')::uuid), 'a Function admin cancelled the link');
select pg_temp.expect((select revoked_at is null from public.society_claim_links where id = current_setting('test.link1')::uuid), 'a used link cannot be cancelled');
select pg_temp.act_as('00000000-0000-0000-0000-000000000003');
select pg_temp.expect((select status from public.claim_link_info(current_setting('test.tok3'))) = 'revoked', 'a cancelled link says so');
select pg_temp.expect(pg_temp.error_of(format('select public.redeem_society_claim_link(%L)', current_setting('test.tok3'))) like '%cancelled%', 'a cancelled link cannot be used');

-- 10. Malformed or unknown secrets.
select pg_temp.act_as(null);
select pg_temp.expect((select status = 'unknown' and society_id is null and society_name is null from public.claim_link_info('not-a-token')), 'a malformed secret is unknown');
select pg_temp.expect((select status from public.claim_link_info(upper(current_setting('test.tok3')))) = 'unknown', 'an upper-case secret is unknown');
select pg_temp.expect((select status from public.claim_link_info(repeat('a', 64))) = 'unknown', 'a well-formed secret with no link is unknown');
select pg_temp.expect((select status from public.claim_link_info(null)) = 'unknown', 'no secret is unknown');
select pg_temp.expect((select count(*) from public.claim_link_info('x')) = 1, 'always exactly one row');
select pg_temp.act_as('00000000-0000-0000-0000-000000000003');
select pg_temp.expect(pg_temp.error_of($$select public.redeem_society_claim_link('not-a-token')$$) like '%isn''t valid%', 'a malformed secret cannot be used');
select pg_temp.expect(pg_temp.error_of(format('select public.redeem_society_claim_link(%L)', repeat('b', 64))) like '%isn''t valid%', 'an unknown secret cannot be used');

-- 11. Logged out, you can't use a link (making and cancelling are checked above).
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a0');
select set_config('test.tok4', (select c.token from public.create_society_claim_link('30000000-0000-0000-0000-000000000001') c), false);
select pg_temp.act_as(null);
select pg_temp.expect(pg_temp.fails(format('select public.redeem_society_claim_link(%L)', current_setting('test.tok4'))), 'a logged-out visitor cannot use a link');
select pg_temp.expect((select status from public.claim_link_info(current_setting('test.tok4'))) = 'ready', 'and the link is still ready');

-- 12. Making a link returns its id with the secret (the admin page uses the
--     id to know which link it is showing).
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a0');
select set_config('test.made5', (select c.id::text || ':' || c.token from public.create_society_claim_link('30000000-0000-0000-0000-000000000001') c), false);
reset role;
select pg_temp.expect((select c.id::text from public.society_claim_links c
  where c.token_hash = encode(sha256(convert_to(split_part(current_setting('test.made5'), ':', 2), 'UTF8')), 'hex')) = split_part(current_setting('test.made5'), ':', 1), 'the id returned is the new link''s id');
