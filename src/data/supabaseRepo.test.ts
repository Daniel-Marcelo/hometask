import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseRepo, hasSupabaseEnv } from "./supabaseRepo";
import type { NewTask } from "./repo";
import type {
  ChangePayload,
  RealtimeChannelLike,
  SupabaseClientLike,
} from "./supabaseRepo";

// ————————————————————————————————————————————————————————————————
// Fake supabase client: no network. Records writes, captures realtime
// handlers, and can simulate write failures ("offline").
// ————————————————————————————————————————————————————————————————

interface SentUpsert {
  table: string;
  rows: Array<Record<string, unknown>>;
}

interface FakeHarness {
  client: SupabaseClientLike;
  sent: { upserts: SentUpsert[]; deletes: Array<{ table: string; id: string }> };
  /** Handlers registered per table, in registration order. */
  handlers: Array<{ table: string; callback: (payload: ChangePayload) => void }>;
  /** Deliver a realtime payload to the handler registered for `table`. */
  deliver(table: string, payload: ChangePayload): void;
  /** When true, every upsert fails with a retryable (status-less) error. */
  failUpserts: boolean;
  /**
   * When set, the NEXT upsert fails with exactly this error (then the knob
   * resets), simulating a one-off permanent (4xx) or server (5xx) failure.
   */
  failNextUpsert: { status?: number; message: string } | null;
}

function makeFakeClient(): FakeHarness {
  const sent: FakeHarness["sent"] = { upserts: [], deletes: [] };
  const handlers: FakeHarness["handlers"] = [];
  const harness: FakeHarness = {
    client: {
      from(table: string) {
        return {
          select: () => Promise.resolve({ data: [], error: null, status: 200 }),
          upsert: (values: unknown) => {
            if (harness.failNextUpsert !== null) {
              // Real supabase-js shape: PostgrestError body on `error`, HTTP
              // status on the envelope (never on the error object).
              const failure = harness.failNextUpsert;
              harness.failNextUpsert = null;
              return Promise.resolve({
                data: null,
                error: {
                  message: failure.message,
                  details: null,
                  hint: null,
                  code: null,
                },
                status: failure.status,
              });
            }
            if (harness.failUpserts) {
              // Network-style failure: no envelope status at all.
              return Promise.resolve({
                data: null,
                error: { message: "network down" },
              });
            }
            const rows = (Array.isArray(values) ? values : [values]) as Array<
              Record<string, unknown>
            >;
            sent.upserts.push({ table, rows });
            return Promise.resolve({ data: null, error: null, status: 201 });
          },
          delete: () => ({
            eq: (column: string, value: unknown) => {
              void column;
              if (harness.failUpserts) {
                return Promise.resolve({
                  data: null,
                  error: { message: "network down" },
                });
              }
              sent.deletes.push({ table, id: String(value) });
              return Promise.resolve({ data: null, error: null, status: 204 });
            },
          }),
        };
      },
      channel(_name: string): RealtimeChannelLike {
        const channel: RealtimeChannelLike = {
          on(
            _event: "postgres_changes",
            filter: { event: string; schema: string; table: string },
            callback: (payload: ChangePayload) => void,
          ): RealtimeChannelLike {
            handlers.push({ table: filter.table, callback });
            return channel;
          },
          subscribe(): RealtimeChannelLike {
            return channel;
          },
        };
        return channel;
      },
      removeChannel(): void {
        // Nothing to clean up in the fake.
      },
    },
    sent,
    handlers,
    deliver(table: string, payload: ChangePayload): void {
      for (const handler of handlers) {
        if (handler.table === table) handler.callback(payload);
      }
    },
    failUpserts: false,
    failNextUpsert: null,
  };
  return harness;
}

/** Drain the flush/load promise chains (fake client resolves immediately). */
async function settle(): Promise<void> {
  for (let i = 0; i < 100; i++) await Promise.resolve();
}

const NEW_TASK: Omit<NewTask, "roomId"> = {
  title: "Wipe counters",
  status: "planned",
  priority: "medium",
  effort: "S",
  effortWeight: 2,
  canDoNow: "yes",
  priceCents: null,
  datePlanned: null,
  dateCompleted: null,
  notes: "",
};

