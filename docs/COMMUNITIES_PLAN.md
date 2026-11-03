# Communities: the agreed plan

Approved by Rhys on Tue 3 Nov 2026. First community: **UCL Abacus**, onboarding
Sun 8 Nov 2026. This is the plan the build follows; change it here first if
anything changes.

## What a community is

A reusable group a client runs inside Function. Everything that makes it
"theirs" (name, web address, bio, image, banner, role colours, wording) comes
from the database, so the next community needs no code.

- **Main area:** a banner (image, name, bio) and the community's main group
  chat.
- **Sub-groups** (the first is "AbaFam"): created by admins and committee, each
  with its own chat and its own members.
- **Tickets:** a marketplace tab. Phase 2; says "coming soon" until then.
- **Manage:** admins and committee only.

A community can optionally be linked to an existing society (UCL Abacus is
linked to the existing UCL ABACUS society, which keeps its events). Society
membership and community membership are separate.

## Roles

Each person in a community has a **role** and a **membership**, stored
separately:

| Role | Can do |
|---|---|
| Admin | Everything: settings, name, colours, roles, confirm paying members, remove anyone (except the last admin), everything committee can do |
| Committee | Edit banner, bio and image; create, rename and archive sub-groups and choose their members; approve join requests (as non-member only); remove regular people |
| Regular | Chat in the main chat; chat in the sub-groups they've been added to |

| Membership | Meaning |
|---|---|
| member | A paying member, confirmed by an admin |
| non_member | Everyone else (the default) |

