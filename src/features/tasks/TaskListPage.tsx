import { useCallback, useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import { Fab } from "../../components/Fab";
import type { Task } from "../../data/repo";
import { useRepoState } from "../../data/useRepo";
import type { Priority, Status } from "../../data/types";
import { NewTaskSheet } from "./NewTaskSheet";
import { TaskRow } from "./TaskRow";
import { TaskSheet } from "./TaskSheet";
import { downloadBackupCsv } from "../../lib/exportCsv";

/** Sort rank: urgent first. */
const PRIORITY_RANK: Record<Priority, number> = {
  urgent: 0,
  medium: 1,
  low: 2,
  very_low: 3,
};

const STATUS_OPTIONS: ReadonlyArray<{ value: Status; label: string }> = [
  { value: "planned", label: "Planned" },
  { value: "in_progress", label: "In progress" },
  { value: "unplanned", label: "Unplanned" },
  { value: "completed", label: "Completed" },
];

const PRIORITY_OPTIONS: ReadonlyArray<{ value: Priority; label: string }> = [
  { value: "urgent", label: "Urgent" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
  { value: "very_low", label: "Very low" },
];

/** Filter value sentinels for the "no filter" option of each select. */
const ALL = "all";

const sectionList = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "flex",
  flexDirection: "column",
  gap: 8,
} as const;

/** Native select styled with the same tokens as `.ht-form__input`. */
const selectStyle = {
  minHeight: 44,
  width: "100%",
  padding: "10px 12px",
  border: "1px solid var(--hairline)",
  borderRadius: "var(--radius)",
  background: "var(--card)",
  color: "var(--ink)",
  font: "inherit",
  fontSize: 16,
} as const;

/** Chip-style toggle: neutral card when off, terracotta when on. */
const chipBase = {
  minHeight: 44,
  padding: "0 14px",
  borderRadius: "var(--radius)",
  font: "inherit",
  fontSize: 14,
  cursor: "pointer",
} as const;

/** Muted secondary button for the page header: the backup CSV export. */
const exportButton = {
  minHeight: 44,
  padding: "0 14px",
  borderRadius: "var(--radius)",
  border: "1px solid var(--hairline)",
  background: "var(--card)",
  color: "var(--muted)",
  font: "inherit",
  fontSize: 14,
  cursor: "pointer",
  whiteSpace: "nowrap",
} as const;

/**
 * Tasks, the workhorse screen: every task, filterable by room, status and
 * priority, with an optional "ready now" pass on the open list. Filters
 * apply to both lists; completed tasks collapse into a muted "Completed
 * (n)" section at the bottom. Default order is the plan's: priority rank,
 * then effort weight, then room name, then title.
 */
export function TaskListPage() {
  const { rooms, tasks } = useRepoState();
  const [sheetTaskId, setSheetTaskId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [roomFilter, setRoomFilter] = useState<string>(ALL);
  const [statusFilter, setStatusFilter] = useState<string>(ALL);
  const [priorityFilter, setPriorityFilter] = useState<string>(ALL);
  const [readyNow, setReadyNow] = useState(false);
  const [completedOpen, setCompletedOpen] = useState(false);

  const roomsById = useMemo(
    () => new Map(rooms.map((room) => [room.id, room])),
    [rooms],
  );

  const roomSorted = useMemo(
    () => [...rooms].sort((a, b) => a.sortOrder - b.sortOrder),
    [rooms],
  );

  /** The plan's default order; `filter` copies first, so sort is safe. */
  const sortTasks = useCallback(
    (a: Task, b: Task): number =>
      PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
      a.effortWeight - b.effortWeight ||
      (roomsById.get(a.roomId)?.name ?? "").localeCompare(
        roomsById.get(b.roomId)?.name ?? "",
      ) ||
      a.title.localeCompare(b.title),
    [roomsById],
  );

  const filtered = useMemo(
    () =>
      tasks.filter(
        (task) =>
          (roomFilter === ALL || task.roomId === roomFilter) &&
          (statusFilter === ALL || task.status === statusFilter) &&
          (priorityFilter === ALL || task.priority === priorityFilter),
      ),
    [tasks, roomFilter, statusFilter, priorityFilter],
  );

  // "Ready now" only tightens the open list — a completed task can never
  // be ready, so the completed section keeps its own filters alone.
  const openTasks = useMemo(
    () =>
      filtered
        .filter(
          (task) =>
            task.status !== "completed" && (!readyNow || task.canDoNow === "yes"),
        )
        .sort(sortTasks),
    [filtered, readyNow, sortTasks],
  );

  const completedTasks = useMemo(
    () => filtered.filter((task) => task.status === "completed").sort(sortTasks),
    [filtered, sortTasks],
  );

  // Re-read by id from repo state so the sheet can never show stale fields.
  const sheetTask =
    sheetTaskId === null
      ? null
      : (tasks.find((task) => task.id === sheetTaskId) ?? null);

  const openSheet = (task: Task): void => setSheetTaskId(task.id);

  const onRoomChange = (event: ChangeEvent<HTMLSelectElement>): void =>
    setRoomFilter(event.target.value);
  const onStatusChange = (event: ChangeEvent<HTMLSelectElement>): void =>
    setStatusFilter(event.target.value);
  const onPriorityChange = (event: ChangeEvent<HTMLSelectElement>): void =>
    setPriorityFilter(event.target.value);

  return (
    <main style={{ padding: "16px 16px 24px" }}>
      {/* Header: title plus the backup export, clear of the sticky row. */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <h1 style={{ margin: 0, fontSize: 24 }}>Tasks</h1>
        <button
          type="button"
          onClick={() => downloadBackupCsv(rooms, tasks)}
          style={exportButton}
        >
          Export backup CSV
        </button>
      </div>

      {/* Sticky, compact filter row: three selects + the ready-now chip. */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          background: "var(--ground)",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 8,
          padding: "12px 0",
        }}
      >
        <select
          aria-label="Room"
          value={roomFilter}
          onChange={onRoomChange}
          style={selectStyle}
        >
          <option value={ALL}>All rooms</option>
          {roomSorted.map((room) => (
            <option key={room.id} value={room.id}>
              {room.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Status"
          value={statusFilter}
          onChange={onStatusChange}
          style={selectStyle}
        >
          <option value={ALL}>All statuses</option>
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          aria-label="Priority"
          value={priorityFilter}
          onChange={onPriorityChange}
          style={selectStyle}
        >
          <option value={ALL}>All priorities</option>
          {PRIORITY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          aria-pressed={readyNow}
          onClick={() => setReadyNow((value) => !value)}
          style={
            readyNow
              ? {
                  ...chipBase,
                  border: "1px solid var(--accent)",
                  background: "var(--accent)",
                  color: "var(--card)",
                  fontWeight: 700,
                }
              : {
                  ...chipBase,
                  border: "1px solid var(--hairline)",
                  background: "var(--card)",
                  color: "var(--ink)",
                }
          }
        >
          Ready now
        </button>
      </div>

      {openTasks.length === 0 ? (
        <p style={{ color: "var(--muted)" }}>Nothing matches these filters.</p>
      ) : (
        <ul aria-label="Tasks" style={sectionList}>
          {openTasks.map((task) => (
            <TaskRow key={task.id} task={task} onOpen={openSheet} />
          ))}
        </ul>
      )}

      {completedTasks.length > 0 && (
        <section style={{ marginTop: 20 }}>
          <button
            type="button"
            aria-expanded={completedOpen}
            aria-controls="completed-list"
            onClick={() => setCompletedOpen((value) => !value)}
            style={{
              width: "100%",
              minHeight: 44,
              padding: "0 4px",
              border: "none",
              background: "none",
              color: "var(--muted)",
              font: "inherit",
              fontSize: 14,
              textAlign: "left",
              cursor: "pointer",
            }}
          >
            Completed ({completedTasks.length})
            <span aria-hidden="true">{completedOpen ? " ▾" : " ▸"}</span>
          </button>
          {completedOpen && (
            <ul id="completed-list" aria-label="Completed" style={sectionList}>
              {completedTasks.map((task) => (
                <TaskRow key={task.id} task={task} onOpen={openSheet} />
              ))}
            </ul>
          )}
        </section>
      )}

      {sheetTask && (
        <TaskSheet
          task={sheetTask}
          open
          onClose={() => setSheetTaskId(null)}
        />
      )}
      <Fab label="Add a task" onClick={() => setNewOpen(true)} />
      <NewTaskSheet open={newOpen} onClose={() => setNewOpen(false)} />
    </main>
  );
}
