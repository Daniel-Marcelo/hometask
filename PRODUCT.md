# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Delegated with direction: Vite + React, mobile-first web app (user-specified), Supabase (free tier) as backend with magic-link email auth, deployed as an installable PWA. No component framework mandated; builder chooses sensible libraries.

## Users

A couple (the user and their partner) who just moved into a new house and are managing a whole-home renovation together. They previously tracked everything in a Google Sheet. Non-technical; use it casually but frequently — weekend mornings, shopping trips, mid-project check-ins. Two editors, one shared crew, no per-person task assignment.

## Product Purpose

A pocket command center for the renovation: answers "what can we get done today?" first, then tracks the whole project over time — 69 tasks across 15 rooms/areas, with status, priority, effort, spend, and readiness. Success: the couple stops maintaining the sheet by hand and trusts the app as the single source of truth.

## Positioning

It's not a generic to-do app — it is the operational mirror of their specific project: rooms, effort weights, "can be done now?" readiness, and spend tracking derived from their real sheet's dashboard math.

## Operating Context

Used on phones (primary), possibly desktop occasionally. Used in short bursts: on the sofa deciding the day's jobs, in a shop checking a purchase, in a room doing the work and marking it done. Partner updates must be visible to each other (sync). Offline use should not lose data. The retired Google Sheet stays as a frozen backup; the app offers CSV export to refresh it.

## Capabilities and Constraints

- Task model (from the real sheet): room/area, item/title, status (Completed / In Progress / Planned / Unplanned), priority (Urgent / Medium / Low / Very Low), effort (XS–XL + numeric effort weight 1–8), "can be done now?" flag (Yes / No / N/A), price, date planned, date completed.
- Dashboard math the app must reproduce: total spend, tasks completed/remaining, progress %, urgent action items, can-do-now count, per-room progress, status/priority/readiness counts.
- Import: one-time import of the 69 existing tasks from the sheet CSV (files provided in Downloads). Spend tracking full (totals + per-room + recent purchases). Completing an unpriced purchase task prompts for price, skippable.
- Add/edit tasks and rooms in-app; floating "+" action. All sheet fields editable.
- Access: magic-link email sign-in; only invited people can edit. Data in Supabase with real-time sync between the couple's devices.
- CSV export button for sheet backup.
- PWA: installable to home screen, full-screen, graceful offline caching.
- Explicitly undecided (do not invent): no push notifications; no task assignment per person; dates are context, not an organizing principle (no nagging/scheduling engine).

## Evidence on Hand

Real data: `C:\Users\Daniel\Downloads\House Renovation - Dashboard.csv` (dashboard formulas/counts) and `C:\Users\Daniel\Downloads\House Renovation - Copy of Item List.csv` (69 tasks, full field set). No logo, brand assets, or imagery exist.

## Product Principles

1. Answer "what can we do today?" within one glance of opening.
2. Reflect reality, don't demand ritual — updating a task must take seconds, one thumb.
3. Money is a first-class fact, tracked automatically from task completion.
4. Trustworthy sync: what either partner sees is what both see.

## Accessibility & Inclusion

Standard mobile-web accessibility (WCAG 2.1 AA spirit): touch targets ≥44px, readable contrast, usable one-handed. No product-specific needs established.
