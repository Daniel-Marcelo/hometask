import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import itemListCsvText from "./csv/item-list.csv?raw";
import { createLocalRepo } from "./localRepo";
import type { Task, TaskRepo } from "./repo";

const STORAGE_KEY = "hometask.v1";

// "Clean Windows" has priceCents null and null dates — good undo probe.
const CLEAN_WINDOWS_ID = "all-house-clean-windows";

beforeEach(() => {
  localStorage.removeItem(STORAGE_KEY);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createLocalRepo seeding", () => {
  it("seeds 69 tasks and 16 rooms from the CSV on first run", () => {
    const repo = createLocalRepo();
    const state = repo.getState();
    expect(state.tasks).toHaveLength(69);
    expect(state.rooms).toHaveLength(16);
    expect(state.rooms.map((room) => room.name)).toContain("Kitchen/Dining");
    expect(state.tasks[0]).toMatchObject({
      id: "all-house-fix-roof",
      title: "Fix Roof",
      priceCents: 390000,
    });
  });

  it("starts with an empty offline queue and null lastSyncedAt", () => {
    const repo = createLocalRepo();
    const state = repo.getState();
    expect(state.queuedOps).toEqual([]);
    expect(state.lastSyncedAt).toBe(null);
  });

  it("persists the seeded state under hometask.v1", () => {
    createLocalRepo();
    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBe(null);
    const persisted = JSON.parse(raw as string) as {
      rooms: unknown[];
      tasks: unknown[];
      queuedOps: unknown[];
      lastSyncedAt: string | null;
    };
    expect(persisted.tasks).toHaveLength(69);
    expect(persisted.queuedOps).toEqual([]);
    expect(persisted.lastSyncedAt).toBe(null);
  });
});

describe("createLocalRepo mutations", () => {
  it("updateTask stamps fieldUpdatedAt.title and bumps updatedAt", () => {
    vi.useFakeTimers({ now: new Date("2026-11-13T10:00:00.000Z") });
    const repo = createLocalRepo();
    const before = repo.getState().tasks.find((t) => t.id === CLEAN_WINDOWS_ID);
    expect(before).toBeDefined();
    const earlierUpdatedAt = before?.updatedAt ?? "";

    vi.setSystemTime(new Date("2026-11-13T10:00:05.000Z"));
    repo.updateTask(CLEAN_WINDOWS_ID, { title: "Clean Windows properly" });

    const after = repo.getState().tasks.find((t) => t.id === CLEAN_WINDOWS_ID);
    expect(after?.title).toBe("Clean Windows properly");
    expect(after?.fieldUpdatedAt.title).toBeDefined();
    expect(after?.updatedAt).not.toBe(earlierUpdatedAt);
    // Untouched fields keep their values and get no stamp.
    expect(after?.priceCents).toBe(null);
    expect(after?.fieldUpdatedAt.priceCents).toBeUndefined();
  });

  it("grows queuedOps by exactly one upsert op per mutation", () => {
    const repo = createLocalRepo();
    const base = repo.getState().queuedOps.length;
    expect(base).toBe(0);

    repo.updateTask(CLEAN_WINDOWS_ID, { title: "Renamed" });
    expect(repo.getState().queuedOps).toHaveLength(1);
    expect(repo.getState().queuedOps[0]).toMatchObject({
      kind: "upsert_task",
      task: { id: CLEAN_WINDOWS_ID, title: "Renamed" },
    });

    const added = repo.addTask({
      roomId: "hallway",
      title: "Test Task",
      status: "unplanned",
      priority: "low",
      effort: "S",
      effortWeight: 2,
      canDoNow: "yes",
      priceCents: null,
      datePlanned: null,
      dateCompleted: null,
      notes: "",
    });
    expect(repo.getState().queuedOps).toHaveLength(2);
    expect(repo.getState().queuedOps[1]).toMatchObject({
      kind: "upsert_task",
      task: { id: added.id, title: "Test Task" },
    });
    expect(added.createdAt).toBe(added.updatedAt);

    repo.addRoom("Garage");
    expect(repo.getState().queuedOps).toHaveLength(3);
    expect(repo.getState().queuedOps[2]).toMatchObject({ kind: "upsert_room" });
    const garage = repo.getState().rooms.at(-1);
    expect(garage).toMatchObject({ name: "Garage", sortOrder: 16, archived: false });

    repo.deleteTask(added.id);
    expect(repo.getState().queuedOps).toHaveLength(4);
    expect(repo.getState().queuedOps[3]).toMatchObject({
      kind: "delete_task",
      taskId: added.id,
    });
    expect(repo.getState().tasks.some((t) => t.id === added.id)).toBe(false);
  });

  it("addTask generates a unique id even for duplicate titles", () => {
    const repo = createLocalRepo();
    const input = {
      roomId: "hallway",
      title: "Buy Rug",
      status: "unplanned" as const,
      priority: "low" as const,
      effort: "S" as const,
      effortWeight: 2,
      canDoNow: "yes" as const,
      priceCents: null,
      datePlanned: null,
      dateCompleted: null,
      notes: "",
    };
    const first = repo.addTask(input);
    const second = repo.addTask(input);
    expect(first.id).not.toBe(second.id);
    expect(new Set(repo.getState().tasks.map((t) => t.id)).size).toBe(
      repo.getState().tasks.length,
    );
  });
});

