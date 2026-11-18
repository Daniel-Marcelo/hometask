# HomeTask Renovation Command Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A mobile-first Vite + React PWA that manages the couple's 69-task renovation list with dashboard math, spend tracking, and (at the end) Supabase sync.

**Architecture:** React SPA with a repository pattern data layer: a `TaskRepo` interface with a localStorage adapter used for the whole build (seeded from the real CSVs), and a Supabase adapter written last but only activated when credentials are provided. Per-field last-write-wins via a field-timestamp map; offline writes queue in the local adapter. Pages: Home (command center), Tasks, Rooms, Spend; one-tap complete + undo; bottom-sheet task editor.

**Tech Stack:** Vite + React + TypeScript, react-router-dom, Vitest + React Testing Library, vite-plugin-pwa, supabase-js (written late, wired when creds exist).

**Spec:** `docs/superpowers/specs/2026-11-12-renovation-app-design.md` (read together with `PRODUCT.md`)

## Global Constraints

- Mobile-first: design at 390px; desktop is a centered max-width 480px column.
- Touch targets ≥44px; primary actions in bottom 1/3 of screen (tab bar, FAB, bottom sheets).
- Warm Craftsman tokens (exact values): ground `#faf6f0`, ink `#3d2c1e`, text-muted `#6b5a48`, accent terracotta `#b45309`, success olive `#4d7c0f`, hairline `#e8ddd0`, card white `#ffffff`; radius 10–14px; serif display font for headings/stat numbers, humanist sans for body/UI.
- Spend headline = sum of `priceCents` on `status === "completed"` tasks only. Prices on uncompleted tasks are "budgeted, not spent".
- Completing a task whose title starts with `Buy` and has no price prompts for price, skippable. Recent purchases = completed tasks with `priceCents > 0`.
- Money stored as integer `priceCents`; never floats. GBP display format `£1,234`.
- No confetti/hype, no alarm-red spam; urgency = terracotta left-rule/chip only.
- Source CSVs are copied verbatim into `src/data/` — they contain mangled encoding: `A£3,900.00` means £3,900. Parse digits only.
- Every commit message: `feat:`/`test:`/`chore:` conventional style.

## Review Focus

1. **Mangled currency encoding:** `A£3,900.00`, `A£0.00`, empty cells must parse to 390000, 0, null — never NaN or float drift. Test in Task 2.
2. **Effort-weighted progress:** must be Σ effortWeight(completed)/Σ effortWeight(all) = 16.1% (count-based would read 13/69 = 18.8%). Test in Task 3.
3. **Ready-now semantics:** `canDoNow === "yes"` AND not completed = 40; blocked = 16; later = 13 with the real seed. Test in Task 3.
4. **Undo integrity:** completing then undoing within the toast window restores the task's exact prior state including price and dates. Test in Task 6.
5. **Offline write queue:** writes while "offline" persist across reload and apply LWW on sync; no loss. Test in Task 4.

---

### Task 1: Scaffold, git, design tokens, app shell

**Files:**
- Create: root Vite react-ts scaffold (`package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`), `src/main.tsx`, `src/App.tsx`, `src/styles/tokens.css`, `src/styles/global.css`
- Create: `src/pages/Placeholders.tsx` (4 placeholder pages)

**Interfaces:**
- Produces: routes `/` `/tasks` `/rooms` `/spend` rendering placeholder pages; `src/styles/tokens.css` CSS custom properties named exactly: `--ground`, `--ink`, `--muted`, `--accent`, `--success`, `--hairline`, `--card`, `--radius`, `--radius-lg`.

- [ ] **Step 1:** `git init`, commit PRODUCT.md + docs. Scaffold Vite react-ts into `_scaffold/` with `npm create vite@latest _scaffold -- --template react-ts`, move contents to root, delete `_scaffold`, `npm install`, add deps: `react-router-dom`, dev deps: `vitest @testing-library/react @testing-library/user-event jsdom @testing-library/jest-dom`.
- [ ] **Step 2:** Write `vite.config.ts` with `test: { environment: "jsdom", setupFiles: "./src/test/setup.ts" }` and a `src/test/setup.ts` importing `@testing-library/jest-dom`.
- [ ] **Step 3:** Write `tokens.css` (exact token values from Global Constraints), `global.css` (ground background, ink text, serif display via CSS var `--font-display`, sans body font stack, centered `#app-column { max-width: 480px; margin: 0 auto; }`).
- [ ] **Step 4:** Write `App.tsx`: `BrowserRouter` (or `HashRouter` — choose `HashRouter` for static hosting simplicity), a `TabBar` component (fixed bottom, 4 tabs ≥44px, inline SVG icons: home/grid/list/coins), and 4 placeholder pages.
- [ ] **Step 5:** Verify: `npm run build` passes; `npm run dev` shows tab shell at localhost.
- [ ] **Step 6:** Commit: `chore: scaffold vite react-ts app with warm craftsman tokens`.

