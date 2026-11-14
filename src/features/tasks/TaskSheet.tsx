import { useState } from "react";
import type { FormEvent } from "react";
import { Sheet } from "../../components/Sheet";
import type { Task } from "../../data/repo";
import { repo, useRepoState } from "../../data/useRepo";
import type { CanDoNow, Effort, Priority, Status } from "../../data/types";
import { showUndo } from "./undoStore";

/** Effort label → weight (exact plan map: XS:1, S:2, M:3, L:5, XL:8). */
const EFFORT_WEIGHT: Record<Effort, number> = {
  XS: 1,
  S: 2,
  M: 3,
  L: 5,
  XL: 8,
};

/** Pounds string → integer cents, or null when not a valid non-negative amount.
 * Rounding happens exactly once, at this input boundary — never in display code. */
function parsePoundsToCents(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const pounds = Number(trimmed);
  if (!Number.isFinite(pounds) || pounds < 0) return null;
  return Math.round(pounds * 100);
}

/** Existing price → the pounds string shown in an input ("£"-free, 2 decimals). */
function centsToDraft(cents: number | null): string {
  return cents === null ? "" : (cents / 100).toFixed(2);
}

/** The "Buy"-title price prompt condition: unpriced Buy tasks must be
 * prompted before completion so spend stays honest. */
function needsPrice(task: Task): boolean {
  return (
    task.priceCents == null && task.title.trim().toLowerCase().startsWith("buy")
  );
}

const STATUS_OPTIONS: ReadonlyArray<{ value: Status; label: string }> = [
  { value: "completed", label: "Completed" },
  { value: "in_progress", label: "In progress" },
  { value: "planned", label: "Planned" },
  { value: "unplanned", label: "Unplanned" },
];

const PRIORITY_OPTIONS: ReadonlyArray<{ value: Priority; label: string }> = [
  { value: "urgent", label: "Urgent" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
  { value: "very_low", label: "Very low" },
];

const EFFORT_OPTIONS: ReadonlyArray<{ value: Effort; label: string }> = [
  { value: "XS", label: "XS" },
  { value: "S", label: "S" },
  { value: "M", label: "M" },
  { value: "L", label: "L" },
  { value: "XL", label: "XL" },
];

const CAN_DO_NOW_OPTIONS: ReadonlyArray<{ value: CanDoNow; label: string }> = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "na", label: "N/A" },
];

/**
 * Labelled button group used for every segmented field. The fieldset/legend
 * provides the group naming; the selected value carries aria-pressed.
 * Buttons are 44px tall (touch) and styled in Warm Craftsman: white card,
 * hairline borders, terracotta when selected.
 */