beforeEach(() => {
  vi.useFakeTimers({ now: new Date("2026-11-13T10:00:00.000Z") });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("createSupabaseRepo env handling", () => {
  it("hasSupabaseEnv is true only when both vars are non-empty strings", () => {
    expect(hasSupabaseEnv()).toBe(false);
    vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
    expect(hasSupabaseEnv()).toBe(false); // anon key still missing
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "anon-key");
    expect(hasSupabaseEnv()).toBe(true);
  });

  it("throws a descriptive error when constructed without env vars", () => {
    expect(() => createSupabaseRepo()).toThrowError(/VITE_SUPABASE_URL/);
  });
});

describe("createSupabaseRepo updateTask (pinned 1)", () => {
  it("writes patched fields to the tasks table and bumps fieldUpdatedAt stamps", async () => {
    const fake = makeFakeClient();
    const repo = createSupabaseRepo({ client: fake.client });
    await settle(); // initial load

    const room = repo.addRoom("Kitchen");
    const task = repo.addTask({ roomId: room.id, ...NEW_TASK });
    await settle();
    expect(repo.getState().queuedOps).toHaveLength(0);
    fake.sent.upserts.length = 0; // ignore the seed writes

    vi.setSystemTime(new Date("2026-11-13T10:00:05.000Z"));
    repo.updateTask(task.id, { title: "Wipe counters properly", priceCents: 2500 });
    await settle();

    expect(repo.getState().queuedOps).toHaveLength(0);
    const taskUpserts = fake.sent.upserts.filter((u) => u.table === "tasks");
    expect(taskUpserts).toHaveLength(1);
    const row = taskUpserts[0]?.rows[0] as Record<string, unknown>;
    expect(row.id).toBe(task.id);
    expect(row.title).toBe("Wipe counters properly");
    expect(row.price_cents).toBe(2500);
    expect(row.updated_at).toBe("2026-11-13T10:00:05.000Z");
    const stamps = row.field_updated_at as Record<string, string>;
    expect(stamps.title).toBe("2026-11-13T10:00:05.000Z");
    expect(stamps.priceCents).toBe("2026-11-13T10:00:05.000Z");
    // Untouched fields get no fresh stamp.
    expect(stamps.effort).toBeUndefined();
    expect(row.effort).toBe("S");
  });
});

describe("createSupabaseRepo realtime (pinned 2)", () => {
  it("applies incoming fields only when their remote stamp beats the local stamp", async () => {
    const fake = makeFakeClient();
    const repo = createSupabaseRepo({ client: fake.client });
    await settle();

    const room = repo.addRoom("Kitchen");
    const task = repo.addTask({ roomId: room.id, ...NEW_TASK });
    await settle();

    // Local edit at T+5s: title stamped here.
    vi.setSystemTime(new Date("2026-11-13T10:00:05.000Z"));
    repo.updateTask(task.id, { title: "Local edit" });
    await settle();

    // Remote row: title changed but stamped OLDER than the local edit (loses);
    // notes changed and stamped NEWER (wins).
    fake.deliver("tasks", {
      eventType: "UPDATE",
      new: {
        id: task.id,
        room_id: room.id,
        title: "Remote edit",
        status: "planned",
        priority: "medium",
        effort: "S",
        effort_weight: 2,
        can_do_now: "yes",
        price_cents: null,
        date_planned: null,
        date_completed: null,
        notes: "Remote notes",
        created_at: "2026-11-13T10:00:00.000Z",
        updated_at: "2026-11-13T10:00:09.000Z",
        field_updated_at: {
          title: "2026-11-13T09:59:00.000Z",
          notes: "2026-11-13T10:00:09.000Z",
        },
      },
      old: {},
    });

    const after = repo.getState().tasks.find((t) => t.id === task.id);
    expect(after?.title).toBe("Local edit"); // older remote stamp loses
    expect(after?.notes).toBe("Remote notes"); // newer remote stamp wins
    expect(after?.fieldUpdatedAt.title).toBe("2026-11-13T10:00:05.000Z");
    expect(after?.fieldUpdatedAt.notes).toBe("2026-11-13T10:00:09.000Z");
  });

  it("adds tasks the local store has never seen (INSERT)", async () => {
    const fake = makeFakeClient();
    const repo = createSupabaseRepo({ client: fake.client });
    await settle();

    fake.deliver("tasks", {
      eventType: "INSERT",
      new: {
        id: "garage/oil-the-door",
        room_id: "garage",
        title: "Oil the door",
        status: "planned",
        priority: "low",
        effort: "XS",
        effort_weight: 1,
        can_do_now: "yes",
        price_cents: null,
        date_planned: null,
        date_completed: null,
        notes: "",
        created_at: "2026-11-13T11:00:00.000Z",
        updated_at: "2026-11-13T11:00:00.000Z",
        field_updated_at: {},
      },
      old: {},
    });

    expect(repo.getState().tasks.some((t) => t.id === "garage/oil-the-door")).toBe(true);
  });
});

describe("createSupabaseRepo offline flush (pinned 3)", () => {
  it("queues ops while writes fail and flushes them on the window online event", async () => {
    const fake = makeFakeClient();
    fake.failUpserts = true; // simulate offline
    const repo = createSupabaseRepo({ client: fake.client });
    await settle();

    const room = repo.addRoom("Garage");
    const task = repo.addTask({ roomId: room.id, ...NEW_TASK });
    await settle();

    expect(repo.getState().queuedOps).toHaveLength(2); // upsert_room + upsert_task
    expect(fake.sent.upserts).toHaveLength(0);
    expect(fake.sent.deletes).toHaveLength(0);

    fake.failUpserts = false;
    window.dispatchEvent(new Event("online"));
    await settle();

    expect(repo.getState().queuedOps).toHaveLength(0);
    expect(fake.sent.upserts.map((u) => u.table)).toEqual(["rooms", "tasks"]);
    const roomRow = fake.sent.upserts[0]?.rows[0] as Record<string, unknown>;
    const taskRow = fake.sent.upserts[1]?.rows[0] as Record<string, unknown>;
    expect(roomRow.id).toBe(room.id);
    expect(taskRow.room_id).toBe(room.id);
    expect(taskRow.title).toBe(task.title);
  });
});

describe("createSupabaseRepo op failure handling", () => {
  it("drops an op whose 400 response envelope says so, and still flushes later ops", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fake = makeFakeClient();
    const repo = createSupabaseRepo({ client: fake.client });
    await settle();

    const room = repo.addRoom("Kitchen");
    await settle();
    fake.sent.upserts.length = 0;

    // First op fails permanently; the second is enqueued while the first
    // drain is still pending (same tick), so both sit in the queue together.
    // The status rides the response envelope, like the real client.
    fake.failNextUpsert = { status: 400, message: "invalid payload" };
    repo.addTask({ roomId: room.id, ...NEW_TASK, title: "Broken" });
    repo.addTask({ roomId: room.id, ...NEW_TASK, title: "Fine" });
    await settle();

    // The permanently invalid op is gone from the queue; the valid op after
    // it was flushed anyway.
    expect(repo.getState().queuedOps).toHaveLength(0);
    const sentTitles = fake.sent.upserts
      .filter((u) => u.table === "tasks")
      .flatMap((u) => u.rows.map((r) => r.title));
    expect(sentTitles).toEqual(["Fine"]);
    // And the drop was logged.
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("dropping"),
      expect.anything(),
    );
  });

  it("keeps an op queued when the response envelope says 403 and stops the drain", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fake = makeFakeClient();
    const repo = createSupabaseRepo({ client: fake.client });
    await settle();

    fake.failNextUpsert = {
      status: 403,
      message: "new row violates row-level security policy",
    };
    repo.addRoom("Garage");
    await settle();

    // 403 is recoverable (not-yet-allowlisted user): the op stays queued and
    // the drain stops instead of dropping it.
    expect(repo.getState().queuedOps).toHaveLength(1);
    expect(fake.sent.upserts).toHaveLength(0);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("will retry"),
      expect.anything(),
    );

    fake.failNextUpsert = null;
    window.dispatchEvent(new Event("online"));
    await settle();

    expect(repo.getState().queuedOps).toHaveLength(0);
    expect(fake.sent.upserts.map((u) => u.table)).toEqual(["rooms"]);
  });

  it("keeps a retryable op queued, logs it, and flushes on the online event", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fake = makeFakeClient();
    fake.failNextUpsert = { status: 500, message: "server exploded" };
    const repo = createSupabaseRepo({ client: fake.client });
    await settle();

    repo.addRoom("Garage");
    await settle();

    expect(repo.getState().queuedOps).toHaveLength(1); // upsert_room kept
    expect(fake.sent.upserts).toHaveLength(0);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("will retry"),
      expect.anything(),
    );

    fake.failNextUpsert = null;
    window.dispatchEvent(new Event("online"));
    await settle();

    expect(repo.getState().queuedOps).toHaveLength(0);
    expect(fake.sent.upserts.map((u) => u.table)).toEqual(["rooms"]);
  });
});
