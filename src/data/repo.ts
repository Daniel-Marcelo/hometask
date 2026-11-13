import type { Room, Task } from "./types";

export type { Room, Task };

/** A task as the caller supplies it; the repo fills id, timestamps and fieldUpdatedAt. */
export type NewTask = Omit<Task, "id" | "createdAt" | "updatedAt" | "fieldUpdatedAt">;

/** A local mutation awaiting sync with the remote source of truth. */
export type QueuedOp =
  | { kind: "upsert_task"; task: Task; at: string }
  | { kind: "delete_task"; taskId: string; at: string }
  | { kind: "upsert_room"; room: Room; at: string };

export interface RepoState {
  rooms: Room[];
  tasks: Task[];
  queuedOps: QueuedOp[];
  lastSyncedAt: string | null;
}

export interface TaskRepo {
  subscribe(fn: () => void): () => void;
  getState(): RepoState;
  addTask(input: NewTask): Task;
  updateTask(id: string, patch: Partial<Task>): void;
  deleteTask(id: string): void;
  addRoom(name: string): Room;
  /** Completes a task; returns a synchronous undo that restores the exact prior task. */
  completeWithUndo(taskId: string): () => void;
}