### Task 2: Data types + real-CSV parsing

**Files:**
- Create: `src/data/types.ts`, `src/data/parse.ts`, `src/data/csv/item-list.csv` (copied verbatim), `src/data/csv/dashboard.csv` (copied verbatim)
- Test: `src/data/parse.test.ts`

**Interfaces:**
- Produces (all consumed by Tasks 3, 4, 13):
```ts
export type Status = "completed" | "in_progress" | "planned" | "unplanned";
export type Priority = "urgent" | "medium" | "low" | "very_low";
export type Effort = "XS" | "S" | "M" | "L" | "XL";
export type CanDoNow = "yes" | "no" | "na";
export interface Room { id: string; name: string; sortOrder: number; archived: boolean }
export interface Task { id: string; roomId: string; title: string; status: Status; priority: Priority; effort: Effort; effortWeight: number; canDoNow: CanDoNow; priceCents: number | null; datePlanned: string | null; dateCompleted: string | null; notes: string; createdAt: string; updatedAt: string; fieldUpdatedAt: Record<string, string> }
export function parseItemListCsv(csv: string): { rooms: Room[]; tasks: Task[] }
export function parsePrice(raw: string): number | null   // "A£3,900.00" → 390000, "" → null
```

- [ ] **Step 1: Write the failing test.** Assertions: `parseItemListCsv(itemListCsvText)` returns exactly 16 rooms (incl. "All House"), 69 tasks; first task is `{ title: "Fix Roof", status: "completed", effort: "XL", effortWeight: 8, canDoNow: "na", priceCents: 390000, dateCompleted: "2026-11-06" }`; status/priority/effort/canDoNow map: `Unplanned→unplanned`, `Very Low→very_low`, `In Progress→in_progress`, `N/A→na`, `Yes→yes`, `No→no`; `parsePrice("A£3,900.00")===390000`, `parsePrice("A£0.00")===0`, `parsePrice("")===null`, `parsePrice("£20")===2000`; room ids are stable slugs (`hallway`, `kitchen-dining`…).
- [ ] **Step 2:** Run `npx vitest run src/data/parse.test.ts` — expect FAIL (module missing).
- [ ] **Step 3:** Implement `types.ts` and `parse.ts` (row-by-row CSV split honoring quoted cells; header row skipped; blank price/date → null; `fieldUpdatedAt: {}`).
- [ ] **Step 4:** Run test — expect PASS.
- [ ] **Step 5:** Commit `feat: parse real renovation CSV into typed rooms and tasks`.

### Task 3: Dashboard math (the sheet's formulas as code)

**Files:**
- Create: `src/lib/dashboard.ts`
- Test: `src/lib/dashboard.test.ts`

**Interfaces:**
- Consumes: `parseItemListCsv` + CSV text from Task 2.
- Produces:
```ts
export interface Dashboard { totalTasks: number; completed: number; remaining: number; progressPct: number; urgentPending: number; readyNow: number; blocked: number; laterCount: number; totalSpendCents: number; budgetedCents: number; roomProgress: { roomId: string; name: string; total: number; completed: number; pct: number }[]; spendByRoom: { roomId: string; name: string; cents: number }[]; statusCounts: Record<Status, number>; priorityCounts: Record<Priority, number>; recentPurchases: Task[] }
export function computeDashboard(rooms: Room[], tasks: Task[]): Dashboard
```
- `progressPct` is effort-weighted: Σ weight(completed)/Σ weight(all)*100, one decimal.
- `readyNow` = canDoNow "yes" and not completed; `blocked` = "no" and not completed; `laterCount` = "na" and not completed; `urgentPending` = urgent and not completed; `recentPurchases` = completed, `priceCents > 0`, newest `dateCompleted` first (ties: title asc).

