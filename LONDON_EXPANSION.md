# Function across London: LSE, UCL, King's and Imperial

Branch: `london-expansion`. It needs one database change, so it's on its own branch until you've run the SQL.

## How to switch it on

1. Supabase → **SQL Editor** → **New query**.
2. Paste the whole of `supabase/migrations/20261104000000_london_unis.sql` and press **Run**. You should see "Success. No rows returned".
3. On GitHub, merge the `london-expansion` branch (Compare & pull request → Merge).

Do step 2 before step 3. The new code reads columns that the SQL adds.

To check it worked, run this in a new query:

```sql
select university, count(*) from profiles group by 1;
```

Everyone should be on LSE except people with UCL, King's or Imperial emails.

The file also has an optional check at the bottom. It lists anyone already in a society at a different uni. Nothing is changed for them, so you can decide case by case.

## What changed

**Positioning.** The home page now reads "London's student social life, all in one place", with "For students at LSE, UCL, King's and Imperial" underneath. The same wording is used for:
- the site title and description;
- link previews;
- the home-screen app;
- the map description;
- the footer ("Made in London");
- the event-page card ("See what's on in London tonight").

**Universities config.** Everything about the four unis is in `web/src/lib/universities.ts`:
- id
- name
- short name
- landing page
- email domains
- accent colour
- map centre

The database has a matching `universities` table.

| Uni | Short | Page | Emails |
|---|---|---|---|
| London School of Economics | LSE | /lse | @lse.ac.uk |
| University College London | UCL | /ucl | @ucl.ac.uk |
| King's College London | King's | /kings | @kcl.ac.uk |
| Imperial College London | Imperial | /imperial | @imperial.ac.uk, @ic.ac.uk |

Only exact domains count. Subdomains like `@alumni.lse.ac.uk` don't get in, so alumni and staff addresses can't sign up as students.

**Sign-up.** Any of those emails can sign up. Your uni comes from your email and can't be changed. Emails you've allowed on the Admin page get LSE by default, or the uni of the landing page they arrived on, and they pick their uni on the welcome step. Any other email gets: "Function is for students at LSE, UCL, King's and Imperial. Use your uni email, or the email you were invited with."

**Existing accounts and societies.**
- Everyone already signed up is now tagged with a uni: from their email if it's a uni email, otherwise LSE.
- Societies already had a uni. Any without one were LSE.
- Nothing else about accounts changes.

**Welcome step.**
- It says "Welcome to Function at [Uni]!".
- "Find your societies at [Uni]" shows up to 8 of that uni's societies.
- It says "Plus open socials across [the other three]".
- "Coming up" lists their uni's events first, then events open to all London students and socials, so it's never empty.
- Society and event counts only show at 10+ societies or 5+ upcoming events. Change these numbers in `universities.ts`.

**Uni landing pages.**
- /lse, /ucl, /kings and /imperial each say "[Uni]'s student social life, all in one place" and have a "Join with your [Uni] email" button.
- Arriving on one remembers the uni for 30 days, and the login box then shows "you@kcl.ac.uk" and so on.
- The main page stays London-wide.

**Societies are for their own uni.** This is enforced in the database, not just hidden on screen. For students from another uni:
- No join button on the society's page. Instead it says "This society is for LSE students. You can still go to its events that are open to all London students."
- The database refuses their join request, a follow, and a request to manage the society.
- If the committee adds their email under "Add members", it is skipped and listed back as not added.
- The Societies page and search start on your own uni, with LSE / UCL / King's / Imperial chips to look at the others.
- Logged-out visitors see LSE first, labelled as LSE.
- The Admin page's "add a society" form now asks which uni it belongs to.

**Who can see a society's event.** Committees choose this when posting:
- **Members only:** only approved members see it and can join.
- **[Uni] students** (the default): every student at the society's uni. Logged-out visitors see it too, so shared links and the landing pages work, but they must log in with that uni's email to join.
- **Open to all London students:** students from all four unis can see and join it.

Existing events are now "[Uni] students". The old "Members only" tick box, which limits joining, is kept as "Only members can join", so existing members-only events keep working as before. The event page now shows "Who can come".

**Map.**
- It opens on your own uni, and the button shows your uni's short name.
- Logged out, it opens on LSE.
- The "London" button zooms out far enough to show all four campuses.
- The place search starts near your uni.

**Uni prompts.** The LSE and UCL prompts are kept. To add King's or Imperial prompts, open `web/src/lib/prompts.ts` and add a prompt with `uni: "KCL"` or `uni: "Imperial"`. A per-uni example works the same way through `examples`.

## Things to know

- **Logged-out visitors can see "[Uni] students" events.** A student at another uni could log out to see one, but they still can't join. This keeps share links working.
- **The event location list only has LSE buildings and halls.** It's labelled "LSE campus" / "LSE halls" because that's what it holds. Other unis' societies can use "Somewhere else" and the map search, or the "Other universities" list. I can add each uni's buildings later.
- **The building search** ("Marshall Building", "SAW" and so on) only knows LSE names. Address and postcode search works everywhere.

## Outside the code (for you to update)

- **The Supabase login email.** Authentication → Email Templates: check the wording doesn't say LSE.
- **App store listing and description**, if or when you list it: "London's student social life, all in one place. Societies, events and socials for students at LSE, UCL, King's and Imperial, on one live map."
- **Instagram, TikTok and other bios:** the same line, with links to the uni pages, e.g. studentfunction.com/kings.
- **The iPhone install image** (`web/public/function-iphone-story.png`) still shows the old address student-function.vercel.app.
- **Email signatures and any posters** that say "LSE only".
- **Vercel:** nothing to change.
