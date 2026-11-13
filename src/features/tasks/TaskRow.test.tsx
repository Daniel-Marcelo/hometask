import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { repo } from "../../data/useRepo";
import type { Task } from "../../data/repo";
import { UndoToastHost } from "./UndoToastHost";
import { TaskRow } from "./TaskRow";
import { clearUndo } from "./undoStore";

// RTL auto-cleanup needs vitest globals, which this project doesn't enable.
afterEach(() => {
  cleanup();
  clearUndo();
  vi.useRealTimers();
});

const STORAGE_KEY = "hometask.v1";

/**
 * Look up a live task by title (optionally scoped to a room). The repo
 * singleton seeds the real CSV, so titles repeat across rooms — scope
 * ambiguous ones with roomId.
 */
function taskBy(title: string, roomId?: string): Task {
  const task = repo
    .getState()
    .tasks.find(
      (t) => t.title === title && (roomId === undefined || t.roomId === roomId),
    );
  if (task === undefined) throw new Error(`task not found: ${title}`);
  return task;
}

/** Row + the app-level undo host, as the app composes them. */
function renderRow(task: Task) {
  const onOpen = vi.fn();
  const utils = render(
    <>
      <TaskRow task={task} onOpen={onOpen} />
      <UndoToastHost />
    </>,
  );
  return { ...utils, onOpen };
}

/** Harness whose row can unmount on re-render (re-filter / re-sort). */
function RowToggle({ task, show }: { task: Task; show: boolean }) {
  return (
    <>
      {show ? <TaskRow task={task} onOpen={() => {}} /> : null}
      <UndoToastHost />
    </>
  );
}

