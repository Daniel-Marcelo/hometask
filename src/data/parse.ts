import type { CanDoNow, Effort, Priority, Room, Status, Task } from "./types";

const STATUS_BY_LABEL: Record<string, Status> = {
  "Completed": "completed",
  "In Progress": "in_progress",
  "Planned": "planned",
  "Unplanned": "unplanned",
};

const PRIORITY_BY_LABEL: Record<string, Priority> = {
  "Urgent": "urgent",
  "Medium": "medium",
  "Low": "low",
  "Very Low": "very_low",
};

const EFFORT_BY_LABEL: Record<string, Effort> = {
  "XS": "XS",
  "S": "S",
  "M": "M",
  "L": "L",
  "XL": "XL",
};

const CAN_DO_NOW_BY_LABEL: Record<string, CanDoNow> = {
  "Yes": "yes",
  "No": "no",
  "N/A": "na",
};

/** Parses a GBP amount cell like "A£3,900.00" into pence; empty cells → null. */
export function parsePrice(raw: string): number | null {
  const digits = raw.replace(/[^0-9.]/g, "");
  if (digits === "") return null;
  const amount = Number.parseFloat(digits);
  if (Number.isNaN(amount)) return null;
  return Math.round(amount * 100);
}

/** Lowercases and turns every run of non-alphanumerics into a single hyphen. */
function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Splits CSV text into rows of cells, honoring double-quoted cells. */
function parseCsvRows(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < csv.length; i++) {
    const char = csv[i];
    if (inQuotes) {
      if (char === '"') {
        if (csv[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && csv[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function required<T>(map: Record<string, T>, label: string, column: string): T {
  const value = map[label];
  if (value === undefined) {
    throw new Error(`Unknown ${column} value: "${label}"`);
  }
  return value;
}

export function parseItemListCsv(csv: string): { rooms: Room[]; tasks: Task[] } {
  const rows = parseCsvRows(csv).filter((row) =>
    row.some((cell) => cell.trim() !== ""),
  );
  const [header, ...dataRows] = rows;
  if (header === undefined) return { rooms: [], tasks: [] };

  const now = new Date().toISOString();
  const rooms: Room[] = [];
  const tasks: Task[] = [];

  for (const row of dataRows) {
    const [
      roomName,
      title,
      status,
      priority,
      effort,
      canDoNow,
      price,
      datePlanned,
      dateCompleted,
      effortWeight,
    ] = row.map((cell) => cell.trim());

    const roomId = slugify(roomName);
    if (!rooms.some((room) => room.id === roomId)) {
      rooms.push({
        id: roomId,
        name: roomName,
        sortOrder: rooms.length,
        archived: false,
      });
    }

    const trimmedDatePlanned = datePlanned === "" ? null : datePlanned;
    const trimmedDateCompleted = dateCompleted === "" ? null : dateCompleted;

    tasks.push({
      id: slugify(`${roomName}/${title}`),
      roomId,
      title,
      status: required(STATUS_BY_LABEL, status, "status"),
      priority: required(PRIORITY_BY_LABEL, priority, "priority"),
      effort: required(EFFORT_BY_LABEL, effort, "effort"),
      effortWeight: Number(effortWeight),
      canDoNow: required(CAN_DO_NOW_BY_LABEL, canDoNow, "can-do-now"),
      priceCents: parsePrice(price),
      datePlanned: trimmedDatePlanned,
      dateCompleted: trimmedDateCompleted,
      notes: "",
      createdAt: now,
      updatedAt: now,
      fieldUpdatedAt: {},
    });
  }

  return { rooms, tasks };
}
