import type { Room, Task } from "./types";

const now = (): string => new Date().toISOString();

/**
 * Snake_case row shapes matching `supabase/migrations/0001_init.sql`.
 * Kept dependency-free so the seed script (`scripts/seed-supabase.ts`,
 * run under tsx in Node) can import the same mapping as the adapter.
 */

export interface RoomRow {
  id: string;
  name: string;
  sort_order: number;
  archived: boolean;
  /** Maintained by the DB (default + trigger); sent fresh on upsert. */
  updated_at: string;
}

export interface TaskRow {
  id: string;
  room_id: string;
  title: string;
  status: string;
  priority: string;
  effort: string;
  effort_weight: number;
  can_do_now: string;
  price_cents: number | null;
  date_planned: string | null;
  date_completed: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
  field_updated_at: Record<string, string>;
}

export function roomToRow(room: Room): RoomRow {
  return {
    id: room.id,
    name: room.name,
    sort_order: room.sortOrder,
    archived: room.archived,
    // Accurate on insert; the rooms trigger overwrites it on update.
    updated_at: now(),
  };
}

export function rowToRoom(row: RoomRow): Room {
  return {
    id: row.id,
    name: row.name,
    sortOrder: row.sort_order,
    archived: row.archived,
  };
}

export function taskToRow(task: Task): TaskRow {
  return {
    id: task.id,
    room_id: task.roomId,
    title: task.title,
    status: task.status,
    priority: task.priority,
    effort: task.effort,
    effort_weight: task.effortWeight,
    can_do_now: task.canDoNow,
    price_cents: task.priceCents,
    date_planned: task.datePlanned,
    date_completed: task.dateCompleted,
    notes: task.notes,
    created_at: task.createdAt,
    updated_at: task.updatedAt,
    field_updated_at: task.fieldUpdatedAt,
  };
}

export function rowToTask(row: TaskRow): Task {
  // The unions are enforced by CHECK constraints in the migration, so the
  // casts below only translate the wire format (text) back to TS unions.
  return {
    id: row.id,
    roomId: row.room_id,
    title: row.title,
    status: row.status as Task["status"],
    priority: row.priority as Task["priority"],
    effort: row.effort as Task["effort"],
    effortWeight: row.effort_weight,
    canDoNow: row.can_do_now as Task["canDoNow"],
    priceCents: row.price_cents,
    datePlanned: row.date_planned,
    dateCompleted: row.date_completed,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    fieldUpdatedAt: row.field_updated_at,
  };
}

/**
 * Task fields that take part in per-field LWW (everything except identity
 * and bookkeeping: id / createdAt / updatedAt / fieldUpdatedAt).
 */
export const TASK_FIELD_KEYS = [
  "roomId",
  "title",
  "status",
  "priority",
  "effort",
  "effortWeight",
  "canDoNow",
  "priceCents",
  "datePlanned",
  "dateCompleted",
  "notes",
] as const satisfies Array<keyof Omit<Task, "id" | "createdAt" | "updatedAt" | "fieldUpdatedAt">>;
