import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { repo } from "../../data/useRepo";
import type { Task } from "../../data/repo";
import { TaskRow } from "./TaskRow";

// RTL auto-cleanup needs vitest globals, which this project doesn't enable.
afterEach(() => {
  cleanup();
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

function renderRow(task: Task) {
  const onOpen = vi.fn();
  render(<TaskRow task={task} onOpen={onOpen} />);
  return { onOpen };
}

describe("TaskRow", () => {
  it('clicking the circle completes the task in repo state and shows the toast ("Undo integrity" focus)', () => {
    localStorage.removeItem(STORAGE_KEY);
    const task = taskBy("Paint Stairs");
    expect(task.status).not.toBe("completed");

    renderRow(task);
    fireEvent.click(
      screen.getByRole("button", { name: `Complete "Paint Stairs"` }),
    );

    const after = repo
      .getState()
      .tasks.find((t) => t.id === task.id);
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

  it("clicking the title calls onOpen with the task and shows room name + effort muted", () => {
    const task = taskBy("Buy Shoe Cabinet"); // Hallway, effort S
    const { onOpen } = renderRow(task);

    fireEvent.click(screen.getByText("Buy Shoe Cabinet"));

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
    const done = taskBy("Fix Roof"); // seeded as completed
    const { container } = render(<TaskRow task={done} onOpen={() => {}} />);

    expect(container.querySelector(".ht-row")).toHaveClass("ht-row--done");
    const title = screen.getByText("Fix Roof");
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

  it("clears the undo timer on unmount so no stray update fires", () => {
    vi.useFakeTimers();
    const task = taskBy("Buy Hand Towel Holder", "main-bathroom");
    renderRow(task);
    fireEvent.click(screen.getByRole("button", { name: /Complete "Buy Hand/ }));
    cleanup();

    expect(() => {
      act(() => {
        vi.advanceTimersByTime(6000);
      });
    }).not.toThrow();
    expect(screen.queryByRole("status")).toBeNull();
  });
});
