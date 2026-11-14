import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import itemListCsvText from "../../data/csv/item-list.csv?raw";
import { parseItemListCsv } from "../../data/parse";
import { HomePage } from "./HomePage";

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

beforeEach(resetSeed);

/** HomePage inside a router, plus a silent probe recording the live pathname. */
function renderHome() {
  let pathname = "/";
  function LocationProbe(): null {
    const location = useLocation();
    pathname = location.pathname;
    return null;
  }
  const { container } = render(
    <MemoryRouter initialEntries={["/"]}>
      <HomePage />
      <LocationProbe />
    </MemoryRouter>,
  );
  return { container, pathname: () => pathname };
}

/** Titles of the ready-now list, in rendered order. */
function readyTitles(): string[] {
  const readyList = screen.getByRole("list", { name: "Ready now" });
  return within(readyList)
    .getAllByRole("listitem")
    .map(
      (row) =>
        row.querySelector<HTMLElement>(".ht-row__title")?.textContent ?? "",
    );
}

describe("HomePage", () => {
  it("shows the sheet's headline numbers from the real seed", () => {
    renderHome();
    expect(screen.getByText("16.1%")).toBeInTheDocument();
    expect(screen.getByText("£4,858")).toBeInTheDocument();
    expect(screen.getByText("56")).toBeInTheDocument();
  });

  it("greets by local hour (5–11 morning, 12–17 afternoon, else evening)", () => {
    const cases: Array<[number, string]> = [
      [5, "Good morning"],
      [11, "Good morning"],
      [12, "Good afternoon"],
      [17, "Good afternoon"],
      [4, "Good evening"],
      [18, "Good evening"],
    ];
    for (const [hour, expected] of cases) {
      const spy = vi
        .spyOn(Date.prototype, "getHours")
        .mockReturnValue(hour);
      cleanup();
      renderHome();
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
        expected,
      );
      spy.mockRestore();
    }
  });

  it("hides the budgeted-not-spent line when budgetedCents is 0 (real seed)", () => {
    renderHome();
    expect(screen.queryByText(/budgeted, not spent/)).toBeNull();
  });

  it("lists every room in sortOrder with x/y counts and progress bars", () => {
    renderHome();
    const rooms = screen.getByRole("list", { name: "Rooms" });
    const rows = within(rooms).getAllByRole("button");
    expect(rows).toHaveLength(16);

    // Utility Room: all 2 tasks completed — full bar.
    const utility = within(rooms).getByRole("button", {
      name: "Open Utility Room",
    });
    expect(within(utility).getByText("2/2")).toBeInTheDocument();
    expect(within(utility).getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "100",
    );

    // Hallway: 3 of 7 done → 6/21 effort weight = 28.6% → rounds to 29.
    const hallway = within(rooms).getByRole("button", {
      name: "Open Hallway",
    });
    expect(within(hallway).getByText("3/7")).toBeInTheDocument();
    expect(within(hallway).getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "29",
    );
  });

  it("tapping a room row navigates to /rooms/:id", () => {
    const { pathname } = renderHome();
    fireEvent.click(
      screen.getByRole("button", { name: "Open Utility Room" }),
    );
    expect(pathname()).toBe("/rooms/utility-room");
  });

  it("the ready-now list holds the 40 ready pending tasks, urgent first", () => {
    renderHome();
    expect(readyTitles()).toHaveLength(40);
    expect(screen.getByText("Ready now (40)")).toBeInTheDocument();

    const titles = readyTitles();
    // Urgent before medium.
    expect(titles.indexOf("Return other Rug")).toBeLessThan(
      titles.indexOf("Clean Windows"),
    );
    // Within one priority (both Medium), lighter effort first.
    expect(titles.indexOf("Paint Stairs")).toBeLessThan(
      titles.indexOf("Clean Windows"),
    );
  });

  it("never lists completed tasks as ready", () => {
    renderHome();
    const readyList = screen.getByRole("list", { name: "Ready now" });
    expect(within(readyList).queryByText("Fix Roof")).toBeNull();
    expect(within(readyList).queryByText("Buy Sideboard")).toBeNull();
  });

  it("tapping a ready task opens its TaskSheet", () => {
    const { container } = renderHome();
    fireEvent.click(
      screen.getByRole("button", { name: "Open Return other Rug" }),
    );
    // The sheet is up: its own controls appear over the page.
    expect(
      screen.getByRole("button", { name: "Mark as done" }),
    ).toBeInTheDocument();

    // Backdrop click closes it again.
    fireEvent.click(container.querySelector(".ht-sheet__backdrop")!);
    expect(screen.queryByRole("button", { name: "Mark as done" })).toBeNull();
  });
});
