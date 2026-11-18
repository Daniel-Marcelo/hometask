import { useState } from "react";
import type { FormEvent } from "react";
import { Sheet } from "../../components/Sheet";
import type { Task } from "../../data/repo";
import { repo, useRepoState } from "../../data/useRepo";
import type { CanDoNow, Effort, Priority, Status } from "../../data/types";
import { needsPricePrompt } from "./pricePrompt";
import { showUndo } from "./undoStore";

/** Effort label → weight (exact plan map: XS:1, S:2, M:3, L:5, XL:8). */
const EFFORT_WEIGHT: Record<Effort, number> = {
  XS: 1,
  S: 2,
  M: 3,
  L: 5,
  XL: 8,
};

/** What the user may type into a money field: digits, one optional dot, at
 * most two fraction digits — so drafts like "80.", ".5" and "80.55" are all
 * valid, while "80.555" or "1,000" are refused (the controlled value snaps
 * back). Money inputs must be type="text": type="number" silently rewrites
 * a trailing-dot draft to "" mid-typing. */
const MONEY_DRAFT_RE = /^\d*\.?\d{0,2}$/;

/** Strict decimal string → integer cents with no float arithmetic: the
 * fraction is padded to exactly 2 digits instead of multiplying a float by
 * 100 (Math.round(1.005 * 100) drifts to 100 — a 3-decimal draft can never
 * reach here because MONEY_DRAFT_RE rejects it at the input).
 * Callers gate input through MONEY_DRAFT_RE; "" or "." parse to null. */
function parseMoneyToCents(raw: string): number | null {
  const match = /^(\d*)(?:\.(\d{0,2}))?$/.exec(raw);
  if (match === null) return null;
  if (match[1] === "" && (match[2] ?? "") === "") return null;
  const whole = match[1] === "" ? 0 : Number(match[1]);
  const fraction = (match[2] ?? "").padEnd(2, "0");
  return whole * 100 + Number(fraction);
}

/** Existing price → the pounds string shown in an input ("£"-free, 2 decimals). */
function centsToDraft(cents: number | null): string {
  return cents === null ? "" : (cents / 100).toFixed(2);
}

/** A local text draft keyed to its task, so a task switch never shows another
 * task's pending input. */
interface TextDraft {
  taskId: string
  value: string
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
 * The app's primary edit surface for a task. The sheet always renders repo
 * truth — it re-reads the task by id from repo state, same discipline as
 * TaskRow. Text fields (title, notes, price) draft locally while typing and
 * commit on blur, so a keystroke never re-persists the whole task.
 *
 * Layout: a fixed header (truncated title + a 44px close button), a
 * scrollable body with every field, and a sticky footer with the primary
 * completion action and Delete always visible at the bottom.
 *
 * Completion: the big terracotta "Mark as done" button (hidden once
 * completed) goes through `repo.completeWithUndo` and hands the undo to the
 * app-level undo host, exactly like TaskRow. Unpriced "Buy …" tasks get an
 * inline price prompt first: Skip completes without a price, Save & done
 * stores the price then completes. The prompt is keyed to the task id, so a
 * stale flag can never leak across tasks. The prompt's action pair replaces
 * the footer, so Skip / Save & done stay on screen too.
 *
 * Price edits draft locally while the user types (the field is a plain
 * text input — `type="number"` would silently rewrite a trailing-dot draft
 * to "") and commit on blur, so partial input like "80." can never touch
 * or wipe the stored price; on blur the draft is dropped and the field
 * snaps back to the committed value.
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
  const [titleDraft, setTitleDraft] = useState<TextDraft | null>(null);
  const [notesDraft, setNotesDraft] = useState<TextDraft | null>(null);
  const [promptPrice, setPromptPrice] = useState<{
    taskId: string
    value: string
  } | null>(null);

  const priceDraftLive = priceDraft?.taskId === current.id;
  const priceValue = priceDraftLive
    ? priceDraft!.value
    : centsToDraft(current.priceCents);
  const titleValue =
    titleDraft?.taskId === current.id ? titleDraft.value : current.title;
  const notesValue =
    notesDraft?.taskId === current.id ? notesDraft.value : current.notes;
  const pricePromptOpen =
    promptPrice?.taskId === current.id && !completed && needsPricePrompt(current);

