# Function

London's student social life, all in one place: societies, events, socials
and communities for students at London universities.

**New here? Start with [docs/HANDOVER.md](docs/HANDOVER.md)** (where
everything stands and what's waiting), then [CLAUDE.md](CLAUDE.md) and
[docs/CLAUDE_CHATS.md](docs/CLAUDE_CHATS.md) to work on it with Claude Code.

| Folder | What it is |
|---|---|
| `apps/mobile/` | The app (Expo / React Native). Also the website, studentfunction.com (Vercel project `function-app`). |
| `packages/shared/` | Code shared by the app and website, with its unit tests. |
| `supabase/` | Database (migrations, tests), edge functions, one-off set-up files, and `staging/` for the test project. |
| `apps/web/` | The old Next.js website, kept only as a rollback. |
| `tools/browser-tests/` | Browser tests used during the build, kept for reference. |
| `docs/` | Plans, reports and guides. |
