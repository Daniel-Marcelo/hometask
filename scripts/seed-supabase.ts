/**
 * Seeds a Supabase project with the rooms/tasks parsed from the CSV.
 *
 *   npx tsx scripts/seed-supabase.ts
 *
 * Requires env vars (shell or .env.local loaded by your own means — this
 * script does not parse dotenv files):
 *
 *   SUPABASE_URL              e.g. https://xxxx.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY service-role key, NOT the anon key — the
 *                             service role bypasses RLS, which is what lets
 *                             seeding run before any user is allowlisted.
 *
 * Applies 0001_init.sql to the project first (SQL editor or supabase CLI).
 * Upserts are idempotent: re-running refreshes rows by id. Never run in tests.
 */

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { parseItemListCsv } from "../src/data/parse";
import { roomToRow, taskToRow, type RoomRow, type TaskRow } from "../src/data/supabaseRow";

const csvPath = new URL("../src/data/csv/item-list.csv", import.meta.url);

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error(
    "seed-supabase: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment\n" +
      "(service role key, not the anon key — seeding bypasses RLS).",
  );
  process.exit(1);
}

const client = createClient(url, serviceKey, { auth: { persistSession: false } });

const { rooms, tasks } = parseItemListCsv(readFileSync(csvPath, "utf8"));

/** Upsert in chunks to stay under PostgREST row/size limits. */
async function upsertAll(
  table: string,
  rows: Array<RoomRow | TaskRow>,
): Promise<void> {
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error } = await client.from(table).upsert(chunk);
    if (error) {
      console.error(`seed-supabase: upsert into "${table}" failed:`, error.message);
      process.exit(1);
    }
  }
}

// Rooms first: tasks reference rooms(id).
await upsertAll("rooms", rooms.map(roomToRow));
await upsertAll("tasks", tasks.map(taskToRow));

console.log(
  `seed-supabase: upserted ${rooms.length} rooms and ${tasks.length} tasks into ${url}`,
);