Decisions (Rhys, 3 Nov):
- Only admins confirm a paying-member claim. Admins approve a request as
  member or as non-member; committee approvals are always non-member (the
  person's claim stays visible so an admin can confirm it later).
- Only admins can remove committee members (and other admins). Committee can
  remove regular people only.
- Admins and committee can see every sub-group and add themselves to any of
  them; adding yourself is visible to the group (you appear in its members and
  a "joined" line appears in the chat). They can't read a sub-group's messages
  without being in it.
- Marketplace transfer records are visible to community **admins only** (plus
  the buyer, the seller and the Function team).

Safety rules:
- Nobody changes their own role or membership (Function admins excepted).
- The last admin can't be demoted, removed or leave.
- Someone removed can't rejoin through the link.
- Nicknames are unique within a community (ignoring case), 1 to 30 characters,
  and can't be (or impersonate) "Admin", "Committee", "Member", "Moderator" or
  "Function".
- Role tags come from the role itself, never from the nickname.
- Emails are never shown to anyone but the Function team.
- Function admins (`is_motive_admin()`) can do everything in every community,
  create communities and set their first admins.

## Role colours

Stored in `communities.settings.role_colours`. Defaults (checked for
readability on the app's light and dark backgrounds):

| Role | Light | Dark |
|---|---|---|
| Admin, gold | `#8A5A00` | `#F5C04A` |
| Committee, dark red | `#7A1010` | `#FF5A5A` |
| Member, lighter red | `#C4362E` | `#FFB8B3` |
| Non-member, grey | `#6B6B73` | `#9A9AA3` |

Precedence: admin, then committee, then member, then non-member. Names also
get a small text tag ("Admin", "Committee", "Member") so colour is never the
only cue.

## Joining

- One public join link per community: `https://studentfunction.com/c/<slug>/join`
  (the QR code is the same link; it doesn't need to be secret because every
  join needs approval). `?ref=<user id>` records who shared it.
- Join screen: the community's banner, a nickname box (pre-filled from the
  profile nickname, shown in community chats), and a checkbox
  "I'm a paying member of {community name}". Submitting creates a pending
  request; then a "waiting for approval" screen.
- Logged-out visitors see the community's name and image, then log in or sign
  up and come back to the join screen.

## Database (Phase 1)

All rules are enforced in the database (RLS and security definer functions);
the app's screens only mirror them.

- `communities` (id, slug, name, bio, image_url, banner_url, society_id,
  settings jsonb, created_by, created_at, updated_at).
- `community_members` (community_id, user_id, nickname, role, membership,
  membership_claimed, status pending|active|declined|removed|left, requested_at,
  decided_by, decided_at, membership_confirmed_by, membership_confirmed_at,
  referred_by, updated_at).
- `community_groups` (id, community_id, name, description, kind main|sub,
  image_url, sort, created_by, created_at, archived_at). One main group per
  community.
- `community_group_members` (group_id, user_id, added_by, added_at).
- `threads.community_group_id` (each group has one chat) and a stored,
  generated `threads.kind` ('event', 'social', 'direct', 'community').
- `thread_participants` (thread_id, user_id, joined_at): who is in each
  community chat, kept up to date by triggers. This is what makes 1,000-person
  chats fast.
- `thread_mutes` (thread_id, user_id, muted_until; null = always), for every
  kind of chat.
- Writes go through server functions that take the community (or group) id,
  check the caller's role in that community, and lock the rows they change so
  two admins acting at once can't break the rules.

The existing chat functions decide a chat's kind by which fields are empty;
each one gets a community branch (thread_member, my_threads, push_on_message,
may_pin, may_share_events, is_thread_admin, leave_thread, delete_message,
thread_members, email_on_report, and any other function that reads threads).

## Chat at 1,000+ members

- **Live updates:** Supabase Realtime "broadcast from database". A trigger on
  messages sends only `{id, op}` to the private topic `thread:<thread id>`; the
  app then fetches the message through the normal permission rules (so blocked
  people's and deleted messages never leak). RLS on `realtime.messages` lets
  only people who can use the chat listen. Subscriptions are removed when you
  leave a chat; after the app returns from the background or reconnects it
  catches up page by page, with a slow backup check (30 to 60 seconds) while
  the live connection is down. "Allow public access" is switched off in the
  project's Realtime settings.
- **History:** pages of 50 (newest first, "load older"), keyset by
  (created_at, id) with a matching index.
- **Mute:** 1 hour, 8 hours, 1 week, always. Muted chats send no
  notifications but still count unread.
- **Notifications:** fan out to everyone in the chat in one database step,
  skipping muted, blocked and banned people and anyone who turned chat
  notifications off; the community nickname in the text; send-push keeps
  claiming until the queue is empty and sends to Expo in parallel batches of
  100; dead phone tokens are deleted (already exists).

## Screens (Phase 1)

- `/c/[slug]`: banner, then tabs Chat (main chat), Groups, Tickets ("coming
  soon"), Manage (admins and committee).
- `/c/[slug]/join`: the join screen above.
- `/c/[slug]/manage`: requests (with the paying-member claim shown; Approve as
  member / Approve as non-member / Decline), members and roles, confirm
  membership, remove people, sub-groups (create, add/remove members), banner,
  bio and image, the invite link and QR code.
- Chats tab: community chats appear as rows ("UCL Abacus", "UCL Abacus ·
  AbaFam").
- Societies tab: a "Your communities" row.
- Admin panel: create a community, set its first admins.

## Phases

**Phase 1, for Sun 8 Nov:** the database work (with the existing chat functions
fixed and tested), the community page, join flow, approvals, membership
confirmation and roles, AbaFam, banner and bio editing, invite link and QR
code, role colours and tags, live chat, history paging, mute, the notification
fixes, the Tickets tab saying "coming soon", and UCL Abacus set up.

If it slips, cut in this order: (1) mute becomes on/off only; (2) roles set by
the Function team instead of a role screen; (3) banner and bio set by the
Function team; (4) last resort: the main chat keeps polling on Sunday, with live
updates following over the air.

**Straight after (week of 9 Nov):** virtualised chat list (with "jump to pinned
message" reworked), WhatsApp-style grouping in the Chats tab, skipping people
currently viewing a chat, Expo delivery receipts and retries, a colour editor.

**Phase 2 (about 10 to 21 Nov): the marketplace.** Selling and Wanted listings
(face value and restrictions shown on Selling listings), offers, a private chat
per listing and person, accept or decline, "Mark as sent", a transfers table
visible to community admins only, "Sold" / "n left", ticket files in a separate
private storage bucket, and an optional face-value cap setting. Payments
happen outside the app.

**Phase 3:** in-app payments, more communities and discovering them, moving the
old event and plan chats onto participants.

## Still to come from Rhys

UCL Abacus's bio, logo and banner image, and the first admins (the presidents).
