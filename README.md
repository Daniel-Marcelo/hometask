# HomeTask

A mobile-first renovation task tracker PWA. Rooms, tasks and spend live in
localStorage with an offline op queue, so the app keeps working without a
network and syncs when you're back online.

## Stack

- React + TypeScript + Vite
- react-router-dom with `HashRouter` (static-host friendly — no server rewrites)
- Tailwind-free hand-rolled CSS in `src/styles/global.css`
- `vite-plugin-pwa` for the installable shell + service worker (`autoUpdate`)
- Vitest + Testing Library; oxlint

## Scripts

- `npm run dev` — dev server
- `npm run build` — type-check + production build (emits `dist/manifest.webmanifest` and `dist/sw.js`)
- `npm run preview` — serve the production build
- `npm test` — run the test suite
- `npm run lint` — oxlint

## Data

App state is data-local: the CSV seed under `src/data/csv/` is parsed at
startup into localStorage; writes go to localStorage with an offline op queue.