describe("TaskRow", () => {
  it('clicking the circle completes the task in repo state and the host shows the toast ("Undo integrity" focus)', () => {
    localStorage.removeItem(STORAGE_KEY);
    const task = taskBy("Paint Stairs");
    expect(task.status).not.toBe("completed");

    renderRow(task);
    fireEvent.click(
      screen.getByRole("button", { name: `Complete "Paint Stairs"` }),
    );

    const after = repo.getState().tasks.find((t) => t.id === task.id);
    expect(after?.status).toBe("completed");
    expect(after?.dateCompleted).toBe(new Date().toISOString().slice(0, 10));
    // The price and planned date must survive completion untouched.
    expect(after?.priceCents).toBe(task.priceCents);
    expect(after?.datePlanned).toBe(task.datePlanned);

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByText(`Completed "Paint Stairs"`)).toBeInTheDocument();
  });

  it("clicking the toast's Undo restores the exact prior task (price/dates intact)", () => {
    const task = taskBy("Renovate Staircase");
    const snapshot = structuredClone(task);

    renderRow(task);
    fireEvent.click(
      screen.getByRole("button", { name: `Complete "Renovate Staircase"` }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));

    const restored = repo.getState().tasks.find((t) => t.id === task.id);
    expect(restored).toEqual(snapshot);
    expect(restored?.status).not.toBe("completed");
    expect(restored?.dateCompleted).toBeNull();
    expect(restored?.priceCents).toBe(snapshot.priceCents);
    expect(restored?.datePlanned).toBe(snapshot.datePlanned);
    // And the toast is gone after undoing.
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("undo restores a REAL price and planned date, not null-vs-null (Fix Roof fixture)", () => {
    const id = "all-house-fix-roof"; // seeded: priceCents 390000, dateCompleted 2026-11-06
    // Move it to an incomplete prior state that still carries the real price.
    repo.updateTask(id, { status: "unplanned", dateCompleted: null });
    const task = repo.getState().tasks.find((t) => t.id === id)!;
    const snapshot = structuredClone(task);
    expect(snapshot.priceCents).toBe(390000);
    expect(snapshot.status).not.toBe("completed");

    renderRow(task);
    fireEvent.click(screen.getByRole("button", { name: `Complete "Fix Roof"` }));
    expect(screen.getByRole("status")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));

    const restored = repo.getState().tasks.find((t) => t.id === id)!;
    // Deep equal: the price and every date survive completion + undo verbatim.
    expect(restored).toEqual(snapshot);
    expect(restored.priceCents).toBe(390000);
    expect(restored.dateCompleted).toBeNull();
  });

  it("clicking the title (aria-label 'Open <title>') calls onOpen with the task and shows room name + effort muted", () => {
    const task = taskBy("Buy Shoe Cabinet"); // Hallway, effort S
    const { onOpen } = renderRow(task);

    // The body button's accessible name comes from its aria-label.
    fireEvent.click(screen.getByRole("button", { name: "Open Buy Shoe Cabinet" }));

    expect(onOpen).toHaveBeenCalledOnce();
    expect(onOpen).toHaveBeenCalledWith(task);
    expect(screen.getByText("Hallway · S")).toBeInTheDocument();
  });

  it("renders the terracotta left-rule for urgent tasks only", () => {
    const urgent = taskBy("Fix Windows");
    const { container } = render(<TaskRow task={urgent} onOpen={() => {}} />);
    expect(container.querySelector(".ht-row")).toHaveClass("ht-row--urgent");
    cleanup();

    const calm = taskBy("Fill Floor Gaps");
    const calmRender = render(<TaskRow task={calm} onOpen={() => {}} />);
    expect(calmRender.container.querySelector(".ht-row")).not.toHaveClass(
      "ht-row--urgent",
    );
  });

  it("renders completed rows struck-through with an olive check; the circle does nothing", () => {
    // "Buy Sideboard" seeds as completed and no other test mutates it
    // (the priced-fixture test leaves "Fix Roof" unplanned on purpose).
    const done = taskBy("Buy Sideboard");
    const { container } = renderRow(done);

    expect(container.querySelector(".ht-row")).toHaveClass("ht-row--done");
    const title = screen.getByText("Buy Sideboard");
    expect(title).toHaveClass("ht-row__title--done");
    const circle = container.querySelector(".ht-row__circle")!;
    expect(circle).toHaveClass("ht-row__circle--done");

    const opsBefore = repo.getState().queuedOps.length;
    fireEvent.click(circle);
    // No re-completion: no queue growth, no toast.
    expect(repo.getState().queuedOps).toHaveLength(opsBefore);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("hides the undo toast 5 seconds after completion", () => {
    vi.useFakeTimers();
    const task = taskBy("Remove Wall Paper", "main-living-room");
    renderRow(task);

    fireEvent.click(
      screen.getByRole("button", { name: `Complete "Remove Wall Paper"` }),
    );
    expect(screen.getByRole("status")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("the host keeps the toast and undo alive after the row unmounts (re-filter/re-sort)", () => {
    const task = taskBy("Renovate Grout", "kitchen-dining");
    const snapshot = structuredClone(task);
    const { rerender } = render(<RowToggle task={task} show={true} />);

    fireEvent.click(
      screen.getByRole("button", { name: `Complete "Renovate Grout"` }),
    );
    expect(screen.getByRole("status")).toBeInTheDocument();

    // The row unmounts within the 5s window; the host must not.
    rerender(<RowToggle task={task} show={false} />);
    expect(screen.getByRole("status")).toBeInTheDocument();

    // Undo still restores the exact prior task.
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(repo.getState().tasks.find((t) => t.id === task.id)).toEqual(snapshot);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("two completions within 5s show only the newest toast; the first undo never fires", () => {
    vi.useFakeTimers();
    const first = taskBy("Fill Floor Gaps");
    const second = taskBy("Buy new sink");
    render(
      <>
        <TaskRow task={first} onOpen={() => {}} />
        <TaskRow task={second} onOpen={() => {}} />
        <UndoToastHost />
      </>,
    );

    fireEvent.click(screen.getByRole("button", { name: `Complete "Fill Floor Gaps"` }));
    expect(screen.getByText(`Completed "Fill Floor Gaps"`)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: `Complete "Buy new sink"` }));
    // The later toast owns the spot; the earlier one is gone (its timer was
    // cancelled by the second show).
    expect(screen.getByText(`Completed "Buy new sink"`)).toBeInTheDocument();
    expect(screen.queryByText(`Completed "Fill Floor Gaps"`)).toBeNull();

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.queryByRole("status")).toBeNull();
    // The first completion's undo was never invoked by anything.
    expect(repo.getState().tasks.find((t) => t.id === first.id)?.status).toBe(
      "completed",
    );
  });
});