- [ ] **Step 1: Write the failing test** against the real CSV: `{ totalTasks: 69, completed: 13, remaining: 56, progressPct: 16.1, urgentPending: 4, readyNow: 40, blocked: 16, laterCount: 13, totalSpendCents: 485800, budgetedCents: 0 }`; `roomProgress` has 16 entries, hallway `{ total: 7, completed: 3 }`, utility `{ total: 2, completed: 2, pct: 100 }`; `priorityCounts.urgent === 9`; `spendByRoom` hallway `{ cents: 10000 }` (80+20), all-house `{ cents: 390000 }`.
- [ ] **Step 2:** Run — expect FAIL.
- [ ] **Step 3:** Implement `computeDashboard` (pure, no React).
- [ ] **Step 4:** Run — expect PASS (all numbers reconcile with the sheet).
- [ ] **Step 5:** Commit `feat: dashboard math matching sheet formulas`.

### Task 4: Local repository (seed, mutate, offline queue, LWW, undo snapshot)

**Files:**
- Create: `src/data/repo.ts`, `src/data/localRepo.ts`, `src/data/useRepo.ts`
- Test: `src/data/localRepo.test.ts`

**Interfaces:**
- Consumes: types + `parseItemListCsv` (Task 2).
- Produces (consumed by Tasks 5–12):
```ts
export interface RepoState { rooms: Room[]; tasks: Task[]; queuedOps: QueuedOp[]; lastSyncedAt: string | null }
export type QueuedOp = { kind: "upsert_task"; task: Task; at: string } | { kind: "delete_task"; taskId: string; at: string } | { kind: "upsert_room"; room: Room; at: string }
export interface TaskRepo { subscribe(fn: () => void): () => void; getState(): RepoState; addTask(input: NewTask): Task; updateTask(id: string, patch: Partial<Task>): void; deleteTask(id: string): void; addRoom(name: string): Room; completeWithUndo(taskId: string): () => void /* returns undo fn */ }
export function createLocalRepo(): TaskRepo              // localStorage key "hometask.v1"
export function useRepoState(): RepoState                // useSyncExternalStore hook on the singleton repo
export const repo: TaskRepo                               // module singleton used by all pages
```
- Seeding: if `hometask.v1` absent, state = parsed CSVs. `updateTask` writes per-field `fieldUpdatedAt` timestamps; queuedOps accumulate; `lastSyncedAt` stays null for local adapter. `completeWithUndo` sets status completed (+ `dateCompleted: today`) and returns an undo function restoring the exact prior task object.