describe("createLocalRepo completeWithUndo", () => {
  it("completes with today's date, then undo restores the exact prior task object", () => {
    const repo = createLocalRepo();
    const before = repo.getState().tasks.find((t) => t.id === CLEAN_WINDOWS_ID);
    expect(before).toBeDefined();
    const snapshot = structuredClone(before);

    const opsBefore = repo.getState().queuedOps.length;
    const undo = repo.completeWithUndo(CLEAN_WINDOWS_ID);

    const completed = repo.getState().tasks.find((t) => t.id === CLEAN_WINDOWS_ID);
    expect(completed?.status).toBe("completed");
    expect(completed?.dateCompleted).toBe(new Date().toISOString().slice(0, 10));
    expect(completed?.fieldUpdatedAt.status).toBeDefined();
    expect(completed?.fieldUpdatedAt.dateCompleted).toBeDefined();
    expect(repo.getState().queuedOps).toHaveLength(opsBefore + 1);
    expect(repo.getState().queuedOps.at(opsBefore)).toMatchObject({
      kind: "upsert_task",
      task: { id: CLEAN_WINDOWS_ID, status: "completed" },
    });

    undo();

    const restored = repo.getState().tasks.find((t) => t.id === CLEAN_WINDOWS_ID);
    // Deep equal: every field incl. priceCents null, dates, fieldUpdatedAt map.
    expect(restored).toEqual(snapshot);
    expect(restored?.priceCents).toBe(null);
    expect(restored?.dateCompleted).toBe(null);
    expect(restored?.fieldUpdatedAt).toEqual(snapshot?.fieldUpdatedAt);
    // Undo enqueues a corrective op so remote peers can converge.
    expect(repo.getState().queuedOps).toHaveLength(opsBefore + 2);
  });

  it("fresh-stamps the corrective undo op so it wins under per-field LWW", () => {
    vi.useFakeTimers({ now: new Date("2026-11-13T10:00:00.000Z") });
    const repo = createLocalRepo();

    const undo = repo.completeWithUndo(CLEAN_WINDOWS_ID);
    const completionOp = repo.getState().queuedOps.at(-1);
    expect(completionOp).toMatchObject({ kind: "upsert_task" });

    vi.setSystemTime(new Date("2026-11-13T10:00:03.000Z"));
    undo();

    const correctiveOp = repo.getState().queuedOps.at(-1);
    expect(correctiveOp).toMatchObject({ kind: "upsert_task" });
    // Narrow the union after the kind assertions above.
    const correctiveTask = (correctiveOp as { task: Task }).task;
    const completionTask = (completionOp as { task: Task }).task;

    // The reverted fields carry the UNDO stamp — strictly newer than the
    // completion's stamp — so Task 15's per-field LWW picks the reversion.
    expect(correctiveTask.fieldUpdatedAt.status).toBe("2026-11-13T10:00:03.000Z");
    expect(correctiveTask.fieldUpdatedAt.dateCompleted).toBe("2026-11-13T10:00:03.000Z");
    expect(correctiveTask.fieldUpdatedAt.status > completionTask.fieldUpdatedAt.status).toBe(
      true,
    );
    expect(
      correctiveTask.fieldUpdatedAt.dateCompleted >
        completionTask.fieldUpdatedAt.dateCompleted,
    ).toBe(true);
    expect(correctiveTask.updatedAt > completionTask.updatedAt).toBe(true);
    expect(correctiveTask.status).toBe("unplanned");
    expect(correctiveTask.dateCompleted).toBe(null);

    // The in-memory restore still keeps the snapshot verbatim.
    const restored = repo.getState().tasks.find((t) => t.id === CLEAN_WINDOWS_ID);
    expect(restored?.status).toBe("unplanned");
    expect(restored?.dateCompleted).toBe(null);
  });
});

