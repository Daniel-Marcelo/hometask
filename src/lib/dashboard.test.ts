import { describe, expect, it } from "vitest";
import itemListCsvText from "../data/csv/item-list.csv?raw";
import { parseItemListCsv } from "../data/parse";
import type { Room, Task } from "../data/parse";
import { computeDashboard } from "./dashboard";

describe("computeDashboard against the real CSV", () => {
  const { rooms, tasks } = parseItemListCsv(itemListCsvText);
  const dashboard = computeDashboard(rooms, tasks);

  it("reconciles the headline counts with the sheet", () => {
    expect(dashboard.totalTasks).toBe(69);
    expect(dashboard.completed).toBe(13);
    expect(dashboard.remaining).toBe(56);
    expect(dashboard.progressPct).toBe(16.1);
    expect(dashboard.urgentPending).toBe(4);
    expect(dashboard.readyNow).toBe(40);
    expect(dashboard.blocked).toBe(16);
    // Pinned per the plan/sheet tab ("N/A / Later 13"): every N/A task, even
    // though all 13 N/A tasks in the current sheet are Completed.
    expect(dashboard.laterCount).toBe(13);
    expect(dashboard.totalSpendCents).toBe(485800);
    expect(dashboard.budgetedCents).toBe(0);
  });

  it("computes effort-weighted progress from effort weights, not task counts", () => {
    const totalWeight = tasks.reduce((sum, task) => sum + task.effortWeight, 0);
    const completedWeight = tasks
      .filter((task) => task.status === "completed")
      .reduce((sum, task) => sum + task.effortWeight, 0);
    expect(totalWeight).toBe(199);
    expect(completedWeight).toBe(32);
    // 32/199 = 16.08… → 16.1 at one decimal (a naive task-count ratio would be 18.8).
    expect(dashboard.progressPct).toBe(16.1);
  });

  it("reports room progress for every room in sortOrder", () => {
    expect(dashboard.roomProgress).toHaveLength(16);
    expect(dashboard.roomProgress.map((entry) => entry.roomId)).toEqual(
      rooms.map((room) => room.id),
    );

    const hallway = dashboard.roomProgress.find((e) => e.roomId === "hallway");
    expect(hallway).toMatchObject({ total: 7, completed: 3 });

    const utility = dashboard.roomProgress.find((e) => e.roomId === "utility-room");
    expect(utility).toMatchObject({ total: 2, completed: 2, pct: 100 });

    // Room rows must add back up to the headline numbers.
    expect(
      dashboard.roomProgress.reduce((sum, entry) => sum + entry.total, 0),
    ).toBe(69);
    expect(
      dashboard.roomProgress.reduce((sum, entry) => sum + entry.completed, 0),
    ).toBe(13);
  });

  it("counts every priority bucket exactly once", () => {
    expect(dashboard.priorityCounts.urgent).toBe(9);
    const byPriority = (priority: Task["priority"]) =>
      tasks.filter((task) => task.priority === priority).length;
    expect(dashboard.priorityCounts).toEqual({
      urgent: byPriority("urgent"),
      medium: byPriority("medium"),
      low: byPriority("low"),
      very_low: byPriority("very_low"),
    });
  });

  it("counts every status bucket from the task list, not the stale Dashboard tab", () => {
    // The sheet's tab claims "In Progress 0, Planned 3"; the CSV has 2 and 5.
    // Compute from the list and assert against the list itself.
    const byStatus = (status: Task["status"]) =>
      tasks.filter((task) => task.status === status).length;
    expect(dashboard.statusCounts).toEqual({
      completed: byStatus("completed"),
      in_progress: byStatus("in_progress"),
      planned: byStatus("planned"),
      unplanned: byStatus("unplanned"),
    });
    expect(dashboard.statusCounts.completed).toBe(13);
  });

  it("breaks spend down by room", () => {
    const hallway = dashboard.spendByRoom.find((e) => e.roomId === "hallway");
    expect(hallway?.cents).toBe(10000); // £80 + £20
    const allHouse = dashboard.spendByRoom.find((e) => e.roomId === "all-house");
    expect(allHouse?.cents).toBe(390000);
    expect(
      dashboard.spendByRoom.reduce((sum, entry) => sum + entry.cents, 0),
    ).toBe(485800);
  });

  it("lists recent purchases: completed, priced, newest first with title tiebreak", () => {
    const expected = tasks.filter(
      (task) =>
        task.status === "completed" &&
        task.priceCents !== null &&
        task.priceCents > 0,
    );
    expect(dashboard.recentPurchases).toHaveLength(expected.length);

    for (const task of dashboard.recentPurchases) {
      expect(task.status).toBe("completed");
      expect(task.priceCents).toBeGreaterThan(0);
    }

    for (let i = 1; i < dashboard.recentPurchases.length; i++) {
      const prev = dashboard.recentPurchases[i - 1];
      const curr = dashboard.recentPurchases[i];
      const byDate = (prev.dateCompleted ?? "").localeCompare(curr.dateCompleted ?? "");
      expect(byDate).toBeGreaterThanOrEqual(0);
      if (byDate === 0) {
        expect(prev.title.localeCompare(curr.title)).toBeLessThanOrEqual(0);
      }
    }

    // The newest dateCompleted in the list leads.
    const newest = tasks.reduce(
      (max, task) => ((task.dateCompleted ?? "") > max ? (task.dateCompleted ?? "") : max),
      "",
    );
    expect(dashboard.recentPurchases[0]?.dateCompleted).toBe(newest);
  });
});

describe("computeDashboard edge cases (synthetic data)", () => {
  const room = (id: string, name: string, sortOrder: number): Room => ({
    id,
    name,
    sortOrder,
    archived: false,
  });
  const task = (overrides: Partial<Task> & { id: string; roomId: string; title: string }): Task => ({
    status: "planned",
    priority: "medium",
    effort: "S",
    effortWeight: 1,
    canDoNow: "yes",
    priceCents: null,
    datePlanned: null,
    dateCompleted: null,
    notes: "",
    createdAt: "",
    updatedAt: "",
    fieldUpdatedAt: {},
    ...overrides,
  });

  it("breaks dateCompleted ties by title ascending", () => {
    const rooms = [room("r1", "Room 1", 0)];
    const tasks = [
      task({ id: "a", roomId: "r1", title: "Beta", status: "completed", priceCents: 100, dateCompleted: "2026-01-01" }),
      task({ id: "b", roomId: "r1", title: "Alpha", status: "completed", priceCents: 200, dateCompleted: "2026-01-01" }),
      task({ id: "c", roomId: "r1", title: "Older", status: "completed", priceCents: 300, dateCompleted: "2025-12-31" }),
    ];
    const dashboard = computeDashboard(rooms, tasks);
    expect(dashboard.recentPurchases.map((t) => t.title)).toEqual([
      "Alpha",
      "Beta",
      "Older",
    ]);
  });

  it("handles empty rooms and zero totals without dividing by zero", () => {
    const rooms = [room("empty", "Empty", 0)];
    const dashboard = computeDashboard(rooms, []);
    expect(dashboard.totalTasks).toBe(0);
    expect(dashboard.progressPct).toBe(0);
    expect(dashboard.roomProgress).toEqual([
      { roomId: "empty", name: "Empty", total: 0, completed: 0, pct: 0 },
    ]);
    expect(dashboard.spendByRoom).toEqual([]);
    expect(dashboard.recentPurchases).toEqual([]);
  });
});
