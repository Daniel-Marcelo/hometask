import { createClient } from "@supabase/supabase-js";
import type { NewTask, QueuedOp, RepoState, TaskRepo } from "./repo";
import type { Room, Task } from "./repo";
import {
  TASK_FIELD_KEYS,
  roomToRow,
  rowToRoom,
  rowToTask,
  taskToRow,
  type RoomRow,
  type TaskRow,
} from "./supabaseRow";

const now = (): string => new Date().toISOString();

/**
 * Minimal shape of the supabase-js client surface this adapter uses. Defined
 * here (instead of importing the full SupabaseClient type) so unit tests can
 * inject a tiny fake and stay insulated from supabase-js version churn.
 *
 * Real-client integration points (verified against supabase-js v2):
 * - `client.from(table)` returns a PostgrestBuilder; `select()` / `upsert()`
 *   are thenable and resolve `{ data, error }`.
 * - `client.from(table).delete().eq(column, value)` is thenable likewise.
 * - `client.channel(name)` returns a RealtimeChannel; `.on("postgres_changes",
 *   { event, schema, table }, callback)` chains and `.subscribe()` starts it.
 * - `client.removeChannel(channel)` tears a channel down.
 */
export interface RealtimeChannelLike {
  on(
    event: "postgres_changes",
    filter: { event: string; schema: string; table: string },
    callback: (payload: ChangePayload) => void,
  ): RealtimeChannelLike;
  subscribe(): RealtimeChannelLike;
}

/** Subset of the supabase-js realtime payload this adapter consumes. */
export interface ChangePayload {
  eventType: "INSERT" | "UPDATE" | "DELETE";
  /** New row for INSERT/UPDATE, ignored for DELETE. */
  new: unknown;
  /** Old row identity for DELETE (at least `id`). */
  old: unknown;
}

/**
 * What supabase-js resolves for a table request: the awaited response
 * envelope. The HTTP status lives HERE (top level), not on the error body —
 * a PostgrestError is `{ message, details, hint, code }` with no status.
 */
export interface SupabaseResponseLike {
  data: unknown;
  error: unknown;
  status?: number;
}

export interface SupabaseTableLike {
  select(): PromiseLike<SupabaseResponseLike>;
  /** Row objects in the wire (snake_case) shape; typed loosely at the boundary. */
  upsert(values: unknown): PromiseLike<SupabaseResponseLike>;
  delete(): {
    eq(column: string, value: unknown): PromiseLike<SupabaseResponseLike>;
  };
}

export interface SupabaseClientLike {
  from(table: string): SupabaseTableLike;
  channel(name: string): RealtimeChannelLike;
  removeChannel(channel: RealtimeChannelLike): void;
}

/**
 * Whether both Supabase env vars are present as non-empty strings. Read at
 * call time (not module load) so `vi.stubEnv` can drive it in tests.
 */
export function hasSupabaseEnv(): boolean {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  return typeof url === "string" && url !== "" && typeof key === "string" && key !== "";
}

function createEnvClient(): SupabaseClientLike {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (typeof url !== "string" || url === "" || typeof key !== "string" || key === "") {
    throw new Error(
      "createSupabaseRepo(): VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must both be set " +
        '(copy .env.example to .env.local, or omit them to use the local repo).',
    );
  }
  // The adapter only relies on the SupabaseClientLike surface above; cast
  // through unknown because the full supabase-js types are deliberately wider.
  return createClient(url, key) as unknown as SupabaseClientLike;
}

/** Same slug rule as the parser/local repo, so generated ids look alike. */
function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** First free slug: "x" → "x-2", "x-3", … */
function uniqueSlug(base: string, taken: Set<string>): string {
  let candidate = base;
  for (let n = 2; taken.has(candidate); n++) {
    candidate = `${base}-${n}`;
  }
  return candidate;
}

