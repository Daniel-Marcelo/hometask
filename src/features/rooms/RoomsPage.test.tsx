import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import itemListCsvText from "../../data/csv/item-list.csv?raw";
import { parseItemListCsv } from "../../data/parse";
import { repo } from "../../data/useRepo";
import { RoomDetailPage } from "./RoomDetailPage";
import { RoomsPage } from "./RoomsPage";

// RTL auto-cleanup needs vitest globals, which this project doesn't enable.
afterEach(cleanup);

const STORAGE_KEY = "hometask.v1";

/**
 * Restore the pristine CSV seed. The repo singleton is module-level and
 * persists mutations, so a prior test's writes (addRoom, task edits) would
 * poison the counts — rewriting the seed JSON makes `getState()` adopt it
 * via the read-through refresh.
 */
function resetSeed(): void {
  const { rooms, tasks } = parseItemListCsv(itemListCsvText);
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ rooms, tasks, queuedOps: [], lastSyncedAt: null }),
  );
}

beforeEach(resetSeed);

/** Both room routes at once, so a card tap can walk straight into detail. */
function renderRooms(initialEntry = "/rooms") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/rooms" element={<RoomsPage />} />
        <Route path="/rooms/:id" element={<RoomDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("RoomsPage", () => {
  it("lists all 16 seeded rooms in sortOrder with counts and progress", () => {
    renderRooms();

    const list = screen.getByRole("list", { name: "Rooms" });
    const cards = within(list).getAllByRole("button");
    expect(cards).toHaveLength(16);

    // Pinned from the real seed: Main Living Room has 11 tasks, none done.
    expect(
      screen.getByRole("button", { name: "Main Living Room · 0/11" }),
    ).toBeInTheDocument();

    // Hallway: 3 of 7 done, 4 open tasks all doable right now.
    const hallway = screen.getByRole("button", { name: "Hallway · 3/7" });
    expect(within(hallway).getByRole("progressbar")).toBeInTheDocument();
    expect(within(hallway).getByText("4 ready now")).toBeInTheDocument();
  });

  it("tapping a room card navigates to its detail page", () => {
    renderRooms();

    fireEvent.click(screen.getByRole("button", { name: "Hallway · 3/7" }));
    expect(
      screen.getByRole("heading", { level: 1, name: "Hallway" }),
    ).toBeInTheDocument();
  });

  it("Add room: a name typed into the sheet appears in the list at the end", () => {
    renderRooms();

    fireEvent.click(screen.getByRole("button", { name: "Add room" }));
    const dialog = screen.getByRole("dialog", { name: "Add room" });
    fireEvent.change(within(dialog).getByLabelText("Room name"), {
      target: { value: "Loft" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    // The new room sits last (fresh sortOrder) with no tasks yet, so no
    // "ready now" line and an empty denominator.
    const list = screen.getByRole("list", { name: "Rooms" });
    const cards = within(list).getAllByRole("button");
    expect(cards).toHaveLength(17);
    expect(
      screen.getByRole("button", { name: "Loft · 0/0" }),
    ).toBeInTheDocument();
    expect(cards[cards.length - 1]).toHaveAccessibleName("Loft · 0/0");
  });
});

describe("RoomDetailPage", () => {
  it("shows the room header with counts and progress, and its tasks", () => {
    renderRooms("/rooms/hallway");

    expect(
      screen.getByRole("heading", { level: 1, name: "Hallway" }),
    ).toBeInTheDocument();
    expect(screen.getByText("3/7 completed")).toBeInTheDocument();

    // 7 hallway tasks render: 4 open + 3 completed, and exactly 3 rows are
    // struck through by the completed CSS.
    expect(screen.getAllByRole("listitem")).toHaveLength(7);
    expect(document.querySelectorAll(".ht-row--done")).toHaveLength(3);
  });

  it("sorts the open list by priority rank, effort weight, then title", () => {
    renderRooms("/rooms/hallway");

    const openList = screen.getByRole("list", { name: "Tasks" });
    const titles = within(openList)
      .getAllByRole("listitem")
      .map(
        (row) =>
          row.querySelector<HTMLElement>(".ht-row__title")?.textContent ?? "",
      );
    // Paint Stairs (Medium/M) before Buy Shoe Cabinet (Low/S) before the two
    // Very Low tasks, the lighter effort first, then title.
    expect(titles).toEqual([
      "Paint Stairs",
      "Buy Shoe Cabinet",
      "Renovate Grout",
      "Renovate Staircase",
    ]);
  });

  it("the Fab opens NewTaskSheet pre-set to this room", () => {
    renderRooms("/rooms/hallway");

    fireEvent.click(screen.getByRole("button", { name: "Add a task" }));
    const roomSelect = screen.getByRole("combobox", { name: "Room" });
    const hallwayId = repo.getState().rooms.find((r) => r.name === "Hallway")!
      .id;
    expect(roomSelect).toHaveValue(hallwayId);
  });

  it("tapping a task opens its TaskSheet", () => {
    renderRooms("/rooms/hallway");

    fireEvent.click(screen.getByRole("button", { name: "Open Paint Stairs" }));
    expect(
      screen.getByRole("button", { name: "Mark as done" }),
    ).toBeInTheDocument();
  });

  it("an unknown room id shows a not-found state with a way back", () => {
    renderRooms("/rooms/nope");

    expect(
      screen.getByRole("heading", { level: 1, name: "Room not found" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: "Back to rooms" }));
    expect(
      screen.getByRole("button", { name: "Main Living Room · 0/11" }),
    ).toBeInTheDocument();
  });
});
