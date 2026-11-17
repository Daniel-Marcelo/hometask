# HomeTask

A mobile-first renovation task tracker PWA: rooms, tasks, priorities, effort
and recorded spend, with a one-tap complete circle and app-level undo.

## What the data does (and does not do)

- **All data lives on the device.** The CSV seed in `src/data/csv/` is parsed
  into `localStorage` on first run; every edit is written back there.
- **Backup is manual.** "Export backup CSV" on the Tasks page downloads
  `hometask-backup-YYYY-MM-DD.csv`, including task notes. There is no
  automatic sync or server backup.
- **Cloud mode is dormant.** A Supabase adapter and schema ship in
  `src/data/supabaseRepo.ts` / `supabase/`, but nothing enabled it yet. It
  also needs a real Supabase auth swap (`src/lib/auth.ts` is a local mock).
  Do **not** set `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` yet — leaving
  them unset keeps the app on localStorage.

## Auth

Sign-in is a local mock magic link: the app signs you in after a short beat
and stores the email in `localStorage`. Nothing is emailed.

- `VITE_ALLOWED_EMAILS` is the comma-separated invite list
  (`you@example.com, partner@example.com`).
- Empty/unset allows **any** email — fine for local dev, not for production.
- **Set `VITE_ALLOWED_EMAILS` before deploying** (or every email is accepted).
  This list is UX only; the dormant cloud adapter enforces access server-side.

See `.env.example` for the full set of variables.

## Install as a PWA

`vite-plugin-pwa` registers a service worker with `autoUpdate`; the build emits
`dist/manifest.webmanifest` and `dist/sw.js`. Serve the built app over HTTPS,
then use the browser's "Install app" / "Add to Home Screen". It opens
standalone and works offline once installed (data stays local).

## Dev commands

- `npm install`
- `npm run dev` — Vite dev server
- `npm test` — Vitest + Testing Library (single run)
- `npm run lint` — oxlint
- `npm run build` — strict TypeScript check + production build
- `npm run preview` — serve the production build locally

Stack: React + TypeScript + Vite, `HashRouter` (static-host friendly, no
server rewrites), hand-rolled CSS in `src/styles/global.css`, `vite-plugin-pwa`.
