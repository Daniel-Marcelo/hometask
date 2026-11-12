# HomeTask — Renovation Command Center: Design

Date: 2026-11-12
Status: awaiting approval

## Intent and why

A couple just moved into a house and tracked their renovation in a Google Sheet (69 tasks, 15 rooms, spend log, dashboard formulas). Sheets are painful on a phone. This app becomes their shared, mobile-first command center: it answers "what can we do today?" in one glance and tracks the whole project over time. The sheet retires to a backup role.

## Approaches considered

1. **Supabase backend (chosen)** — free-tier Postgres with real-time sync, magic-link auth. Pros: true two-person sync, offline-friendly client, proper querying. Cons: I set up the project/schema.
2. **Google Sheets as backend** — app reads/writes the live sheet via API, dashboard formulas keep working. Cons: slow, fragile, rate limits, auth complexity; rejected because the sheet was the problem, not the solution.
3. **Local-only per device** — simplest, but the two partners would diverge and data is fragile; rejected because "we manage it together" is core.

## Goals

- Answer "what can we do today?" on the home screen in one glance: readiness ("Can be done now?") first, ordered by urgency.
- Reproduce the sheet's dashboard math faithfully: total spend, completed/remaining, progress %, urgent count, ready-now count, per-room progress, status/priority/readiness breakdowns.
- Task CRUD with all sheet fields editable: room, title, status (Completed / In Progress / Planned / Unplanned), priority (Urgent / Medium / Low / Very Low), effort (XS–XL + weight 1–8), ready-now flag (Yes / No / N/A), price, date planned, date completed.
- Full spend tracking: completing a purchase-type task with no price prompts for it (skippable); Spend tab with total, per-room, recent purchases.
- One-time import of the 69 tasks from the provided CSV; CSV export for backup.
- Two-person shared access: Supabase magic-link sign-in; data syncs in real time between devices.
- Installable PWA: home-screen icon, full-screen, offline caching with graceful behavior.

## Non-goals

- Push notifications, reminders, nagging, scheduling engine. Dates are context, not the organizing principle.
- Per-person task assignment; the couple works as one crew.
- Native mobile apps.
- Replacing the dashboard's "Effort-Weighted Completion" formula with anything more clever; the sheet's math is the spec.

## Anti-goals (would make this a failure)

- Feels like corporate project management (Gantt charts, assignee dropdowns, sprint language).
- Slow or fussy updates: marking a task done must take one tap, one thumb.
- Data loss or silent divergence between partners' phones.

## Decided with the user

- Structure: **Command Center** home — stat tiles (progress %, spend, to-go), per-room progress bars, "Ready now" list below. Bottom tabs: **Home · Tasks · Rooms · Spend** (the user picked this over Focus-First and Rooms-First layouts).
- Visual direction: **Warm Craftsman** — cream/warm-neutral ground, terracotta + olive accents, characterful serif display type, feels like a home project not a SaaS tool (user picked this over Clean/Modern and Bold/Energetic).
- Interaction: **combo** — checkbox on a list row completes instantly (with undo); tapping the row opens a bottom sheet with all fields and a big "Mark as done" action.
- Data: Supabase + magic-link auth; one-time CSV import; sheet becomes frozen backup refreshed via in-app CSV export.
- Stack: Vite + React, mobile-first.

## Constraints

- Mobile-first: designed at ~390px width; desktop is a centered column, not a second layout.
- Touch targets ≥44px, one-handed reach for primary actions (bottom sheet, bottom tab bar, floating +).
- Free-tier Supabase: one project, modest row counts (hundreds of tasks) — no scaling concerns, but row-level security must gate everything behind the authenticated couple.
- Import data is real and provided; numbers on screen must match the sheet's dashboard (16.1%, £4,858, 40 ready now, etc.) after import.
- WCAG 2.1 AA spirit: contrast, focus states, reduced-motion respected.

## Data model (builder's reference)

Tables: `rooms` (id, name, sort_order, archived), `tasks` (id, room_id, title, status, priority, effort_label, effort_weight, can_do_now, price_cents, date_planned, date_completed, notes, created_at, updated_at), RLS: authenticated users only. Realtime on both tables. Status/priority/effort as constrained enums (text + check constraints fine).

## What's left to the builder

- Library choices (state/data-fetch layer for Supabase — recommend supabase-js + a light query hook; no Redux).
- Exact component structure, file layout, and styling approach (plain CSS or Tailwind — builder's call; the Warm Craftsman tokens are specified in the shape brief below).
- PWA manifest/service-worker implementation details.
- Import script UX (paste-CSV or file-pick; one-time run from the app or a dev-time script — dev-time script is fine).
- Auth invite flow: the couple signs in with their emails via magic link; an allowlist approach (e.g., `users` allowlist table or Supabase dashboard user cap) — keep it simple and secure.

## Shape brief (impeccable)

- **Mode:** Operate — the visitor completes tasks; scanability and speed outrank expression; brand lives in precise details.
- **Job/audience:** a partner, standing in a room or on the sofa on a weekend morning, deciding and doing today's jobs; secondarily checking progress and money.
- **Outcome:** mark tasks done in seconds; see today's ready-now work instantly; keep spend honest; both partners trust the same data.
- **Visual direction (user-pinned): Warm Craftsman.** Warm cream ground (#faf6f0), warm ink (#3d2c1e), muted brown text (#6b5a48), terracotta accent (#b45309) for urgency/primary actions, olive-green (#4d7c0f) for success/completion, hairline borders in warm tan (#e8ddd0), serif display (e.g., a characterful serif like Fraunces-class) for headings/numbers, humanist sans for body/UI. Cards: white on cream, soft radius (10–14px), thin warm borders, no heavy shadows. Urgency encoded by terracotta left-rules/chips, not alarm-red everywhere. This direction was chosen from three presented mockups; it is user-pinned and beats any category-default look.
- **Focal moment:** the Home first viewport — progress ring + spend + to-go tiles, room bars, and the top of the Ready-now list, all within ~640px of scroll.
- **Signature interaction:** the instant-complete checkbox with a satisfying micro-animation and undo snackbar; the task bottom sheet slides up thumb-reachable with a large terracotta "Mark as done".
- **States to design:** empty rooms, all-done celebration moment (restrained), offline banner, loading skeletons, error toasts, magic-link sign-in and email-sent confirmation, undo toast.
- **Anti-patterns:** no alarm-red spam, no gamified confetti every tap, no dark-mode-first, no desktop-only patterns on mobile.

## Resolved from builder check (my calls, disclosed)

- **Offline conflicts:** last-write-wins per field, with a lightweight offline write queue in the data layer. No conflict UI — two partners editing the same task's same field in the same offline window is vanishingly rare, and an undo-friendly optimistic UI beats a conflict dialog here.
- **"Purchase-type" task:** no schema flag. The completion prompt fires when a task's title starts with "Buy" (import-time heuristic, editable since title is editable). "Recent purchases" on the Spend tab = any completed task with a price > 0 — which correctly includes Fix Roof.
- **Spend semantics:** headline "spent" = sum of prices on **Completed** tasks (matches the sheet's "Recorded Costs" and today's £4,858). A price entered on a Planned task (a budget) shows on the task and in the Spend tab as "budgeted, not yet spent", never in the headline tile.
- **Hosting:** default to Vercel (static hosting suits Vite; deploy skill available). Movable later without code changes.
- **Verified math:** effort-weighted progress = Σweight of completed / Σweight of all = 16.1%; spend = sum of all priced tasks (all currently Completed). The 16th "room" (All House) is a real area, kept.
