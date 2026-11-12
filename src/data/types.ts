export type Status = "completed" | "in_progress" | "planned" | "unplanned";
export type Priority = "urgent" | "medium" | "low" | "very_low";
export type Effort = "XS" | "S" | "M" | "L" | "XL";
export type CanDoNow = "yes" | "no" | "na";

export interface Room {
  id: string;
  name: string;
  sortOrder: number;
  archived: boolean;
}

export interface Task {
  id: string;
  roomId: string;
  title: string;
  status: Status;
  priority: Priority;
  effort: Effort;
  effortWeight: number;
  canDoNow: CanDoNow;
  priceCents: number | null;
  datePlanned: string | null;
  dateCompleted: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
  fieldUpdatedAt: Record<string, string>;
}