export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: ReadonlyArray<{ value: T; label: string }>
  onChange: (value: T) => void
}) {
  return (
    <fieldset className="ht-seg">
      <legend className="ht-seg__legend">{label}</legend>
      <div className="ht-seg__options">
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              className={selected ? "ht-seg__btn ht-seg__btn--on" : "ht-seg__btn"}
              aria-pressed={selected}
              onClick={() => onChange(option.value)}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/**
 * The app's primary edit surface for a task: every field commits straight
 * through `repo.updateTask` on change (no local-only state), so the sheet
 * always renders repo truth — it re-reads the task by id from repo state,
 * same discipline as TaskRow.
 *
 * Completion: the big terracotta "Mark as done" button (hidden once
 * completed) goes through `repo.completeWithUndo` and hands the undo to the
 * app-level undo host, exactly like TaskRow. Unpriced "Buy …" tasks get an
 * inline price prompt first: Skip completes without a price, Save & done
 * stores the price then completes. The prompt is keyed to the task id, so a
 * stale flag can never leak across tasks.
 *
 * Price editing drafts locally while the user types (partial input like "8."
 * is not a valid amount yet) and commits whenever the draft parses; on blur
 * the draft is dropped so the field snaps back to the committed value.
 */
export function TaskSheet({
  task,
  open,
  onClose,
}: {
  task: Task
  open: boolean
  onClose: () => void
}) {
  const { rooms, tasks } = useRepoState();
  const current = tasks.find((t) => t.id === task.id) ?? task;
  const completed = current.status === "completed";

  // Drafts are keyed to the task id so re-opening with a different task
  // can never show another task's pending input.
  const [priceDraft, setPriceDraft] = useState<{
    taskId: string
    value: string
  } | null>(null);
  const [promptPrice, setPromptPrice] = useState<{
    taskId: string
    value: string
  } | null>(null);

  const priceDraftLive = priceDraft?.taskId === current.id;
  const priceValue = priceDraftLive
    ? priceDraft!.value
    : centsToDraft(current.priceCents);
  const pricePromptOpen =
    promptPrice?.taskId === current.id && !completed && needsPrice(current);

  const update = (patch: Partial<Task>): void => {
    repo.updateTask(current.id, patch);
  };

  const complete = (): void => {
    const undo = repo.completeWithUndo(current.id);
    // The host owns the toast and the undo closure for the full window.
    showUndo(`Completed "${current.title}"`, () => undo());
  };

  const handleMarkDone = (): void => {
    if (completed) return;
    if (needsPrice(current)) {
      setPromptPrice({ taskId: current.id, value: "" });
    } else {
      complete();
    }
  };

  const handlePromptSkip = (): void => {
    complete();
  };

  const handlePromptSave = (): void => {
    const cents = parsePoundsToCents(promptPrice?.value ?? "");
    // No valid amount yet: stay in the prompt until it parses or the user
    // explicitly skips — "Save & done" never silently drops the price.
    if (cents === null) return;
    update({ priceCents: cents });
    complete();
  };

  const handlePriceChange = (value: string): void => {
    setPriceDraft({ taskId: current.id, value });
    if (value.trim() === "") {
      if (current.priceCents !== null) update({ priceCents: null });
      return;
    }
    const cents = parsePoundsToCents(value);
    if (cents !== null && cents !== current.priceCents) update({ priceCents: cents });
  };

  const handlePriceBlur = (): void => {
    // Drop the draft: the controlled value snaps back to repo truth.
    setPriceDraft(null);
  };

  const handleDate = (
    field: "datePlanned" | "dateCompleted",
    value: string,
  ): void => {
    update({ [field]: value === "" ? null : value });
  };

  const handleDelete = (): void => {
    if (!window.confirm(`Delete "${current.title}"? This cannot be undone.`)) {
      return;
    }
    repo.deleteTask(current.id);
    onClose();
  };

  const handleSubmit = (event: FormEvent): void => {
    event.preventDefault();
  };

  return (
    <Sheet open={open} onClose={onClose} title={current.title}>
      <form className="ht-form" onSubmit={handleSubmit}>
        <div className="ht-form__field">
          <label className="ht-form__label" htmlFor="task-title">
            Title
          </label>
          <input
            id="task-title"
            className="ht-form__input"
            value={current.title}
            onChange={(event) => update({ title: event.target.value })}
          />
        </div>

        <div className="ht-form__field">
          <label className="ht-form__label" htmlFor="task-room">
            Room
          </label>
          <select
            id="task-room"
            className="ht-form__input"
            value={current.roomId}
            onChange={(event) => update({ roomId: event.target.value })}
          >
            {rooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.name}
              </option>
            ))}
          </select>
        </div>

        <SegmentedControl
          label="Status"
          value={current.status}
          options={STATUS_OPTIONS}
          onChange={(status) => update({ status })}
        />

        <SegmentedControl
          label="Priority"
          value={current.priority}
          options={PRIORITY_OPTIONS}
          onChange={(priority) => update({ priority })}
        />

        <SegmentedControl
          label="Effort"
          value={current.effort}
          options={EFFORT_OPTIONS}
          onChange={(effort) => update({ effort, effortWeight: EFFORT_WEIGHT[effort] })}
        />

        <SegmentedControl
          label="Can do now"
          value={current.canDoNow}
          options={CAN_DO_NOW_OPTIONS}
          onChange={(canDoNow) => update({ canDoNow })}
        />

        <div className="ht-form__field">
          <label className="ht-form__label" htmlFor="task-price">
            Price (£)
          </label>
          <input
            id="task-price"
            className="ht-form__input"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            placeholder="—"
            value={priceValue}
            onChange={(event) => handlePriceChange(event.target.value)}
            onBlur={handlePriceBlur}
          />
        </div>

        <div className="ht-form__row">
          <div className="ht-form__field">
            <label className="ht-form__label" htmlFor="task-date-planned">
              Date planned
            </label>
            <input
              id="task-date-planned"
              className="ht-form__input"
              type="date"
              value={current.datePlanned ?? ""}
              onChange={(event) => handleDate("datePlanned", event.target.value)}
            />
          </div>
          <div className="ht-form__field">
            <label className="ht-form__label" htmlFor="task-date-completed">
              Date completed
            </label>
            <input
              id="task-date-completed"
              className="ht-form__input"
              type="date"
              value={current.dateCompleted ?? ""}
              onChange={(event) =>
                handleDate("dateCompleted", event.target.value)
              }
            />
          </div>
        </div>

        <div className="ht-form__field">
          <label className="ht-form__label" htmlFor="task-notes">
            Notes
          </label>
          <textarea
            id="task-notes"
            className="ht-form__input"
            rows={3}
            value={current.notes}
            onChange={(event) => update({ notes: event.target.value })}
          />
        </div>

        {pricePromptOpen && (
          <div className="ht-prompt">
            <div className="ht-form__field">
              <label className="ht-form__label" htmlFor="task-prompt-price">
                Add price (£)
              </label>
              <input
                id="task-prompt-price"
                className="ht-form__input"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                autoFocus
                value={promptPrice!.value}
                onChange={(event) =>
                  setPromptPrice({
                    taskId: current.id,
                    value: event.target.value,
                  })
                }
              />
            </div>
            <div className="ht-prompt__actions">
              <button
                type="button"
                className="ht-btn"
                onClick={handlePromptSkip}
              >
                Skip
              </button>
              <button
                type="button"
                className="ht-btn ht-btn--accent"
                onClick={handlePromptSave}
              >
                Save &amp; done
              </button>
            </div>
          </div>
        )}

        {!completed && (
          <button
            type="button"
            className="ht-sheet__done"
            onClick={handleMarkDone}
          >
            Mark as done
          </button>
        )}

        <button
          type="button"
          className="ht-sheet__danger"
          onClick={handleDelete}
        >
          Delete task
        </button>
      </form>
    </Sheet>
  );
}
