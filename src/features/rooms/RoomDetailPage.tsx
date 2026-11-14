import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { Fab } from "../../components/Fab";
import { ProgressBar } from "../../components/ProgressBar";
import type { Task } from "../../data/repo";
import { useRepoState } from "../../data/useRepo";
import type { Priority } from "../../data/types";
import { computeDashboard } from "../../lib/dashboard";
import { NewTaskSheet } from "../tasks/NewTaskSheet";
import { TaskRow } from "../tasks/TaskRow";
import { TaskSheet } from "../tasks/TaskSheet";

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

const muted = {
  margin: 0,
  color: "var(--muted)",
  fontSize: 14,
} as const;

function Page({
  children,
}: {
  children: ReactNode
}) {
  return <main style={{ padding: "16px 16px 24px" }}>{children}</main>;
}

/** Within one room: priority rank, then effort weight, then title. */
const roomSort = (a: Task, b: Task): number =>
  PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
  a.effortWeight - b.effortWeight ||
  a.title.localeCompare(b.title);

/**
 * One room's detail: a header with its x/y completed count and progress
 * bar, its open tasks in the plan's ready/priority order, and its
 * completed tasks in a muted always-open section (TaskRow strikes them
 * through via CSS). The Fab captures a task pre-set to this room; rows
 * open the same TaskSheet the other pages use. Unknown ids get a
 * not-found state with a link back to the room index.
 */
export function RoomDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { rooms, tasks } = useRepoState();
  const [sheetTaskId, setSheetTaskId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  const room = rooms.find((candidate) => candidate.id === id);

  const roomTasks = useMemo(
    () => (room === undefined ? [] : tasks.filter((task) => task.roomId === room.id)),
    [room, tasks],
  );

  const openTasks = useMemo(
    () => roomTasks.filter((task) => task.status !== "completed").sort(roomSort),
    [roomTasks],
  );

  const completedTasks = useMemo(
    () => roomTasks.filter((task) => task.status === "completed").sort(roomSort),
    [roomTasks],
  );

  // Re-read by id from repo state so the sheet can never show stale fields.
  const sheetTask =
    sheetTaskId === null
      ? null
      : (tasks.find((task) => task.id === sheetTaskId) ?? null);

  const openSheet = (task: Task): void => setSheetTaskId(task.id);

  if (room === undefined) {
    return (
      <Page>
        <h1 style={{ margin: 0, fontSize: 24 }}>Room not found</h1>
        <p style={{ marginTop: 8 }}>
          <Link to="/rooms">Back to rooms</Link>
        </p>
      </Page>
    );
  }

  // One progress row per room, straight from the dashboard formulas.
  const progress = computeDashboard([room], roomTasks).roomProgress[0];
  const completed = progress.completed;
  const total = progress.total;

  return (
    <Page>
      <h1 style={{ margin: 0, fontSize: 24 }}>{room.name}</h1>
      <p style={{ ...muted, margin: "4px 0 8px" }}>
        {completed}/{total} completed
      </p>
      <ProgressBar pct={progress.pct} />

      {openTasks.length === 0 && completedTasks.length === 0 ? (
        <p style={{ ...muted, marginTop: 16 }}>No tasks in this room yet.</p>
      ) : (
        openTasks.length > 0 && (
          <ul aria-label="Tasks" style={{ ...sectionList, marginTop: 16 }}>
            {openTasks.map((task) => (
              <TaskRow key={task.id} task={task} onOpen={openSheet} />
            ))}
          </ul>
        )
      )}

      {completedTasks.length > 0 && (
        <section style={{ marginTop: 20 }}>
          <h2
            style={{
              margin: "0 0 8px",
              fontSize: 14,
              color: "var(--muted)",
              fontWeight: 600,
            }}
          >
            Completed ({completedTasks.length})
          </h2>
          <ul aria-label="Completed" style={sectionList}>
            {completedTasks.map((task) => (
              <TaskRow key={task.id} task={task} onOpen={openSheet} />
            ))}
          </ul>
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
      <NewTaskSheet
        open={newOpen}
        onClose={() => setNewOpen(false)}
        defaultRoomId={room.id}
      />
    </Page>
  );
}
