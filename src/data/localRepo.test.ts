import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import itemListCsvText from "./csv/item-list.csv?raw";
import { createLocalRepo } from "./localRepo";

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
    expect(repo.getState().queuedOps.at(-1)).toMatchObject({
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
