import { useSyncExternalStore } from "react";

/** What the undo host renders; null while no toast is showing. */
export interface UndoState {
  message: string
  onUndo: () => void
  /** Monotonic id of this toast — a new show always supersedes the old one. */
  id: number
}

const UNDO_WINDOW_MS = 5000;

let state: UndoState | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let nextId = 1;
const listeners = new Set<() => void>();

const emit = (): void => {
  for (const listener of listeners) listener();
};

const getSnapshot = (): UndoState | null => state;

const subscribe = (fn: () => void): (() => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

const cancelPendingTimer = (): void => {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
};

/**
 * Shows the undo toast for a 5-second window. A new show cancels the
 * previous toast's timer so only the newest completion is offered undo —
 * never two overlapping toasts. The stored closure keeps the undo alive
 * even if the originating row unmounts.
 */
export function showUndo(message: string, onUndo: () => void): void {
  cancelPendingTimer();
  state = { message, onUndo, id: nextId++ };
  timer = setTimeout(() => {
    timer = null;
    state = null;
    emit();
  }, UNDO_WINDOW_MS);
  emit();
}

/** Hides the toast now (undo taken, or explicit reset). */
export function clearUndo(): void {
  cancelPendingTimer();
  state = null;
  emit();
}

/** React binding for the app-level host. */
export function useUndoToast(): UndoState | null {
  return useSyncExternalStore(subscribe, getSnapshot);
}
