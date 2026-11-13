import type { Room, Status, Task, Priority } from "../data/types";

export interface Dashboard {
  totalTasks: number;
  completed: number;
  remaining: number;
  progressPct: number;
  urgentPending: number;
  readyNow: number;
  blocked: number;
  laterCount: number;
  totalSpendCents: number;
  budgetedCents: number;
  roomProgress: {
    roomId: string;
    name: string;
    total: number;
    completed: number;
    pct: number;
  }[];
  spendByRoom: { roomId: string; name: string; cents: number }[];
  statusCounts: Record<Status, number>;
  priorityCounts: Record<Priority, number>;
  recentPurchases: Task[];
}

/** numerator/denominator as a percentage rounded to exactly one decimal. */
function pct(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

function countWhere(tasks: Task[], predicate: (task: Task) => boolean): number {
  let count = 0;
  for (const task of tasks) {
    if (predicate(task)) count++;
  }
  return count;
}

const isCompleted = (task: Task): boolean => task.status === "completed";
const isPriced = (task: Task): boolean =>
  task.priceCents !== null && task.priceCents > 0;

/**
 * The renovation sheet's Dashboard formulas as pure code. Always computed from
 * the task list — the sheet's own Dashboard tab can go stale (it says
 * "In Progress 0, Planned 3" while the CSV has 2 and 5).
 */
export function computeDashboard(rooms: Room[], tasks: Task[]): Dashboard {
  const completedTasks = tasks.filter(isCompleted);
  const pendingTasks = tasks.filter((task) => !isCompleted(task));

  const totalWeight = tasks.reduce((sum, task) => sum + task.effortWeight, 0);
  const completedWeight = completedTasks.reduce(
    (sum, task) => sum + task.effortWeight,
    0,
  );

  const statusCounts = { completed: 0, in_progress: 0, planned: 0, unplanned: 0 };
  const priorityCounts = { urgent: 0, medium: 0, low: 0, very_low: 0 };
  for (const task of tasks) {
    statusCounts[task.status]++;
    priorityCounts[task.priority]++;
  }

  const spendByRoom = rooms
    .map((room) => ({
      roomId: room.id,
      name: room.name,
      cents: tasks
        .filter((task) => task.roomId === room.id && isPriced(task))
        .reduce((sum, task) => sum + (task.priceCents ?? 0), 0),
    }))
    .filter((entry) => entry.cents > 0);

  const roomProgress = rooms.map((room) => {
    const roomTasks = tasks.filter((task) => task.roomId === room.id);
    const roomCompleted = roomTasks.filter(isCompleted);
    const roomTotalWeight = roomTasks.reduce(
      (sum, task) => sum + task.effortWeight,
      0,
    );
    const roomCompletedWeight = roomCompleted.reduce(
      (sum, task) => sum + task.effortWeight,
      0,
    );
    return {
      roomId: room.id,
      name: room.name,
      total: roomTasks.length,
      completed: roomCompleted.length,
      pct: pct(roomCompletedWeight, roomTotalWeight),
    };
  });

  const recentPurchases = tasks
    .filter((task) => isCompleted(task) && isPriced(task))
    .sort(
      (a, b) =>
        (b.dateCompleted ?? "").localeCompare(a.dateCompleted ?? "") ||
        a.title.localeCompare(b.title),
    );

  return {
    totalTasks: tasks.length,
    completed: completedTasks.length,
    remaining: tasks.length - completedTasks.length,
    progressPct: pct(completedWeight, totalWeight),
    urgentPending: countWhere(
      tasks,
      (task) => task.priority === "urgent" && !isCompleted(task),
    ),
    readyNow: countWhere(pendingTasks, (task) => task.canDoNow === "yes"),
    blocked: countWhere(pendingTasks, (task) => task.canDoNow === "no"),
    // The sheet's "N/A / Later" figure (13) counts every N/A task, completed or
    // not. All 13 N/A tasks in the current sheet are Completed, so restricting
    // to pending tasks would give 0 — the plan pins 13, matching the tab.
    laterCount: countWhere(tasks, (task) => task.canDoNow === "na"),
    // Money already spent on completed priced tasks.
    totalSpendCents: completedTasks.reduce(
      (sum, task) => sum + (task.priceCents ?? 0),
      0,
    ),
    // Money still budgeted for pending priced tasks (all priced tasks are
    // completed in the current sheet, so this is 0 today).
    budgetedCents: pendingTasks.reduce(
      (sum, task) => sum + (task.priceCents ?? 0),
      0,
    ),
    roomProgress,
    spendByRoom,
    statusCounts,
    priorityCounts,
    recentPurchases,
  };
}