- [ ] **Step 1: Write failing tests:** fresh repo seeds 69 tasks; `updateTask` sets `fieldUpdatedAt.title`; queuedOps grows by 1 per mutation; `completeWithUndo` then undo restores identical task object (deep equal incl. price null and dates); two `createLocalRepo()` instances share state via localStorage (second sees first's update).
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Implement `repo.ts`, `localRepo.ts`, `useRepo.ts`.
- [ ] **Step 4:** Run — PASS.
- [ ] **Step 5:** Commit `feat: local task repo with seed, offline queue, per-field LWW, undo`.

### Task 5: Shared UI components + page scaffolding

**Files:**
- Create: `src/components/StatTile.tsx`, `src/components/ProgressBar.tsx`, `src/components/PriorityChip.tsx`, `src/components/UndoToast.tsx`, `src/components/OfflineBanner.tsx`, `src/components/Fab.tsx`, `src/components/Sheet.tsx`
- Test: `src/components/components.test.ts`

**Interfaces:**
- Produces (consumed by Tasks 6–12):
```tsx
<StatTile label="string" value="string" sub?="string" accent?="boolean" />
<ProgressBar pct={number} />            // olive fill on hairline track, 6px, rounded
<PriorityChip priority={Priority} />    // terracotta chip only for "urgent"
<UndoToast message="string" onUndo={() => void} visible={boolean} />
<Fab onClick={() => void} label="string" />  // 56px circle bottom-right above tab bar
<Sheet open={boolean} onClose={() => void} title="string" children />  // bottom sheet, slides up, backdrop, drag-handle bar, 100% width, rounded top 16px
```
- Component test: Sheet renders children when open and calls onClose on backdrop click; PriorityChip renders terracotta style only for urgent; ProgressBar fill width matches pct.

- [ ] **Step 1: Write failing component test.**
- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement components (CSS in `global.css`/co-located styles). **Step 4:** Run — PASS. **Step 5:** Commit `feat: shared UI kit in warm craftsman style`.

### Task 6: Task row + one-tap complete with undo

**Files:**
- Create: `src/features/tasks/TaskRow.tsx`
- Test: `src/features/tasks/TaskRow.test.tsx`

**Interfaces:**
- Consumes: `repo`, `useRepoState` (Task 4); `PriorityChip` (Task 5).
- Produces: `<TaskRow task={Task} onOpen={(task: Task) => void} />` — 44px circle checkbox left, title, room name + effort label muted, urgent gets terracotta left-rule; clicking circle completes via `repo.completeWithUndo` and shows `UndoToast`; clicking row body calls `onOpen(task)`; completed rows render struck-through with olive check.

- [ ] **Step 1: Write failing test:** clicking circle marks task completed in repo state and UndoToast appears; clicking toast's Undo restores prior state (price/dates intact); clicking title calls `onOpen` with the task; urgent task renders left-rule class.
- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement. **Step 4:** Run — PASS. **Step 5:** Commit `feat: one-tap task completion with undo`.

### Task 7: Task bottom sheet (view/edit all fields, price prompt)

**Files:**
- Create: `src/features/tasks/TaskSheet.tsx`, `src/features/tasks/NewTaskSheet.tsx`
- Test: `src/features/tasks/TaskSheet.test.tsx`

**Interfaces:**
- Consumes: `Sheet`, `repo` (Tasks 4–5); `Task` type.
- Produces: `<TaskSheet task={Task} open={boolean} onClose={() => void} />`. Editable fields: title (text), room (select from rooms), status (segmented control 4 values), priority (segmented 4), effort (segmented 5 labels — selecting a label auto-sets `effortWeight` via map `XS:1,S:2,M:3,L:5,XL:8`), canDoNow (segmented Yes/No/N/A), price (numeric input, pounds, stores cents), datePlanned, dateCompleted (date inputs), notes (textarea). Big terracotta "Mark as done" button when not completed. Delete (confirm) at bottom. Every edit commits through `repo.updateTask`.
- Price prompt: after "Mark as done", if `title` starts with "Buy" and `priceCents == null`, show inline price field + "Skip" (skip completes without price); entering a price saves it then completes. If task already priced or non-Buy, completes immediately.
- `NewTaskSheet({ defaultRoomId?: string })`: title, room (default: `defaultRoomId` or first room), priority, effort, canDoNow defaults (`planned`, `medium`, `M`, `yes`); creates via `repo.addTask`.

- [ ] **Step 1: Write failing tests:** changing status to Completed via segmented control persists to repo; "Mark as done" on unpriced "Buy Rug" shows price field, Skip → completed with `priceCents` still null, entering "80" → completed with `priceCents: 8000`; "Mark as done" on "Paint Stairs" completes with no prompt; effort select `L` sets `effortWeight: 5`; delete removes task; NewTaskSheet creates a task with chosen room/priority.
- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement both sheets. **Step 4:** Run — PASS. **Step 5:** Commit `feat: task bottom sheet with price prompt and full editing`.

### Task 8: Home — the command center

**Files:**
- Modify: `src/pages/Placeholders.tsx` → Create: `src/features/home/HomePage.tsx`
- Test: `src/features/home/HomePage.test.tsx`

**Interfaces:**
- Consumes: `computeDashboard`, `useRepoState`, `TaskRow`, `StatTile`, `ProgressBar` (Tasks 3–6).
- Produces: route `/`. First viewport (~640px): greeting line ("Good morning" by hour), 3 `StatTile`s — progress% (accent), `£4,858`-style total spend from `totalSpendCents`, remaining count — then "Rooms" section: every room from `roomProgress` as a row with name, `x/y`, `ProgressBar`; then "Ready now" section header with `readyNow` count, listing tasks with `canDoNow==="yes"` && not completed sorted: urgent first, then priority rank, then effort weight asc; tapping a room row navigates `/rooms/:id`; tapping a task opens `TaskSheet`. If `budgetedCents > 0`, show muted "£X budgeted, not spent" under the spend tile.

- [ ] **Step 1: Write failing test:** renders "16.1" tile, "£4,858" tile, "56" tile; "Return other Rug" (urgent ready) appears above "Clean Windows" (medium ready); Utility shows "2/2" with full bar; no "Fix Roof" (completed) in ready list.
- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement. **Step 4:** Run — PASS. **Step 5:** Commit `feat: command center home screen`.

### Task 9: Tasks page — full list + filters

**Files:**
- Create: `src/features/tasks/TaskListPage.tsx`
- Test: `src/features/tasks/TaskListPage.test.tsx`

**Interfaces:**
- Consumes: `TaskRow`, `TaskSheet`, `NewTaskSheet`, `Fab`, repo state.
- Produces: route `/tasks`. Sticky filter row: room select (All + 16 rooms), status select (All + 4), priority select (All + 4), "Ready now" toggle. Default sort: priority rank, then effort weight, then room. List of `TaskRow`s; tap opens `TaskSheet`; Fab opens `NewTaskSheet`; completed tasks collapse into a muted "Completed (n)" section at the bottom.

- [ ] **Step 1: Write failing test:** default list shows "Completed (13)"; room filter "Hallway" shows exactly 7 tasks; status filter "Planned" shows 5 (the CSV has 5 Planned tasks — the sheet's dashboard tab is stale on this count); "Ready now" toggle shows 40; Fab opens NewTaskSheet.
- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement. **Step 4:** Run — PASS. **Step 5:** Commit `feat: filterable full task list`.

### Task 10: Rooms page + room detail

**Files:**
- Create: `src/features/rooms/RoomsPage.tsx`, `src/features/rooms/RoomDetailPage.tsx`
- Test: `src/features/rooms/RoomsPage.test.tsx`

**Interfaces:**
- Consumes: `ProgressBar`, `TaskRow`, `TaskSheet`, `Fab`.
- Produces: route `/rooms` — one card per room (name, x/y, ProgressBar, muted "n ready now") sorted by `sortOrder`; tap → `/rooms/:id`. Room detail — room header + its tasks as `TaskRow`s (same ready/priority sort), Fab adds task pre-set to that room, "Add room" button on Rooms page calls `repo.addRoom`.

- [ ] **Step 1: Write failing tests:** rooms page lists 16 rooms with "Main Living Room · 0/11"; navigating to hallway detail shows its 7 tasks, 3 struck-through; Add room "Loft" appears in list.
- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement. **Step 4:** Run — PASS. **Step 5:** Commit `feat: rooms browsing and per-room detail`.

### Task 11: Spend page

**Files:**
- Create: `src/features/spend/SpendPage.tsx`
- Test: `src/features/spend/SpendPage.test.tsx`

**Interfaces:**
- Consumes: `computeDashboard` (`totalSpendCents`, `recentPurchases`, `budgetedCents`, `spendByRoom` — all defined in Task 3).
- Produces: route `/spend` — headline tile "Recorded costs £4,858"; budgeted-not-spent line when `budgetedCents > 0`; "By room" bars (top 6 + "Other"); "Recent purchases" list (task title, room, date, price) from `recentPurchases`.

- [ ] **Step 1: Write failing test:** headline "£4,858"; recent purchases include "Fix Roof · All House · 2026-11-06 · £3,900" sorted newest first; budgeted line hidden when zero.
- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement. **Step 4:** Run — PASS. **Step 5:** Commit `feat: spend tracking page`.

### Task 12: CSV export (backup refresh)

**Files:**
- Create: `src/lib/exportCsv.ts`; Modify: `src/features/tasks/TaskListPage.tsx` (add "Export backup CSV" button in the page header).
- Test: `src/lib/exportCsv.test.ts`

**Interfaces:**
- Consumes: repo state.
- Produces: `export function toItemListCsv(rooms: Room[], tasks: Task[]): string` — same column order as `item-list.csv`; price format `£1,234.00`; triggers a browser download `hometask-backup-YYYY-MM-DD.csv` (Blob + anchor click; jsdom test asserts CSV content, download via URL.createObjectURL stub).

- [ ] **Step 1: Write failing test:** round-trip — `parseItemListCsv(toItemListCsv(parsed))` yields 69 tasks with identical title/status/priceCents/effortWeight.
- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement + wire button. **Step 4:** Run — PASS. **Step 5:** Commit `feat: CSV backup export`.

### Task 13: PWA install + offline banner

**Files:**
- Modify: `vite.config.ts` (vite-plugin-pwa), `index.html`; Create: `public/icons/icon-192.png`, `public/icons/icon-512.png` (simple terracotta rounded square with serif "H" — author as SVG converted to PNG via any available tool, or ship `icon.svg` if no raster tool exists and declare it in the manifest).
- Modify: `OfflineBanner` wiring in App shell (navigator.onLine listeners).

**Interfaces:**
- Produces: installable PWA named "HomeTask", theme color `#b45309`, background `#faf6f0`; precaches app shell; offline shows cached app + `OfflineBanner` ("Offline — changes will sync"); repo writes continue to localStorage queue.

- [ ] **Step 1:** Add `vite-plugin-pwa` with `registerType: "autoUpdate"`, manifest (name HomeTask, short name HomeTask, display standalone, start_url "/"). Build and confirm `dist/manifest.webmanifest` + sw emitted.
- [ ] **Step 2:** Verify: `npm run build && npm run preview` — Lighthouse/devtools shows installable; serving offline shows banner (manual check, note result in commit body).
- [ ] **Step 3:** Commit `feat: installable pwa with offline shell`.

### Task 14: Auth shell (magic-link shape, mock-backed until Supabase)

**Files:**
- Create: `src/features/auth/AuthGate.tsx`, `src/features/auth/SignInPage.tsx`, `src/lib/auth.ts`, `src/lib/allowlist.ts`
- Test: `src/features/auth/AuthGate.test.tsx`

**Interfaces:**
- Consumes: repo state.
- Produces:
```ts
export type AuthState = { status: "loading" | "signed_out" | "signed_in"; email: string | null }
export function useAuth(): AuthState & { signIn(email: string): Promise<void>; signOut(): void }
```
- `allowlist.ts`: emails from `import.meta.env.VITE_ALLOWED_EMAILS` (comma-separated); empty list = any email allowed in dev builds. `AuthGate` wraps the app: `loading` → splash, `signed_out` → `SignInPage` (email field, terracotta "Send magic link" button, then "Check your email" confirmation state), `signed_in` → app. Local mock: `signIn` validates allowlist, stores session in localStorage, resolves after 400ms.

- [ ] **Step 1: Write failing tests:** signed-out shows SignInPage; email in allowlist signs in and reveals app; disallowed email (allowlist configured) shows "Not invited yet" error; sign out returns to SignInPage.
- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement. **Step 4:** Run — PASS. **Step 5:** Commit `feat: magic-link auth shell with allowlist`.

### Task 15: Supabase adapter (written, dormant until credentials)

**Files:**
- Create: `supabase/migrations/0001_init.sql`, `src/data/supabaseRepo.ts`, `scripts/seed-supabase.ts`, `.env.example`
- Test: `src/data/supabaseRepo.test.ts` (unit tests with a fake supabase client)

**Interfaces:**
- Consumes: `TaskRepo` interface (Task 4); types (Task 2).
- Produces: `export function createSupabaseRepo(): TaskRepo` (throws descriptive error if `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` missing); `repo.ts` singleton selects `createSupabaseRepo()` when env vars present else `createLocalRepo()`. SQL: `rooms` and `tasks` tables matching TS types exactly (`price_cents bigint`, `field_updated_at jsonb`), `updated_at` triggers; **server-side allowlist enforcement**: an `allowed_emails` table plus RLS policies that only admit rows when `auth.jwt() ->> 'email'` is in `allowed_emails` (client-side allowlist alone is not security); seed script uploads parsed CSV rows.

- [ ] **Step 1: Write failing unit test:** with fake client, `updateTask` writes patched fields + bumps `fieldUpdatedAt`; realtime callback updates store; queued ops flush on `online` event.
- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement migration SQL + adapter + seed script + `.env.example` (`VITE_SUPABASE_URL=`, `VITE_SUPABASE_ANON_KEY=`, `VITE_ALLOWED_EMAILS=`).
- [ ] **Step 4:** Run — PASS (local adapter remains default; app behavior unchanged without env).
- [ ] **Step 5:** Commit `feat: supabase adapter and schema, dormant until credentials`.

### Task 16: Browser verification + deploy

**Files:**
- Create: `.impeccable/review/desktop.png`, `.impeccable/review/mobile.png` (verification captures)
- Modify: none functional.

- [ ] **Step 1:** `npm run build && npm run preview`; drive the real UI at 390px (Playwright/webapp-testing): complete a task + undo, open sheet, edit price, filter, add room+task, export CSV, verify Home numbers match the sheet (16.1%, £4,858, 40). Capture `mobile.png` (390) and `desktop.png` (1440, centered column) into `.impeccable/review/`.
- [ ] **Step 2:** Run impeccable detector: `impeccable.cmd detect --json src/**/*.{tsx,css}`; fix mechanical findings.
- [ ] **Step 3:** Run the full test suite: `npx vitest run` — all green.
- [ ] **Step 4:** Commit `chore: verification captures and detector pass`, then deploy (Vercel per spec; user may prefer to trigger deployment themselves — ask before deploying).
