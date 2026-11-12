import { describe, expect, it } from "vitest";
import itemListCsvText from "./csv/item-list.csv?raw";
import { parseItemListCsv, parsePrice } from "./parse";

describe("parseItemListCsv", () => {
  const { rooms, tasks } = parseItemListCsv(itemListCsvText);

  it("returns exactly 16 rooms (incl. All House) and 69 tasks", () => {
    expect(rooms).toHaveLength(16);
    expect(tasks).toHaveLength(69);
    expect(rooms.map((room) => room.name)).toContain("All House");
  });

  it("orders rooms by first appearance in the CSV", () => {
    expect(rooms.map((room) => room.name)).toEqual([
      "All House",
      "Hallway",
      "Main Living Room",
      "Second Living Room",
      "Downstair Office",
      "Downstair Bathroom",
      "Kitchen/Dining",
      "Utility Room",
      "Conservatory",
      "All Upstairs",
      "Main Bedroom",
      "Ensuite Bedroom",
      "Ensuite",
      "Office",
      "Empty Bedroom",
      "Main Bathroom",
    ]);
  });

  it("gives rooms stable slug ids", () => {
    const ids = rooms.map((room) => room.id);
    expect(ids).toContain("all-house");
    expect(ids).toContain("hallway");
    expect(ids).toContain("kitchen-dining");
    expect(ids).toContain("downstair-office");
    for (const id of ids) {
      expect(id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    }
  });

  it("parses the first task (Fix Roof)", () => {
    expect(tasks[0]).toMatchObject({
      roomId: "all-house",
      title: "Fix Roof",
      status: "completed",
      priority: "urgent",
      effort: "XL",
      effortWeight: 8,
      canDoNow: "na",
      priceCents: 390000,
      datePlanned: "2026-11-06",
      dateCompleted: "2026-11-06",
    });
  });

  it("maps CSV labels to canonical status/priority/effort/canDoNow values", () => {
    const inRoom = (title: string, roomId: string) =>
      tasks.find((task) => task.title === title && task.roomId === roomId);

    expect(inRoom("Clean Windows", "all-house")?.status).toBe("unplanned");
    expect(inRoom("Buy Blinds", "downstair-office")?.status).toBe("in_progress");
    expect(inRoom("Paint Stairs", "hallway")?.status).toBe("planned");
    expect(inRoom("Renovate Grout", "hallway")?.priority).toBe("very_low");
    expect(inRoom("Paint Stairs", "hallway")?.priority).toBe("medium");
    expect(inRoom("Buy Office Chair", "downstair-office")?.priority).toBe("urgent");
    expect(inRoom("Buy Sideboard", "hallway")?.effort).toBe("S");
    expect(inRoom("Clean Windows", "all-house")?.canDoNow).toBe("yes");
    expect(inRoom("Restore Floor", "main-living-room")?.canDoNow).toBe("no");
    expect(inRoom("Buy Sideboard", "hallway")?.canDoNow).toBe("na");
  });

  it("leaves blank price and date cells as null", () => {
    const cleanWindows = tasks.find(
      (task) => task.title === "Clean Windows" && task.roomId === "all-house",
    );
    expect(cleanWindows?.priceCents).toBeNull();
    expect(cleanWindows?.datePlanned).toBeNull();
    expect(cleanWindows?.dateCompleted).toBeNull();
  });

  it("gives every task a room, notes and timestamps", () => {
    for (const task of tasks) {
      expect(task.notes).toBe("");
      expect(task.createdAt).toBeTruthy();
      expect(task.updatedAt).toBeTruthy();
      expect(task.fieldUpdatedAt).toEqual({});
    }
  });
});

describe("parsePrice", () => {
  it("parses GBP amounts into pence", () => {
    expect(parsePrice("A£3,900.00")).toBe(390000);
    expect(parsePrice("A£0.00")).toBe(0);
    expect(parsePrice("£20")).toBe(2000);
  });

  it("returns null for empty cells", () => {
    expect(parsePrice("")).toBeNull();
  });
});
