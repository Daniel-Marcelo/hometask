import type { CanDoNow, Effort, Priority, Room, Status, Task } from "./types";

export type { CanDoNow, Effort, Priority, Room, Status, Task } from "./types";

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

function required<T>(
  map: Record<string, T>,
  label: string,
  column: string,
  rowNumber: number,
): T {
  const value = map[label];
  if (value === undefined) {
    throw new Error(`Row ${rowNumber}: unknown ${column} value "${label}"`);
  }
  return value;
}

export function parseItemListCsv(csv: string): { rooms: Room[]; tasks: Task[] } {
  const rows = parseCsvRows(csv).filter((row) =>
    row.some((cell) => cell.trim() !== ""),
  );
  const [header, ...dataRows] = rows;
  if (header === undefined) {
    throw new Error("CSV is missing its header row");
  }

  // Bind columns by header name, not position, so re-ordered exports fail loudly.
  const headerCells = header.map((cell) => cell.trim());
  const columnOf = (name: string): number => {
    const index = headerCells.indexOf(name);
    if (index === -1) {
      throw new Error(`CSV header is missing column "${name}"`);
    }
    return index;
  };
  const roomColumn = columnOf("Room");
  const titleColumn = columnOf("Item");
  const statusColumn = columnOf("Status");
  const priorityColumn = columnOf("Priority");
  const effortColumn = columnOf("Effort");
  const canDoNowColumn = columnOf("Can be done now?");
  const priceColumn = columnOf("Price");
  const datePlannedColumn = columnOf("Date Planned");
  const dateCompletedColumn = columnOf("Date Completed");
  const effortWeightColumn = columnOf("Effort Weight");
  // Optional trailing column: present in backups, absent from the seed CSV.
  const notesColumn = headerCells.indexOf("Notes");
  const lastColumn = Math.max(
    roomColumn,
    titleColumn,
    statusColumn,
    priorityColumn,
    effortColumn,
    canDoNowColumn,
    priceColumn,
    datePlannedColumn,
    dateCompletedColumn,
    effortWeightColumn,
  );

  const now = new Date().toISOString();
  const rooms: Room[] = [];
  const tasks: Task[] = [];

  dataRows.forEach((row, index) => {
    const rowNumber = index + 2; // header is row 1
    const cells = row.map((cell) => cell.trim());
    if (cells.length <= lastColumn) {
      throw new Error(
        `Row ${rowNumber} has ${cells.length} cells, expected at least ${lastColumn + 1}`,
      );
    }

    const weight = Number(cells[effortWeightColumn]);
    if (!Number.isFinite(weight) || weight <= 0) {
      throw new Error(
        `Row ${rowNumber}: invalid effort weight "${cells[effortWeightColumn]}"`,
      );
    }

    const roomName = cells[roomColumn];
    const title = cells[titleColumn];
    const roomId = slugify(roomName);
    if (!rooms.some((room) => room.id === roomId)) {
      rooms.push({
        id: roomId,
        name: roomName,
        sortOrder: rooms.length,
        archived: false,
      });
    }

    const datePlanned = cells[datePlannedColumn];
    const dateCompleted = cells[dateCompletedColumn];

    tasks.push({
      id: slugify(`${roomName}/${title}`),
      roomId,
      title,
      status: required(STATUS_BY_LABEL, cells[statusColumn], "status", rowNumber),
      priority: required(PRIORITY_BY_LABEL, cells[priorityColumn], "priority", rowNumber),
      effort: required(EFFORT_BY_LABEL, cells[effortColumn], "effort", rowNumber),
      effortWeight: weight,
      canDoNow: required(CAN_DO_NOW_BY_LABEL, cells[canDoNowColumn], "can-do-now", rowNumber),
      priceCents: parsePrice(cells[priceColumn]),
      datePlanned: datePlanned === "" ? null : datePlanned,
      dateCompleted: dateCompleted === "" ? null : dateCompleted,
      notes: notesColumn === -1 ? "" : (cells[notesColumn] ?? ""),
      createdAt: now,
      updatedAt: now,
      fieldUpdatedAt: {},
    });
  });

  return { rooms, tasks };
}
