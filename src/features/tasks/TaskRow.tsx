import { PriorityChip } from "../../components/PriorityChip";
import type { Task } from "../../data/repo";
import { repo, useRepoState } from "../../data/useRepo";
import { showUndo } from "./undoStore";

/**
 * The most-tapped element in the app: a task row with a one-tap complete
 * circle on the left, the title (tap to open), room name + effort muted,
 * and a priority chip. Completion goes through `repo.completeWithUndo` and
 * hands the undo to the app-level undo host (`showUndo`), which shows the
 * toast for a 5-second window — the row can unmount without killing the
 * pending undo, and undo lives only in the toast (tapping a completed
 * row's circle does nothing).
 *
 * The row re-reads the task by id from repo state on every render, so a
 * stale `task` prop (e.g. a parent rendering from a cached list) can never
 * show a wrong completion state.
 */
export function TaskRow({
  task,
  onOpen,
}: {
  task: Task
  onOpen: (task: Task) => void
}) {
  const { rooms, tasks } = useRepoState();
  const current = tasks.find((t) => t.id === task.id) ?? task;

  const completed = current.status === "completed";
  const roomName = rooms.find((room) => room.id === current.roomId)?.name;

  const handleComplete = (): void => {
    if (completed) return;
    const undo = repo.completeWithUndo(current.id);
    // The host owns the toast and the undo closure for the full window.
    showUndo(`Completed "${current.title}"`, () => undo());
  };

  return (
    <li
      className={
        completed
          ? "ht-row ht-row--done"
          : current.priority === "urgent"
            ? "ht-row ht-row--urgent"
            : "ht-row"
      }
    >
      <button
        type="button"
        className={
          completed ? "ht-row__circle ht-row__circle--done" : "ht-row__circle"
        }
        aria-label={
          completed ? `Completed "${current.title}"` : `Complete "${current.title}"`
        }
        onClick={handleComplete}
      >
        {completed ? "✓" : ""}
      </button>
      <button
        type="button"
        className="ht-row__body"
        aria-label={`Open ${current.title}`}
        onClick={() => onOpen(current)}
      >
        <span
          className={completed ? "ht-row__title ht-row__title--done" : "ht-row__title"}
        >
          {current.title}
        </span>
        <span className="ht-row__meta">
          {roomName ?? "No room"} · {current.effort}
        </span>
      </button>
      <PriorityChip priority={current.priority} />
    </li>
  );
}