describe("createLocalRepo storage failures", () => {
  it("survives a throwing setItem: no throw escapes, subscriber notified, state intact", () => {
    const repo = createLocalRepo();
    let emissions = 0;
    const unsubscribe = repo.subscribe(() => {
      emissions += 1;
    });

    // Simulate QuotaExceededError: setItem throws on the update path.
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota exceeded", "QuotaExceededError");
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(() =>
        repo.updateTask(CLEAN_WINDOWS_ID, { title: "Offline edit" }),
      ).not.toThrow();

      // Subscribers still see the mutation, and the in-memory state wins.
      expect(emissions).toBe(1);
      const after = repo.getState().tasks.find((t) => t.id === CLEAN_WINDOWS_ID);
      expect(after?.title).toBe("Offline edit");
      expect(after?.fieldUpdatedAt.title).toBeDefined();
      expect(repo.getState().tasks).toHaveLength(69);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      // Persisted copy still holds the pre-mutation value (write failed), yet
      // read-through must NOT revert the in-memory edit.
      const persisted = JSON.parse(
        localStorage.getItem(STORAGE_KEY) as string,
      ) as { tasks: Array<{ id: string; title: string }> };
      expect(
        persisted.tasks.find((t) => t.id === CLEAN_WINDOWS_ID)?.title,
      ).toBe("Clean Windows");
      expect(repo.getState().tasks.find((t) => t.id === CLEAN_WINDOWS_ID)?.title).toBe(
        "Offline edit",
      );
    } finally {
      setItemSpy.mockRestore();
      warnSpy.mockRestore();
      unsubscribe();
    }
  });

  it("warns when the seed write fails instead of crashing at import time", () => {
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("security error", "SecurityError");
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      let crashed: TaskRepo | null = null;
      expect(() => {
        crashed = createLocalRepo();
      }).not.toThrow();
      // The seeded state is still fully usable in memory.
      const repoAfterCrash = crashed as unknown as TaskRepo;
      expect(repoAfterCrash.getState().tasks).toHaveLength(69);
      expect(repoAfterCrash.getState().rooms).toHaveLength(16);
      expect(warnSpy).toHaveBeenCalledTimes(1);
    } finally {
      setItemSpy.mockRestore();
      warnSpy.mockRestore();
    }
  });
});

describe("two createLocalRepo instances share localStorage state", () => {
  it("second instance sees the first instance's mutation via getState()", () => {
    const repoA = createLocalRepo();
    const repoB = createLocalRepo();

    expect(repoB.getState().tasks).toHaveLength(69);
    repoA.updateTask(CLEAN_WINDOWS_ID, { title: "Seen by B" });

    const seenByB = repoB.getState().tasks.find((t) => t.id === CLEAN_WINDOWS_ID);
    expect(seenByB?.title).toBe("Seen by B");
    expect(repoB.getState().tasks).toHaveLength(69);

    // And the queue accumulated by A is visible to B as well.
    expect(repoB.getState().queuedOps).toHaveLength(1);
  });
});

// Sanity: the CSV fixture the repo seeds from is the real one.
describe("seed source", () => {
  it("parses the imported CSV to 69 tasks", () => {
    expect(itemListCsvText.split("\n").filter((line) => line.trim() !== "")).toHaveLength(70);
  });
});
