import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Room, Task } from "../../data/types";
import itemListCsvText from "../../data/csv/item-list.csv?raw";
import { parseItemListCsv } from "../../data/parse";
import { SpendPage } from "./SpendPage";

// RTL auto-cleanup needs vitest globals, which this project doesn't enable.
afterEach(cleanup);

const STORAGE_KEY = "hometask.v1";

/**
 * Restore the pristine CSV seed. The repo singleton is module-level and
 * persists mutations, so a prior test's writes would poison the aggregate
 * numbers — rewriting the seed JSON makes `getState()` adopt it via the
 * read-through refresh.
 */
function resetSeed(): void {
  const { rooms, tasks } = parseItemListCsv(itemListCsvText);
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ rooms, tasks, queuedOps: [], lastSyncedAt: null }),
  );
}

/** Seed with every task pending: nothing spent, everything budgeted. */
function resetSeedAllPending(): void {
  const { rooms, tasks } = parseItemListCsv(itemListCsvText);
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      rooms,
      tasks: tasks.map((task) => ({
        ...task,
        status: "planned" as const,
        dateCompleted: null,
      })),
      queuedOps: [],
      lastSyncedAt: null,
    }),
  );
}

/** Seed with every price stripped: nothing spent and nothing budgeted. */
function resetSeedUnpriced(): void {
  const { rooms, tasks } = parseItemListCsv(itemListCsvText);
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      rooms,
      tasks: tasks.map((task) => ({ ...task, priceCents: null })),
      queuedOps: [],
      lastSyncedAt: null,
    }),
  );
}

beforeEach(resetSeed);

/**
 * A synthetic seed with 8 spend rooms (each one completed priced task),
 * descending amounts: 1000, 999, … 993 pence. Exercises the top-6 +
 * Other collapsing through the component.
 */
function seedEightSpendRooms(): void {
  const rooms: Room[] = Array.from({ length: 8 }, (_, i) => ({
    id: `r${i}`,
    name: `Room ${i}`,
    sortOrder: i,
    archived: false,
  }));
  const tasks: Task[] = rooms.map((room, i) => ({
    id: `t${i}`,
    roomId: room.id,
    title: `Buy thing ${i}`,
    status: "completed",
    priority: "medium",
    effort: "S",
    effortWeight: 1,
    canDoNow: "na",
    priceCents: 1000 - i,
    datePlanned: null,
    dateCompleted: "2026-01-01",
    notes: "",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    fieldUpdatedAt: {},
  }));
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ rooms, tasks, queuedOps: [], lastSyncedAt: null }),
  );
}

/** Room names of the By-room rows, in rendered order. */
function byRoomNames(): string[] {
  const list = screen.getByRole("list", { name: "By room" });
  return within(list)
    .getAllByRole("listitem")
    .map(
      (row) => row.querySelector<HTMLElement>("span span")?.textContent ?? "",
    );
}

function renderSpend() {
  return render(<SpendPage />);
}

describe("SpendPage", () => {
  it("shows the recorded-costs headline from the real seed", () => {
    renderSpend();
    expect(screen.getByText("Recorded costs")).toBeInTheDocument();
    expect(screen.getByText("£4,858")).toBeInTheDocument();
  });

  it("hides the budgeted-not-spent line when budgetedCents is 0 (real seed)", () => {
    renderSpend();
    expect(screen.queryByText(/budgeted, not spent/)).toBeNull();
  });

  it("lists recent purchases newest first, Fix Roof on top", () => {
    renderSpend();
    const list = screen.getByRole("list", { name: "Recent purchases" });
    const rows = within(list).getAllByRole("listitem");
    // 13 priced completed tasks, but 4 of them cost £0.00 and don't count.
    expect(rows).toHaveLength(9);

    const top = within(rows[0]!);
    expect(top.getByText("Fix Roof")).toBeInTheDocument();
    expect(top.getByText("All House")).toBeInTheDocument();
    expect(top.getByText("2026-11-06")).toBeInTheDocument();
    expect(top.getByText("£3,900")).toBeInTheDocument();
  });

  it("shows by-room bars sorted by spend, largest first", () => {
    renderSpend();
    const list = screen.getByRole("list", { name: "By room" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(6);

    // Largest room first, its bar at 100%.
    const allHouse = within(rows[0]!);
    expect(allHouse.getByText("All House")).toBeInTheDocument();
    expect(allHouse.getByText("£3,900")).toBeInTheDocument();
    expect(allHouse.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "100",
    );

    // Hallway is £100 against a £3,900 top → 2.564% → rounds to 3.
    const hallwayRow = rows.find(
      (row) => row.textContent?.includes("Hallway"),
    )!;
    expect(
      within(hallwayRow).getByRole("progressbar"),
    ).toHaveAttribute("aria-valuenow", "3");
    expect(within(hallwayRow).getByText("£100")).toBeInTheDocument();

    // Six spend rooms in the seed: nothing collapses into Other.
    expect(screen.queryByText(/^Other \(/)).toBeNull();
  });

  it("sorts by-room rows by spend descending", () => {
    renderSpend();
    expect(byRoomNames()).toEqual([
      "All House",
      "Utility Room",
      "Downstair Bathroom",
      "Hallway",
      "Downstair Office",
      "Main Bathroom",
    ]);
  });

  it("collapses rooms past the top 6 into a single Other row", () => {
    seedEightSpendRooms();
    renderSpend();
    const list = screen.getByRole("list", { name: "By room" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(7);

    // Six biggest rooms first, in descending order.
    expect(byRoomNames().slice(0, 6)).toEqual([
      "Room 0",
      "Room 1",
      "Room 2",
      "Room 3",
      "Room 4",
      "Room 5",
    ]);
    expect(within(rows[0]!).getByText("£10")).toBeInTheDocument();

    // The two smallest pool into one row: 994 + 993 pence = £20.
    const other = within(rows[6]!);
    expect(other.getByText("Other (2)")).toBeInTheDocument();
    expect(other.getByText("£20")).toBeInTheDocument();
  });

  it("shows the budgeted-not-spent line and the empty state when nothing is completed", () => {
    resetSeedAllPending();
    renderSpend();
    expect(screen.getByText("£4,858 budgeted, not spent")).toBeInTheDocument();
    expect(screen.getByText("No purchases yet")).toBeInTheDocument();
  });

  it("skips the By-room section when no room has any spend", () => {
    resetSeedUnpriced();
    renderSpend();
    expect(screen.queryByRole("list", { name: "By room" })).toBeNull();
    expect(screen.getByText("No purchases yet")).toBeInTheDocument();
  });
});
