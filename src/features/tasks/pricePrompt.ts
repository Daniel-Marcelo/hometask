import type { Task } from "../../data/repo";

/**
 * The "Buy"-title price prompt condition: an unpriced task whose (trimmed,
 * case-insensitive) title starts with "Buy" must be prompted before
 * completion so spend stays honest. Shared by TaskRow (which opens the
 * sheet instead of completing) and TaskSheet (which shows the prompt).
 */
export function needsPricePrompt(task: Task): boolean {
  return (
    task.priceCents == null && task.title.trim().toLowerCase().startsWith("buy")
  );
}
