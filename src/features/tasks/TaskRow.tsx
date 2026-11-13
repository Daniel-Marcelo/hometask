import { useEffect, useRef, useState } from "react";
import { PriorityChip } from "../../components/PriorityChip";
import { UndoToast } from "../../components/UndoToast";
import type { Task } from "../../data/repo";
import { repo, useRepoState } from "../../data/useRepo";

const UNDO_WINDOW_MS = 5000;

/**
 * The most-tapped element in the app: a task row with a one-tap complete
 * circle on the left, the title (tap to open), room name + effort muted,
 * and a priority chip. Completion goes through `repo.completeWithUndo` and
 * surfaces an undo toast for a 5-second window; undo lives only in the
 * toast — tapping a completed row's circle does nothing.
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

  const [toastForId, setToastForId] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const undoRef = useRef<(() => void) | null>(null);

  const completed = current.status === "completed";
  const roomName = rooms.find((room) => room.id === current.roomId)?.name;
  // Keying the toast to the task it was opened for means a row reused for a
  // different task never shows a stale toast — no effect needed.
  const undoVisible = toastForId === current.id;

  // Drop the undo window's timer whenever this row starts showing a different
  // task (list reuse) and on unmount.
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      undoRef.current = null;
    };
  }, [task.id]);

  const handleComplete = (): void => {
    if (completed) return;
    undoRef.current = repo.completeWithUndo(current.id);
    // A second completion in the same row instance restarts the window.
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    setToastForId(current.id);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      undoRef.current = null;
      setToastForId(null);
    }, UNDO_WINDOW_MS);
  };

  const handleUndo = (): void => {
    undoRef.current?.();
    undoRef.current = null;
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setToastForId(null);
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
      <button type="button" className="ht-row__body" onClick={() => onOpen(current)}>
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
      <UndoToast
        message={`Completed "${current.title}"`}
        onUndo={handleUndo}
        visible={undoVisible}
      />
    </li>
  );
}
