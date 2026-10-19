# Vibz Music Factory

Internal tool for generating and curating songs for Vibz: write a brief, get an AI-made
Suno style prompt + lyrics, generate in Suno, listen, keep the good ones and publish them to
the Vibz music library (`music_tracks`).

Lives at **https://musicfactory.vibz.world**. Same Supabase project as the other Vibz apps.

## Access

No login screen. The session is the shared `.vibz.world` cookie written by `enter.vibz.world`
(same cookie code as Vibz_Admin_App). Access requires `users.is_super_admin` AND the
`music-factory` section in `admin_permissions` (granted in the Vibz Admin app, Permissions page).
The app must be served from a `*.vibz.world` host; `localhost` cannot read the cookie, so local
dev shows the login modal.

## Setup

```
npm install
cp .env.example .env.local   # fill VITE_SUPABASE_ANON_KEY
npm run dev
```

## Deploy

Netlify from GitHub, auto-deploy on push to `main`. Env vars (Netlify, Site settings):
`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`; later also `OPENAI_API_KEY` and
`SUPABASE_SECRET_KEY` (server-side only, never `VITE_`-prefixed).

**This repo is public. Never commit keys or `.env` files.**

## Plan

0. Groundwork (repo, Netlify, SQL)
1. Skeleton + access (this)
2. Brief to prompt (OpenAI)
3. Songs + curation
4. Publish + search
5. Optional Suno automation (Chrome extension)
