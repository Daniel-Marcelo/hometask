import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { StatTile } from "../../components/StatTile";
import type { Task } from "../../data/repo";
import { useRepoState } from "../../data/useRepo";
import { computeDashboard } from "../../lib/dashboard";
import type { Priority } from "../../data/types";
import { TaskRow } from "../tasks/TaskRow";
import { TaskSheet } from "../tasks/TaskSheet";

/** Pounds, whole, comma thousands: 485800 → "£4,858". */
function formatMoney(cents: number): string {
  const pounds = Math.round(cents / 100);
  return `£${pounds.toLocaleString("en-GB")}`;
}

/** The sheet's greeting line: by local hour, no name. */
function greetingByHour(hour: number): string {
  if (hour >= 5 && hour <= 11) return "Good morning";
  if (hour >= 12 && hour <= 17) return "Good afternoon";
  return "Good evening";
}

/** Sort rank: urgent first. */
const PRIORITY_RANK: Record<Priority, number> = {
  urgent: 0,
  medium: 1,
  low: 2,
  very_low: 3,
};

const sectionList = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "flex",
  flexDirection: "column",
  gap: 8,
} as const;

/**
 * Compact rooms summary: one horizontally scrollable row of pills so all
 * 16 rooms stay reachable without pushing Ready-now out of the first
 * viewport. A pill still opens the room's detail page; the "See all rooms"
 * row goes to the full index.
 */
const chipRow = {
  listStyle: "none",
  margin: 0,
  padding: "0 0 4px",
  display: "flex",
  gap: 8,
  overflowX: "auto",
} as const;

const chip = {
  flex: "none",
  minHeight: 44,
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "0 14px",
  background: "var(--card)",
  border: "1px solid var(--hairline)",
  borderRadius: 999,
  font: "inherit",
  fontSize: 14,
  color: "var(--ink)",
  whiteSpace: "nowrap",
  cursor: "pointer",
} as const;

const chipCount = {
  fontSize: 12,
  color: "var(--muted)",
} as const;

const seeAll = {
  width: "100%",
  minHeight: 44,
  display: "flex",
  justifyContent: "center",
  font: "inherit",
  fontSize: 15,
  fontWeight: 600,
  color: "var(--accent)",
  background: "none",
  border: "none",
  cursor: "pointer",
} as const;

/**
 * Home, the command center: greeting, three headline tiles (the sheet's
 * numbers straight from computeDashboard), a compact rooms summary (chip
 * row + see-all link), and the ready-now list ordered by urgency. Tapping
 * a room chip goes to its detail; tapping a ready task opens the same
 * TaskSheet the Tasks page uses.
 */
export function HomePage() {
  const { rooms, tasks } = useRepoState();
  const navigate = useNavigate();
  const [sheetTaskId, setSheetTaskId] = useState<string | null>(null);
  // Captured once at mount: a session crossing midnight keeps its greeting.
  const [greeting] = useState(() => greetingByHour(new Date().getHours()));

  const dashboard = useMemo(
    () => computeDashboard(rooms, tasks),
    [rooms, tasks],
  );

  // Ready = pending tasks the sheet says can be done now, urgent first,
  // then priority rank, then effort weight asc, then title asc.
  const readyTasks = useMemo(
    () =>
      tasks
        .filter((task) => task.status !== "completed" && task.canDoNow === "yes")
        .sort(
          (a, b) =>
            PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
            a.effortWeight - b.effortWeight ||
            a.title.localeCompare(b.title),
        ),
    [tasks],
  );

  // Re-read by id from repo state so the sheet can never show stale fields.
  const sheetTask =
    sheetTaskId === null
      ? null
      : (tasks.find((task) => task.id === sheetTaskId) ?? null);

  const openSheet = (task: Task): void => setSheetTaskId(task.id);

  return (
    <main style={{ padding: "16px 16px 24px" }}>
      <h1 style={{ margin: 0, fontSize: 24 }}>
        {greeting}
      </h1>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 8,
          marginTop: 12,
        }}
      >
        <div style={{ gridColumn: "1 / -1" }}>
          <StatTile
            label="Progress"
            value={`${dashboard.progressPct}%`}
            accent
            sub={`${dashboard.completed} of ${dashboard.totalTasks} done`}
          />
        </div>
        <StatTile
          label="Total spend"
          value={formatMoney(dashboard.totalSpendCents)}
          sub={
            dashboard.budgetedCents > 0
              ? `${formatMoney(dashboard.budgetedCents)} budgeted, not spent`
              : undefined
          }
        />
        <StatTile label="Remaining" value={String(dashboard.remaining)} />
      </div>

      <h2 style={{ margin: "20px 0 8px", fontSize: 18 }}>Rooms</h2>
      <ul aria-label="Rooms" style={chipRow}>
        {dashboard.roomProgress.map((room) => (
          <li key={room.roomId}>
            <button
              type="button"
              aria-label={`Open ${room.name} · ${room.completed}/${room.total}`}
              style={chip}
              onClick={() => navigate(`/rooms/${room.roomId}`)}
            >
              {room.name}
              <span style={chipCount}>
                {room.completed}/{room.total}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        style={seeAll}
        onClick={() => navigate("/rooms")}
      >
        See all rooms →
      </button>

      <h2 style={{ margin: "20px 0 8px", fontSize: 18 }}>
        Ready now ({dashboard.readyNow})
      </h2>
      <ul aria-label="Ready now" style={sectionList}>
        {readyTasks.map((task) => (
          <TaskRow key={task.id} task={task} onOpen={openSheet} />
        ))}
      </ul>

      {sheetTask && (
        <TaskSheet
          task={sheetTask}
          open
          onClose={() => setSheetTaskId(null)}
        />
      )}
    </main>
  );
}