  const update = (patch: Partial<Task>): void => {
    repo.updateTask(current.id, patch);
  };

  const complete = (): void => {
    const undo = repo.completeWithUndo(current.id);
    // The host owns the toast and the undo closure for the full window.
    showUndo(`Completed "${current.title}"`, () => undo());
  };

  /** Start completing: unpriced "Buy …" tasks get the inline price prompt
   * first; everything else completes immediately through the repo contract. */
  const beginComplete = (): void => {
    if (needsPricePrompt(current)) {
      setPromptPrice({ taskId: current.id, value: "" });
    } else {
      complete();
    }
  };

  const handleMarkDone = (): void => {
    if (completed) return;
    beginComplete();
  };

  /** Status edits commit through updateTask — except "Completed": completion
   * must go through the same contract as "Mark as done" (completeWithUndo,
   * which stamps dateCompleted) so a Buy task can never bypass the price
   * prompt and never end completed with a null dateCompleted. Selecting
   * "Completed" on an already-completed task is a no-op. */
  const handleStatusChange = (status: Status): void => {
    if (status === "completed") {
      if (!completed) beginComplete();
      return;
    }
    update({ status });
  };

  const handlePromptSkip = (): void => {
    complete();
  };

  /** The prompt draft is local while typing and only parsed on Save & done. */
  const handlePromptPriceChange = (value: string): void => {
    if (!MONEY_DRAFT_RE.test(value)) return;
    setPromptPrice({ taskId: current.id, value });
  };

  const handlePromptSave = (): void => {
    const cents = parseMoneyToCents(promptPrice?.value ?? "");
    // No valid amount yet: stay in the prompt until it parses or the user
    // explicitly skips — "Save & done" never silently drops the price.
    if (cents === null) return;
    update({ priceCents: cents });
    complete();
  };

  /** The draft is local while typing and only parsed for the commit on blur,
   * so partial input like "80." can never touch the stored price. */
  const handlePriceChange = (value: string): void => {
    if (!MONEY_DRAFT_RE.test(value)) return;
    setPriceDraft({ taskId: current.id, value });
  };

  const handlePriceBlur = (): void => {
    const draft = priceDraft;
    // Drop the draft: the controlled value snaps back to repo truth.
    setPriceDraft(null);
    if (draft === null || draft.taskId !== current.id) return;
    if (draft.value === "") {
      if (current.priceCents !== null) update({ priceCents: null });
      return;
    }
    const cents = parseMoneyToCents(draft.value);
    if (cents !== null && cents !== current.priceCents) update({ priceCents: cents });
  };

  /** Title and notes follow the price field: draft while typing, commit on
   * blur — one repo write per field, not one per keystroke. */
  const handleTextBlur = (
    field: "title" | "notes",
    draft: TextDraft | null,
  ): void => {
    if (field === "title") setTitleDraft(null);
    else setNotesDraft(null);
    if (draft === null || draft.taskId !== current.id) return;
    if (draft.value === current[field]) return;
    update(field === "title" ? { title: draft.value } : { notes: draft.value });
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

  const footer = pricePromptOpen ? (
    <div className="ht-prompt__actions">
      <button type="button" className="ht-btn" onClick={handlePromptSkip}>
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
  ) : (
    <>
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
    </>
  );

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={current.title}
      showClose
      footer={footer}
    >
      <form className="ht-form" onSubmit={handleSubmit}>
        <div className="ht-form__field">
          <label className="ht-form__label" htmlFor="task-title">
            Title
          </label>
          <input
            id="task-title"
            className="ht-form__input"
            value={titleValue}
            onChange={(event) =>
              setTitleDraft({ taskId: current.id, value: event.target.value })
            }
            onBlur={() => handleTextBlur("title", titleDraft)}
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
          onChange={handleStatusChange}
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
            type="text"
            inputMode="decimal"
            autoComplete="off"
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
            value={notesValue}
            onChange={(event) =>
              setNotesDraft({ taskId: current.id, value: event.target.value })
            }
            onBlur={() => handleTextBlur("notes", notesDraft)}
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
                type="text"
                inputMode="decimal"
                autoComplete="off"
                autoFocus
                value={promptPrice!.value}
                onChange={(event) =>
                  handlePromptPriceChange(event.target.value)
                }
              />
            </div>
          </div>
        )}
      </form>
    </Sheet>
  );
}
