import itemListCsvText from "./csv/item-list.csv?raw";
import { parseItemListCsv } from "./parse";
import type { RepoState, Room, Task, TaskRepo } from "./repo";
import type { NewTask, QueuedOp } from "./repo";

const STORAGE_KEY = "hometask.v1";

const now = (): string => new Date().toISOString();
const today = (): string => new Date().toISOString().slice(0, 10);

/** Same slug rule as the parser, so seeded ids and generated ids look alike. */
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

function loadState(): RepoState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as Partial<RepoState> | null;
    if (
      !Array.isArray(parsed?.rooms) ||
      !Array.isArray(parsed?.tasks) ||
      !Array.isArray(parsed?.queuedOps)
    ) {
      return null;
    }
    return {
      rooms: parsed.rooms as Room[],
      tasks: parsed.tasks as Task[],
      queuedOps: parsed.queuedOps as QueuedOp[],
      lastSyncedAt: parsed.lastSyncedAt ?? null,
    };
  } catch {
    return null;
  }
}

function seedState(): RepoState {
  const { rooms, tasks } = parseItemListCsv(itemListCsvText);
  return { rooms, tasks, queuedOps: [], lastSyncedAt: null };
}

export function createLocalRepo(): TaskRepo {
  const listeners = new Set<() => void>();
  const loaded = loadState();
  let state: RepoState;
  // Snapshot of what this instance last read/wrote in localStorage, so getState()
  // can notice writes made by another instance in the same document.
  let lastRaw: string | null;

  if (loaded === null) {
    state = seedState();
    // Guarded: a throwing setItem (quota/security) must not take down bundle load.
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      lastRaw = JSON.stringify(state);
    } catch (error) {
      console.warn(`hometask: could not persist seeded state to "${STORAGE_KEY}"`, error);
      lastRaw = null;
    }
  } else {
    state = loaded;
    lastRaw = localStorage.getItem(STORAGE_KEY);
  }

  const emit = (): void => {
    for (const listener of listeners) listener();
  };

  const persist = (): void => {
    const raw = JSON.stringify(state);
    try {
      localStorage.setItem(STORAGE_KEY, raw);
      // Track last-written raw only on success, so a failed write can never
      // cause getState() to re-adopt the older persisted state.
      lastRaw = raw;
    } catch (error) {
      console.warn(`hometask: could not persist state to "${STORAGE_KEY}"`, error);
    }
    // Subscribers see the in-memory mutation even when persistence failed.
    emit();
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

  return {
    subscribe(fn: () => void): () => void {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },

    getState(): RepoState {
      // Read-through: if another instance persisted a different state, adopt it.
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw !== null && raw !== lastRaw) {
        const external = loadState();
        if (external !== null) {
          state = external;
          lastRaw = raw;
        }
      }
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
      persist();
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
      persist();
    },

    deleteTask(id: string): void {
      state = { ...state, tasks: state.tasks.filter((task) => task.id !== id) };
      enqueue({ kind: "delete_task", taskId: id, at: now() });
      persist();
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
      persist();
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
        dateCompleted: today(),
        updatedAt: stamp,
        fieldUpdatedAt: {
          ...prior.fieldUpdatedAt,
          status: stamp,
          dateCompleted: stamp,
        },
      };
      replaceTask(completed);
      enqueue({ kind: "upsert_task", task: completed, at: now() });
      persist();

      return () => {
        replaceTask(snapshot);
        // The corrective op must WIN under per-field LWW: fresh-stamp every
        // field that differs between the snapshot and the task as it stands
        // after completion (at minimum status and dateCompleted). The
        // in-memory restore keeps the snapshot verbatim.
        const undoStamp = now();
        // Diff against the task as completion left it (captured above) — the
        // in-repo task is already the restored snapshot at this point.
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
        persist();
      };
    },
  };
}
