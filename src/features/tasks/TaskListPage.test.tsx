import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import itemListCsvText from "../../data/csv/item-list.csv?raw";
import { parseItemListCsv } from "../../data/parse";
import type { Priority, Task } from "../../data/repo";
import { repo } from "../../data/useRepo";
import { TaskListPage } from "./TaskListPage";

// RTL auto-cleanup needs vitest globals, which this project doesn't enable.
afterEach(cleanup);

const STORAGE_KEY = "hometask.v1";

/**
 * Restore the pristine CSV seed. The repo singleton is module-level and
 * persists mutations, so a prior test's writes would poison the aggregate
 * counts — rewriting the seed JSON makes `getState()` adopt it via the
 * read-through refresh.
 */
function resetSeed(): void {
  const { rooms, tasks } = parseItemListCsv(itemListCsvText);
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ rooms, tasks, queuedOps: [], lastSyncedAt: null }),
  );
}

beforeEach(resetSeed);

/** Sort rank: urgent first — mirrors the page's contract. */
const PRIORITY_RANK: Record<Priority, number> = {
  urgent: 0,
  medium: 1,
  low: 2,
  very_low: 3,
};

/** Expected default order: priority, effort weight, room name, title. */
function expectedSort(tasks: Task[], rooms: { id: string; name: string }[]): Task[] {
  const roomName = (id: string): string =>
    rooms.find((room) => room.id === id)?.name ?? "";
  return [...tasks]
    .filter((task) => task.status !== "completed")
    .sort(
      (a, b) =>
        PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
        a.effortWeight - b.effortWeight ||
        roomName(a.roomId).localeCompare(roomName(b.roomId)) ||
        a.title.localeCompare(b.title),
    );
}

/** Titles of a list, in rendered order. */
function titlesOf(list: HTMLElement): string[] {
  return within(list)
    .getAllByRole("listitem")
    .map(
      (row) =>
        row.querySelector<HTMLElement>(".ht-row__title")?.textContent ?? "",
    );
}

/** roomId of a room by name, from the seeded repo. */
function roomIdOf(name: string): string {
  const room = repo.getState().rooms.find((room) => room.name === name);
  if (room === undefined) throw new Error(`room not found: ${name}`);
  return room.id;
}

function renderTasks() {
  return render(<TaskListPage />);
}

describe("TaskListPage", () => {
  it("shows every open task by default with completed collapsed as Completed (13)", () => {
    renderTasks();

    // 69 seeded tasks, 13 completed → 56 in the open list.
    const openList = screen.getByRole("list", { name: "Tasks" });
    expect(within(openList).getAllByRole("listitem")).toHaveLength(56);

    // Collapsed by default: header present, no completed rows rendered.
    const toggle = screen.getByRole("button", { name: "Completed (13)" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("list", { name: "Completed" })).toBeNull();

    // Expanding reveals all 13, and "Fix Roof" lives only here.
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const completedList = screen.getByRole("list", { name: "Completed" });
    expect(within(completedList).getAllByRole("listitem")).toHaveLength(13);
    expect(within(completedList).getByText("Fix Roof")).toBeInTheDocument();
    expect(within(openList).queryByText("Fix Roof")).toBeNull();
  });

  it("default sort: priority rank, then effort weight, then room, then title", () => {
    renderTasks();
    const { tasks, rooms } = repo.getState();
    const expected = expectedSort(tasks, rooms).map((task) => task.title);

    const titles = titlesOf(screen.getByRole("list", { name: "Tasks" }));
    expect(titles.slice(0, 3)).toEqual(expected.slice(0, 3));
    expect(titles).toEqual(expected);
  });

  it("room filter Hallway shows exactly 7 tasks (4 open + 3 completed)", () => {
    renderTasks();
    // Expand the completed section so both halves are counted.
    fireEvent.click(screen.getByRole("button", { name: "Completed (13)" }));

    fireEvent.change(screen.getByRole("combobox", { name: "Room" }), {
      target: { value: roomIdOf("Hallway") },
    });

    expect(screen.getAllByRole("listitem")).toHaveLength(7);
    expect(screen.getByText("Completed (3)")).toBeInTheDocument();
    const completedList = screen.getByRole("list", { name: "Completed" });
    expect(within(completedList).getByText("Buy Sideboard")).toBeInTheDocument();
    expect(within(completedList).queryByText("Fix Roof")).toBeNull();
  });

  it('status filter "Planned" shows exactly 5 tasks and no completed section', () => {
    renderTasks();

    fireEvent.change(screen.getByRole("combobox", { name: "Status" }), {
      target: { value: "planned" },
    });

    expect(screen.getAllByRole("listitem")).toHaveLength(5);
    // No completed task can be Planned — the whole section drops out.
    expect(screen.queryByText(/Completed \(/)).toBeNull();
  });

  it('the "Ready now" toggle keeps the 40 can-do-now open tasks', () => {
    renderTasks();

    const toggle = screen.getByRole("button", { name: "Ready now" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "true");

    expect(screen.getAllByRole("listitem")).toHaveLength(40);
  });

  it("tapping a task opens its TaskSheet", () => {
    renderTasks();

    fireEvent.click(
      screen.getByRole("button", { name: "Open Clean Windows" }),
    );
    expect(
      screen.getByRole("button", { name: "Mark as done" }),
    ).toBeInTheDocument();
  });

  it("the Fab opens NewTaskSheet (no default room), and it closes again", () => {
    renderTasks();

    fireEvent.click(screen.getByRole("button", { name: "Add a task" }));
    expect(screen.getByRole("dialog", { name: "New task" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add task" }),
    ).toBeInTheDocument();

    // Sheet stays mounted-but-closed: no dialog after backdrop click.
    fireEvent.click(document.querySelector(".ht-sheet__backdrop")!);
    expect(screen.queryByRole("dialog", { name: "New task" })).toBeNull();
  });
});
