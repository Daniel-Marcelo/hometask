import type { Room, Task } from "../data/parse";

/** The header row parse.ts binds columns by — keep in sync with it. */
const HEADER =
  "Room,Item,Status,Priority,Effort,Can be done now?,Price,Date Planned,Date Completed,Effort Weight";

const STATUS_LABEL: Record<Task["status"], string> = {
  completed: "Completed",
  in_progress: "In Progress",
  planned: "Planned",
  unplanned: "Unplanned",
};

const PRIORITY_LABEL: Record<Task["priority"], string> = {
  urgent: "Urgent",
  medium: "Medium",
  low: "Low",
  very_low: "Very Low",
};

const CAN_DO_NOW_LABEL: Record<Task["canDoNow"], string> = {
  yes: "Yes",
  no: "No",
  na: "N/A",
};

/** Quotes a cell iff it holds a comma, quote, or newline; doubles quotes. */
function escapeCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

/** Pence → "£3,900.00"; parse.ts's price reader strips to digits, so commas survive. */
function formatPrice(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const pounds = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const pence = (abs % 100).toString().padStart(2, "0");
  return `${sign}£${pounds}.${pence}`;
}

/**
 * Serialises repo state back to the item-list CSV format so the parser can
 * re-ingest it losslessly — the Google Sheet backup, refreshed in-app.
 */
export function toItemListCsv(rooms: Room[], tasks: Task[]): string {
  const roomName = new Map(rooms.map((room) => [room.id, room.name]));
  const rows = [HEADER];
  for (const task of tasks) {
    rows.push(
      [
        roomName.get(task.roomId) ?? "",
        task.title,
        STATUS_LABEL[task.status],
        PRIORITY_LABEL[task.priority],
        task.effort,
        CAN_DO_NOW_LABEL[task.canDoNow],
        task.priceCents === null ? "" : formatPrice(task.priceCents),
        task.datePlanned ?? "",
        task.dateCompleted ?? "",
        task.effortWeight.toString(),
      ]
        .map(escapeCell)
        .join(","),
    );
  }
  return rows.join("\n");
}

/** Local calendar date as YYYY-MM-DD (toISOString would be UTC). */
function todayStamp(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * Builds the backup CSV and hands it to the browser as a download named
 * hometask-backup-YYYY-MM-DD.csv.
 */
export function downloadBackupCsv(rooms: Room[], tasks: Task[]): void {
  const blob = new Blob([toItemListCsv(rooms, tasks)], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `hometask-backup-${todayStamp()}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
