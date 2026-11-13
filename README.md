# 🕹 THE VAULT

A **private, password-protected game distribution site** for you and a few friends.
Astro (static) + GitHub Pages on the front, Supabase on the back, zero hosting cost.

> All games distributed through this site are your own original work. The site is
> locked behind Supabase Auth: anonymous visitors see nothing but the login screen,
> and every table is protected by Row Level Security.

---

## ✨ Features

| Area | What you get |
|---|---|
| **Auth** | Email + password login (Supabase Auth), no public sign-up, persistent sessions |
| **Library** | Card grid with cover art, tags, platform badges, latest version, file size |
| **Search** | Fuzzy search over title / description / tags |
| **Filters** | Multi-select tags (ANY/ALL toggle), platform filter |
| **Sorting** | Title A–Z / Z–A, newest release, recently updated, **group by tag** |
| **Detail page** | Full description, complete version history (markdown changelogs), per-platform downloads, screenshots, external links, SHA256 with copy button |
| **Providers** | Per-file choice: `github` (GitHub Release asset, ≤ 2 GB) or `mediafire` (MediaFire page link, > 2 GB) — every entry stores provider, URL, size, platform, optional SHA256, optional multi-part list |
| **Ratings** | 1–5 star widget stored in Supabase (`ratings`, one per user per game) |
| **Comments** | Giscus (GitHub Discussions) per game |
| **Admin console** | Full CRUD for games / tags / versions / downloads, cover upload to Supabase Storage, download logs ("who downloaded what, when"), Discord announcement button |
| **Notifications** | Supabase Edge Function → Discord webhook on new-game announcements |
| **Design** | Cyberpunk × steampunk: CRT scanlines, neon glow, brass rivets, rotating gears — fully responsive |

---

## 1 · Prerequisites

- A GitHub account
- A free [Supabase](https://supabase.com) project
- Node.js ≥ 20 locally (`sudo pacman -S nodejs npm` / `winget install OpenJS.NodeJS.LTS`)

## 2 · Supabase setup (≈ 10 minutes)

1. Create a project at supabase.com, then open **SQL Editor → New query**, paste the
   entire contents of [`supabase/schema.sql`](supabase/schema.sql) and **Run**.
   This creates every table, RLS policy, trigger, and the `covers` storage bucket.
2. **Settings → API**: copy the *Project URL* and the *anon public* key.
3. **Authentication → Sign In / Providers → Email**:
   - ❌ disable **Allow new users to sign up**  ← critical: no public accounts
   - ❌ disable **Confirm email** (your friends get in instantly)

### Create the accounts

Run for each friend (and yourself):

```bash
SUPABASE_URL=https://YOURPROJECT.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=eyJ... \
node scripts/create-user.mjs friend@example.com "S3cretPass!" "Nickname"
```

(The service-role key is under Settings → API. Keep it secret — it bypasses RLS.)

Then make yourself the admin:

```sql
-- SQL Editor
update public.profiles set is_admin = true
 where id = (select id from auth.users where email = 'you@example.com');
```

## 3 · Local development

```bash
cd game-vault
npm install
cp .env.example .env        # fill in PUBLIC_SUPABASE_URL + PUBLIC_SUPABASE_ANON_KEY
npm run dev                 # → http://localhost:4321
```

Log in with one of the accounts you created, open **⚙ Admin** (admin account only),
and start adding games:

1. **Games tab** → "＋ new" → fill title/description/tags/platforms, upload a cover → Save.
2. **Versions & Files tab** → pick the game → "＋ new version" (version string, date, changelog) → for each platform click **＋ add download file**, choose the **provider** (`github` for ≤ 2 GB, `mediafire` for > 2 GB), paste the URL, enter the size in bytes, optionally the SHA256 and multi-part list.

> **Provider rule of thumb:** GitHub Release assets max out at 2 GiB per file —
> put small files there (fast, direct download). Anything bigger goes to MediaFire;
> the site shows a dedicated "Download from MediaFire" button with a note about
> the extra click.

## 4 · Deploy to GitHub Pages

1. Push this folder to a GitHub repository (its code should be **public** so Pages
   can serve it — your game *data* stays private behind Supabase RLS, only the
   empty UI shell is public).

2. Turn on Pages: **repo → Settings → Pages → Source: GitHub Actions**.

3. Add repo **Settings → Secrets and variables → Actions → New repository secret**:
   - `PUBLIC_SUPABASE_URL`
   - `PUBLIC_SUPABASE_ANON_KEY`
   - (optional giscus secrets, see below)

4. Point the deployment at your URL — edit two lines in
   [`astro.config.mjs`](astro.config.mjs):
   ```js
   site: 'https://YOURUSERNAME.github.io',
   base: '/',            // ← '/repo-name/' if the repo is NOT <username>.github.io
   ```

5. Commit & push. The workflow (`.github/workflows/deploy.yml`) builds and deploys
   automatically. Share `https://youruser.github.io/repo-name/` with your friends.

### Giscus comments (optional)

- Use the **public** repo above → enable **Settings → Discussions**.
- Install the giscus app: https://github.com/giscus/install → pick the repo.
- Go to https://giscus.app, fill the form, and copy `data-repo`, `data-repo-id`,
  `data-category-id` into your repo secrets as `PUBLIC_GISCUS_*`.
- ⚠️ Note: giscus discussions live in your public repo's Discussions tab — the game
  titles will be visible there. Skip giscus if you want zero metadata exposure;
  the site hides the comment section automatically when unconfigured.

## 5 · Discord announcements (optional)

```bash
# in Discord: Server Settings → Integrations → Webhooks → New Webhook → copy URL
supabase functions deploy notify-new-game
supabase secrets set DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/…
```

Then, in the admin console, press **📣** on any game row to blast a neon
"NEW GAME" embed into your channel. The function verifies the caller is an admin.

## 6 · Hardening notes

- **What's public:** the static UI shell (no game data inside — every page
  fetches from Supabase after login), and cover images in the public
  `covers` storage bucket. Game titles/descriptions/versions/files are **not**
  public.
- If you want covers private too: make the bucket private in Storage, then render
  them via signed URLs (small code change — fetch `createSignedUrl` for each cover).
- Deep links like `/game/your-game-slug` work via the `404.html` SPA-shim; the
  canonical in-app URLs are `/?g=slug`.
- Supabase free tier allows 5 GB bandwidth/month — MediaFire hosting for the big
  files keeps you comfortably under it.

---

## Project layout

```
game-vault/
├── astro.config.mjs              # site/base config for GitHub Pages
├── supabase/
│   ├── schema.sql                # tables, RLS, triggers, storage — run once
│   └── functions/notify-new-game # Discord webhook edge function
├── scripts/create-user.mjs       # admin-only account provisioning
├── src/
│   ├── layouts/Base.astro        # nav, CRT overlay, fonts
│   ├── pages/                    # index (library) / game / login / admin / 404
│   ├── scripts/                  # client apps (vanilla JS + supabase-js)
│   ├── lib/                      # supabase client, auth guard, data & utils
│   └── styles/global.css         # Tailwind v4 theme + retro design system
└── .github/workflows/deploy.yml  # build & deploy on push to main
```