/**
 * Supabase-backed TaskRepo. Callers (the `repo.ts` singleton) only construct
 * it when `hasSupabaseEnv()` is true — without env vars the constructor
 * throws, which is a guard, not the dormancy mechanism.
 *
 * Design notes:
 * - Mutations apply locally first (same semantics as the local repo), enqueue
 *   a `QueuedOp`, then attempt a flush. A failed write (offline) leaves the op
 *   queued; a later mutation or the window `online` event retries.
 * - Op failures are classified: retryable (transport errors, 5xx) stays
 *   queued; permanent (4xx) is dropped after logging so one invalid op can
 *   never block the rest of the queue. Every failure is logged.
 * - Realtime changes from other clients are merged per-field by LWW: a field
 *   is applied only when the remote `field_updated_at` stamp beats the local
 *   stamp for that field (missing local stamp counts as the epoch).
 * - Whole-row upsert clobber is handled server-side: the migration installs a
 *   `tasks` merge trigger that applies an incoming row only where its per-
 *   field stamp is strictly newer than the stored one. Clients converge on
 *   the server's merged result via realtime.
 */
export function createSupabaseRepo(opts?: { client?: SupabaseClientLike }): TaskRepo {
  const client = opts?.client ?? createEnvClient();

  const listeners = new Set<() => void>();
  let state: RepoState = { rooms: [], tasks: [], queuedOps: [], lastSyncedAt: null };

  const emit = (): void => {
    for (const listener of listeners) listener();
  };

  const enqueue = (op: QueuedOp): void => {
    state = { ...state, queuedOps: [...state.queuedOps, op] };
  };

  const findTask = (id: string): Task | undefined =>
    state.tasks.find((task) => task.id === id);

  const replaceTask = (next: Task): void => {
    state = {
      ...state,
      tasks: state.tasks.map((task) => (task.id === next.id ? next : task)),
    };
  };

  // —————————————————————————————————————— initial load ——————

  async function load(): Promise<void> {
    try {
      const [roomsResult, tasksResult] = await Promise.all([
        client.from("rooms").select(),
        client.from("tasks").select(),
      ]);
      if (roomsResult.error != null || tasksResult.error != null) {
        console.warn("hometask: initial Supabase load failed", {
          rooms: roomsResult.error,
          tasks: tasksResult.error,
        });
        return;
      }
      state = {
        rooms: (roomsResult.data as RoomRow[]).map(rowToRoom),
        tasks: (tasksResult.data as TaskRow[]).map(rowToTask),
        queuedOps: state.queuedOps,
        lastSyncedAt: now(),
      };
      emit();
    } catch (error) {
      console.warn("hometask: initial Supabase load failed", error);
    }
  }
  void load();

  // —————————————————————————————————————— realtime ——————

  function applyRemoteTaskRow(row: TaskRow): void {
    const remote = rowToTask(row);
    const existing = findTask(remote.id);
    if (existing === undefined) {
      state = { ...state, tasks: [...state.tasks, remote] };
      emit();
      return;
    }
    // Per-field LWW: apply only fields whose remote stamp is strictly newer
    // than the local stamp (a missing local stamp counts as the epoch).
    const mergedFields: Partial<Task> = {};
    const fieldUpdatedAt = { ...existing.fieldUpdatedAt };
    let changed = false;
    for (const key of TASK_FIELD_KEYS) {
      const remoteStamp = remote.fieldUpdatedAt[key];
      if (remoteStamp === undefined) continue;
      if ((existing.fieldUpdatedAt[key] ?? "") >= remoteStamp) continue;
      (mergedFields as Record<string, unknown>)[key] = remote[key];
      fieldUpdatedAt[key] = remoteStamp;
      changed = true;
    }
    const remoteUpdatedAt =
      remote.updatedAt > existing.updatedAt ? remote.updatedAt : existing.updatedAt;
    if (!changed && remoteUpdatedAt === existing.updatedAt) return;
    replaceTask({ ...existing, ...mergedFields, fieldUpdatedAt, updatedAt: remoteUpdatedAt });
    emit();
  }

  function applyRemoteRoomRow(row: RoomRow): void {
    const remote = rowToRoom(row);
    state = {
      ...state,
      rooms: state.rooms.some((room) => room.id === remote.id)
        ? state.rooms.map((room) => (room.id === remote.id ? remote : room))
        : [...state.rooms, remote],
    };
    emit();
  }

  const channel = client.channel("hometask-realtime");
  channel
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "tasks" },
      (payload: ChangePayload) => {
        if (payload.eventType === "DELETE") {
          const id = (payload.old as { id?: unknown }).id;
          if (typeof id === "string") {
            state = { ...state, tasks: state.tasks.filter((task) => task.id !== id) };
            emit();
          }
          return;
        }
        applyRemoteTaskRow(payload.new as unknown as TaskRow);
      },
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "rooms" },
      (payload: ChangePayload) => {
        if (payload.eventType === "DELETE") {
          // Rooms are never deleted by this app; a remote delete is ignored
          // so the UI keeps its rooms stable until a dedicated flow exists.
          return;
        }
        applyRemoteRoomRow(payload.new as unknown as RoomRow);
      },
    )
    .subscribe();

  // —————————————————————————————————————— offline queue / flush ——————

  /** Where a sent op ended up: written, retry later, or drop it. */
  type SendResult = "ok" | "retryable" | "permanent";

  /**
   * 4xx responses mean the op itself is invalid and would fail forever —
   * EXCEPT these four, whose failures are about the session/conditions, not
   * the op: 401 (expired-but-refreshable token), 403 (e.g. RLS denial for a
   * not-yet-allowlisted user), 408 (timeout), 429 (rate limit). Dropping any
   * of those would silently lose the op, so they stay queued.
   */
  const RETRYABLE_4XX = new Set([401, 403, 408, 429]);

  /**
   * The HTTP status lives on the supabase-js response ENVELOPE, not on the
   * error body (PostgrestError is `{ message, details, hint, code }`).
   * Fallbacks when no envelope status is present (transport/network errors
   * like FetchError): check the error object for a legacy `status` field,
   * otherwise treat as retryable — we cannot prove the op is permanently
   * invalid, and retrying never loses data. PostgrestError `code` (a Postgres
   * SQLSTATE) is deliberately NOT used to decide permanence: e.g. 42501
   * (insufficient_privilege, the RLS denial) must be retried, not dropped.
   */
  function isPermanentResult(result: {
    error: unknown;
    status?: number;
  }): boolean {
    const status =
      typeof result.status === "number"
        ? result.status
        : (result.error as { status?: unknown } | null)?.status;
    if (typeof status !== "number") return false;
    return status >= 400 && status < 500 && !RETRYABLE_4XX.has(status);
  }

  /** Sends one op and classifies the outcome; failures are logged. */
  async function sendOp(op: QueuedOp): Promise<SendResult> {
    let result: SupabaseResponseLike;
    try {
      switch (op.kind) {
        case "upsert_room":
          result = await client.from("rooms").upsert(roomToRow(op.room));
          break;
        case "upsert_task":
          result = await client.from("tasks").upsert(taskToRow(op.task));
          break;
        case "delete_task":
          result = await client.from("tasks").delete().eq("id", op.taskId);
          break;
      }
    } catch (error) {
      console.warn(
        `hometask: transport failure for queued op "${op.kind}"; will retry`,
        error,
      );
      return "retryable";
    }
    if (result.error == null) return "ok";
    const permanent = isPermanentResult(result);
    console.warn(
      `hometask: ${permanent ? "dropping" : "will retry"} queued op "${op.kind}"`,
      result.error,
    );
    return permanent ? "permanent" : "retryable";
  }

  let flushing = false;

  function requestFlush(): void {
    if (flushing) return;
    flushing = true;
    void drain();
  }

  async function drain(): Promise<void> {
    let progressed = false;
    try {
      while (state.queuedOps.length > 0) {
        const result = await sendOp(state.queuedOps[0]);
        if (result === "retryable") return; // stop the drain; op stays queued
        state = {
          ...state,
          queuedOps: state.queuedOps.slice(1),
          lastSyncedAt: result === "ok" ? now() : state.lastSyncedAt,
        };
        // A dropped permanent op also counts as progress: it must not block
        // later ops, and a mid-drain enqueue deserves its own pass.
        progressed = true;
        emit();
      }
    } finally {
      flushing = false;
      // Ops enqueued while a drain was in flight get their own pass; a
      // retryable failure stops here (no spin) until the next trigger.
      if (progressed && state.queuedOps.length > 0) requestFlush();
    }
  }

  if (typeof window !== "undefined") {
    window.addEventListener("online", () => {
      requestFlush();
    });
  }

  // —————————————————————————————————————— mutations ——————

  return {
    subscribe(fn: () => void): () => void {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },

    getState(): RepoState {
      return state;
    },

    addTask(input: NewTask): Task {
      const stamp = now();
      const taken = new Set(state.tasks.map((task) => task.id));
      const id = uniqueSlug(slugify(`${input.roomId}/${input.title}`), taken);
      const task: Task = {
        ...input,
        id,
        createdAt: stamp,
        updatedAt: stamp,
        fieldUpdatedAt: {},
      };
      state = { ...state, tasks: [...state.tasks, task] };
      enqueue({ kind: "upsert_task", task, at: now() });
      requestFlush();
      return task;
    },

    updateTask(id: string, patch: Partial<Task>): void {
      const current = findTask(id);
      if (current === undefined) return;
      const stamp = now();
      const fieldUpdatedAt: Record<string, string> = { ...current.fieldUpdatedAt };
      let changed = false;
      for (const [key, value] of Object.entries(patch)) {
        // Identity and bookkeeping fields never get per-field stamps.
        if (key === "id" || key === "createdAt" || key === "updatedAt" || key === "fieldUpdatedAt") {
          continue;
        }
        if (current[key as keyof Task] !== value) {
          fieldUpdatedAt[key] = stamp;
          changed = true;
        }
      }
      const next: Task = {
        ...current,
        ...patch,
        fieldUpdatedAt,
        updatedAt: changed ? stamp : current.updatedAt,
      };
      replaceTask(next);
      enqueue({ kind: "upsert_task", task: next, at: now() });
      requestFlush();
    },

    deleteTask(id: string): void {
      state = { ...state, tasks: state.tasks.filter((task) => task.id !== id) };
      enqueue({ kind: "delete_task", taskId: id, at: now() });
      requestFlush();
    },

    addRoom(name: string): Room {
      const taken = new Set(state.rooms.map((room) => room.id));
      const room: Room = {
        id: uniqueSlug(slugify(name), taken),
        name,
        sortOrder: Math.max(-1, ...state.rooms.map((room) => room.sortOrder)) + 1,
        archived: false,
      };
      state = { ...state, rooms: [...state.rooms, room] };
      enqueue({ kind: "upsert_room", room, at: now() });
      requestFlush();
      return room;
    },

    completeWithUndo(taskId: string): () => void {
      const prior = findTask(taskId);
      if (prior === undefined) return () => undefined;

      const snapshot = structuredClone(prior);
      const stamp = now();
      const completed: Task = {
        ...prior,
        status: "completed",
        dateCompleted: new Date().toISOString().slice(0, 10),
        updatedAt: stamp,
        fieldUpdatedAt: {
          ...prior.fieldUpdatedAt,
          status: stamp,
          dateCompleted: stamp,
        },
      };
      replaceTask(completed);
      enqueue({ kind: "upsert_task", task: completed, at: now() });
      requestFlush();

      return () => {
        replaceTask(snapshot);
        // The corrective op must WIN under per-field LWW: fresh-stamp every
        // field that differs between the snapshot and the task as completion
        // left it (at minimum status and dateCompleted).
        const undoStamp = now();
        const baseline = completed;
        const corrective: Task = {
          ...snapshot,
          updatedAt: undoStamp,
          fieldUpdatedAt: { ...snapshot.fieldUpdatedAt },
        };
        for (const key of Object.keys(baseline) as Array<keyof Task>) {
          if (key === "updatedAt" || key === "fieldUpdatedAt") continue;
          if (baseline[key] !== corrective[key]) {
            corrective.fieldUpdatedAt[key] = undoStamp;
          }
        }
        enqueue({ kind: "upsert_task", task: corrective, at: undoStamp });
        requestFlush();
      };
    },
  };
}
