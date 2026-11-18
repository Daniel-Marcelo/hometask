import { afterEach, describe, expect, it, vi } from "vitest";
import itemListCsvText from "../data/csv/item-list.csv?raw";
import { parseItemListCsv } from "../data/parse";
import type { Room, Task } from "../data/parse";
import { downloadBackupCsv, toItemListCsv } from "./exportCsv";

const HEADER =
  "Room,Item,Status,Priority,Effort,Can be done now?,Price,Date Planned,Date Completed,Effort Weight,Notes";

/** A fully-populated synthetic task for escaping/format edge cases. */
function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "test-room/test-item",
    roomId: "test-room",
    title: "Test Item",
    status: "planned",
    priority: "medium",
    effort: "M",
    effortWeight: 3,
    canDoNow: "yes",
    priceCents: 123456,
    datePlanned: "2026-11-15",
    dateCompleted: null,
    notes: "",
    createdAt: "2026-11-15T00:00:00.000Z",
    updatedAt: "2026-11-15T00:00:00.000Z",
    fieldUpdatedAt: {},
    ...overrides,
  };
}

const ROOM: Room = {
  id: "test-room",
  name: "Test Room",
  sortOrder: 0,
  archived: false,
};

describe("toItemListCsv", () => {
  const { rooms, tasks } = parseItemListCsv(itemListCsvText);

  it("starts with the exact header row the parser binds by", () => {
    expect(toItemListCsv(rooms, tasks).split("\n")[0]).toBe(HEADER);
  });

  it("emits one row per task, preserving repo task order", () => {
    const csv = toItemListCsv(rooms, tasks);
    const rows = csv.split("\n");
    expect(rows).toHaveLength(tasks.length + 1);
    expect(rows[1].split(",")[0]).toBe("All House");
    expect(rows[1]).toContain("Fix Roof");
  });

  it("formats prices as £1,234.00 and blanks null cells", () => {
    const rows = toItemListCsv(rooms, tasks).split("\n");
    const fixRoof = rows.find((row) => row.includes("Fix Roof")) ?? "";
    expect(fixRoof).toContain('"£3,900.00"');
    const cleanWindows = rows.find((row) => row.includes("Clean Windows")) ?? "";
    expect(cleanWindows).toContain("Yes,,,,5");
  });

  it("round-trips through parseItemListCsv: all 69 tasks identical", () => {
    const reparsed = parseItemListCsv(toItemListCsv(rooms, tasks));
    expect(reparsed.tasks).toHaveLength(69);
    tasks.forEach((task, index) => {
      const back = reparsed.tasks[index];
      expect(back.roomId).toBe(task.roomId);
      expect(back.title).toBe(task.title);
      expect(back.status).toBe(task.status);
      expect(back.priority).toBe(task.priority);
      expect(back.effort).toBe(task.effort);
      expect(back.effortWeight).toBe(task.effortWeight);
      expect(back.canDoNow).toBe(task.canDoNow);
      expect(back.priceCents).toBe(task.priceCents);
      expect(back.datePlanned).toBe(task.datePlanned);
      expect(back.dateCompleted).toBe(task.dateCompleted);
    });
  });

  it("escapes cells containing commas and doubles embedded quotes", () => {
    const csv = toItemListCsv(
      [ROOM],
      [makeTask({ title: 'Fix, the "roof" panels' })],
    );
    const row = csv.split("\n")[1];
    expect(row).toBe(
      'Test Room,"Fix, the ""roof"" panels",Planned,Medium,M,Yes,"£1,234.56",2026-11-15,,3,',
    );
  });

  it("round-trips a note with a comma and newline through export → parse", () => {
    const notes = "Needs 2 coats, then sand\nand varnish";
    const csv = toItemListCsv([ROOM], [makeTask({ notes })]);

    // Escaped as one quoted cell, so the record does not split at the comma
    // or the newline inside it.
    expect(csv).toContain(`"Needs 2 coats, then sand\nand varnish"`);

    const reparsed = parseItemListCsv(csv);
    expect(reparsed.tasks).toHaveLength(1);
    expect(reparsed.tasks[0].title).toBe("Test Item");
    expect(reparsed.tasks[0].notes).toBe(notes);
  });
});

describe("downloadBackupCsv", () => {
  const { rooms, tasks } = parseItemListCsv(itemListCsvText);

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("downloads hometask-backup-<local date>.csv with the full CSV text", async () => {
    const blobs: Blob[] = [];
    const anchors: HTMLAnchorElement[] = [];
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn((blob: Blob) => {
        blobs.push(blob);
        return "blob:mock-url";
      }),
      revokeObjectURL: vi.fn(),
    });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function click(this: HTMLAnchorElement) {
        anchors.push(this);
      });

    vi.useFakeTimers();
    downloadBackupCsv(rooms, tasks);

    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const expectedName = `hometask-backup-${now.getFullYear()}-${month}-${day}.csv`;

    const blob = blobs[0];
    const anchor = anchors[0];
    expect(anchor?.getAttribute("download")).toBe(expectedName);
    expect(click).toHaveBeenCalledTimes(1);
    // Revoked only after the browser has had a tick to start the download.
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
    vi.useRealTimers();

    expect(blob?.type).toBe("text/csv;charset=utf-8");
    expect(await blob?.text()).toBe(toItemListCsv(rooms, tasks));
  });
});
