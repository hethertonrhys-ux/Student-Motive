# Motive website

The society side of Motive: landing pages (London-wide, plus /lse, /ucl, /kings and /imperial), uni email login, society dashboard, admin page and public event pages.
Built with Next.js (App Router) and Supabase.

## Run it on your computer

1. In PowerShell, go to this folder: `cd $HOME\Documents\student-motive\web`
2. First time only: `npm install`
3. First time only: copy `.env.example` to `.env.local` and fill in the values (see the comments in it).
4. Start it: `npm run dev`
5. Open http://localhost:3000

Press `Ctrl + C` in PowerShell to stop it.

## Pages

| Page | What it is |
|---|---|
| `/` | Landing page |
| `/lse`, `/ucl`, `/kings`, `/imperial` | Each uni's landing page (remembers the uni for sign-up) |
| `/login` | Log in with an LSE, UCL, King's or Imperial email and a code |
| `/dashboard` | Societies you manage |
| `/dashboard/claim` | Ask to manage a society |
| `/dashboard/[id]` | A society's events, "going" numbers, and details |
| `/dashboard/[id]/events/new` | Post an event |
| `/admin` | Motive team only: approve requests, handle reports, add societies |
| `/e/[id]` | Public event page (the link societies share) |
| `/s/[slug]` | Public society page |
| `/privacy`, `/terms`, `/support` | Legal and help pages (drafts) |

## Where things live

- `src/app/`: pages (each folder is a URL)
- `src/lib/`: shared code (database connection, login checks, UK time handling)
- `src/components/`: shared pieces (header, footer, buttons)
- `src/proxy.ts`: runs before every page; keeps you logged in and protects private pages
