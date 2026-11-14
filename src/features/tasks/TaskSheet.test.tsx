import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Task } from "../../data/repo";
import { repo } from "../../data/useRepo";
import { clearUndo } from "./undoStore";
import { NewTaskSheet } from "./NewTaskSheet";
import { TaskSheet } from "./TaskSheet";
import { UndoToastHost } from "./UndoToastHost";

// RTL auto-cleanup needs vitest globals, which this project doesn't enable.
afterEach(() => {
  cleanup();
  clearUndo();
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

/** Sheet + the app-level undo host, as the app composes them. */
function renderTaskSheet(task: Task) {
  return render(
    <>
      <TaskSheet task={task} open={true} onClose={() => {}} />
      <UndoToastHost />
    </>,
  );
}

describe("TaskSheet", () => {
  it("changing status to Completed via the segmented control persists to repo", () => {
    localStorage.removeItem(STORAGE_KEY);
    const task = taskBy("Clean Windows");
    expect(task.status).not.toBe("completed");

    renderTaskSheet(task);
    fireEvent.click(screen.getByRole("button", { name: "Completed" }));

    const after = repo.getState().tasks.find((t) => t.id === task.id);
    expect(after?.status).toBe("completed");
  });

  it('"Mark as done" on unpriced "Buy Rug" shows the price field; Skip completes with priceCents still null', () => {
    localStorage.removeItem(STORAGE_KEY);
    const task = taskBy("Buy Rug", "conservatory");
    expect(task.priceCents).toBeNull();

    renderTaskSheet(task);
    fireEvent.click(screen.getByRole("button", { name: "Mark as done" }));

    // The inline price field appears — the spend prompt.
    expect(screen.getByLabelText("Add price (£)")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Skip" }));

    const after = repo.getState().tasks.find((t) => t.id === task.id);
    expect(after?.status).toBe("completed");
    expect(after?.priceCents).toBeNull();
    // Completed: the prompt and the done button are gone.
    expect(screen.queryByLabelText("Add price (£)")).toBeNull();
    expect(screen.queryByRole("button", { name: "Mark as done" })).toBeNull();
  });

  it('entering "80" in the prompt and "Save & done" completes with priceCents: 8000', () => {
    localStorage.removeItem(STORAGE_KEY);
    const task = taskBy("Buy Rug", "main-bedroom");
    expect(task.priceCents).toBeNull();

    renderTaskSheet(task);
    fireEvent.click(screen.getByRole("button", { name: "Mark as done" }));
    fireEvent.change(screen.getByLabelText("Add price (£)"), {
      target: { value: "80" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save & done" }));

    const after = repo.getState().tasks.find((t) => t.id === task.id);
    expect(after?.status).toBe("completed");
    expect(after?.priceCents).toBe(8000);
  });

  it('"Mark as done" on "Paint Stairs" (non-Buy) completes immediately with no price prompt', () => {
    localStorage.removeItem(STORAGE_KEY);
    const task = taskBy("Paint Stairs");
    expect(task.status).not.toBe("completed");
    expect(task.priceCents).toBeNull();

    renderTaskSheet(task);
    fireEvent.click(screen.getByRole("button", { name: "Mark as done" }));

    const after = repo.getState().tasks.find((t) => t.id === task.id);
    expect(after?.status).toBe("completed");
    expect(after?.priceCents).toBeNull();
    expect(screen.queryByLabelText("Add price (£)")).toBeNull();
    // Same completion path as the row: the undo toast comes up.
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByText('Completed "Paint Stairs"')).toBeInTheDocument();
  });

  it("selecting effort L sets effortWeight to 5 (XS:1 S:2 M:3 L:5 XL:8)", () => {
    localStorage.removeItem(STORAGE_KEY);
    const task = taskBy("Buy Shoe Cabinet");
    expect(task.effort).toBe("S");
    expect(task.effortWeight).toBe(2);

    renderTaskSheet(task);
    const lButton = screen.getByRole("button", { name: "L" });
    expect(lButton).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(lButton);

    const after = repo.getState().tasks.find((t) => t.id === task.id);
    expect(after?.effort).toBe("L");
    expect(after?.effortWeight).toBe(5);
    expect(screen.getByRole("button", { name: "L" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("the price field commits on blur, never clears mid-typing, and never float-drifts", () => {
    localStorage.removeItem(STORAGE_KEY);
    const task = taskBy("Fix Windows");

    renderTaskSheet(task);
    const price = screen.getByLabelText("Price (£)");

    // A partial draft ("80.") is local-only: the stored price is untouched.
    fireEvent.change(price, { target: { value: "80." } });
    expect(repo.getState().tasks.find((t) => t.id === task.id)?.priceCents).toBeNull();

    // A valid full draft commits as integer cents on blur.
    fireEvent.change(price, { target: { value: "80.55" } });
    fireEvent.blur(price);
    expect(repo.getState().tasks.find((t) => t.id === task.id)?.priceCents).toBe(8055);

    // With a price already stored, typing "80." must NOT wipe it (the old
    // type="number" bug turned the sanitized draft "" into priceCents null).
    fireEvent.change(price, { target: { value: "80." } });
    expect(repo.getState().tasks.find((t) => t.id === task.id)?.priceCents).toBe(8055);
    fireEvent.blur(price);
    expect(repo.getState().tasks.find((t) => t.id === task.id)?.priceCents).toBe(8000);

    // Empty input clears the price.
    fireEvent.change(price, { target: { value: "" } });
    fireEvent.blur(price);
    expect(repo.getState().tasks.find((t) => t.id === task.id)?.priceCents).toBeNull();
  });

  it('"Save & done" parses the decimal draft without float drift ("80.5" → 8050)', () => {
    localStorage.removeItem(STORAGE_KEY);
    const task = taskBy("Buy TV");

    renderTaskSheet(task);
    fireEvent.click(screen.getByRole("button", { name: "Mark as done" }));
    fireEvent.change(screen.getByLabelText("Add price (£)"), {
      target: { value: "80.5" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save & done" }));

    const after = repo.getState().tasks.find((t) => t.id === task.id);
    expect(after?.status).toBe("completed");
    expect(after?.priceCents).toBe(8050);
  });

  it('segmented "Completed" on unpriced "Buy Sofa" shows the prompt; Skip completes with null price AND dateCompleted set', () => {
    localStorage.removeItem(STORAGE_KEY);
    const task = taskBy("Buy Sofa");
    expect(task.priceCents).toBeNull();
    expect(task.dateCompleted).toBeNull();

    renderTaskSheet(task);
    fireEvent.click(screen.getByRole("button", { name: "Completed" }));
    expect(screen.getByLabelText("Add price (£)")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    const after = repo.getState().tasks.find((t) => t.id === task.id);
    expect(after?.status).toBe("completed");
    expect(after?.priceCents).toBeNull();
    expect(after?.dateCompleted).not.toBeNull();
  });

  it('segmented "Completed" on "Fill Floor Gaps" completes via the repo contract with dateCompleted set and no prompt', () => {
    localStorage.removeItem(STORAGE_KEY);
    const task = taskBy("Fill Floor Gaps");

    renderTaskSheet(task);
    fireEvent.click(screen.getByRole("button", { name: "Completed" }));

    const after = repo.getState().tasks.find((t) => t.id === task.id);
    expect(after?.status).toBe("completed");
    expect(after?.dateCompleted).toBe(new Date().toISOString().slice(0, 10));
    expect(screen.queryByLabelText("Add price (£)")).toBeNull();
  });

  it("delete asks for confirmation and removes the task; cancelling keeps it", () => {
    localStorage.removeItem(STORAGE_KEY);
    const confirmSpy = vi.spyOn(window, "confirm");

    const doomed = taskBy("Return other Rug");
    const kept = taskBy("Declutter");

    renderTaskSheet(doomed);

    // Declining the confirm leaves the task alone.
    confirmSpy.mockReturnValue(false);
    fireEvent.click(screen.getByRole("button", { name: "Delete task" }));
    expect(confirmSpy).toHaveBeenCalledOnce();
    expect(repo.getState().tasks.find((t) => t.id === doomed.id)).toBeDefined();

    // Accepting deletes it.
    confirmSpy.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Delete task" }));
    expect(repo.getState().tasks.find((t) => t.id === doomed.id)).toBeUndefined();
    expect(repo.getState().tasks.find((t) => t.id === kept.id)).toBeDefined();

    confirmSpy.mockRestore();
  });

  it("a completed task hides the Mark as done button", () => {
    localStorage.removeItem(STORAGE_KEY);
    const done = taskBy("Buy Sideboard");
    expect(done.status).toBe("completed");

    renderTaskSheet(done);
    expect(screen.queryByRole("button", { name: "Mark as done" })).toBeNull();
  });
});

describe("NewTaskSheet", () => {
  it("creates a task with the chosen room and priority and the documented defaults", () => {
    localStorage.removeItem(STORAGE_KEY);
    const onClose = vi.fn();
    render(<NewTaskSheet open={true} onClose={onClose} />);

    const conservatoryId =
      repo.getState().rooms.find((room) => room.name === "Conservatory")!.id;

    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Test Lamp" },
    });
    fireEvent.change(screen.getByLabelText("Room"), {
      target: { value: conservatoryId },
    });
    fireEvent.click(screen.getByRole("button", { name: "Urgent" }));
    fireEvent.click(screen.getByRole("button", { name: "Add task" }));

    const created = repo
      .getState()
      .tasks.find((task) => task.title === "Test Lamp");
    expect(created).toBeDefined();
    expect(created?.roomId).toBe(conservatoryId);
    expect(created?.priority).toBe("urgent");
    // Documented defaults.
    expect(created?.status).toBe("planned");
    expect(created?.effort).toBe("M");
    expect(created?.effortWeight).toBe(3);
    expect(created?.canDoNow).toBe("yes");
    expect(created?.priceCents).toBeNull();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("defaults the room to defaultRoomId when given", () => {
    localStorage.removeItem(STORAGE_KEY);
    const ensuiteId = repo.getState().rooms.find((room) => room.name === "Ensuite")!
      .id;
    render(<NewTaskSheet open={true} onClose={() => {}} defaultRoomId={ensuiteId} />);

    expect(screen.getByLabelText("Room")).toHaveValue(ensuiteId);
  });

  it("re-syncs the room from the CURRENT defaultRoomId on every closed → open transition (stale-default regression)", () => {
    localStorage.removeItem(STORAGE_KEY);
    const onClose = vi.fn();
    // Task 10 renders one mounted sheet whose defaultRoomId follows the
    // active room; the room picked at mount time must never go stale.
    const { rerender } = render(
      <NewTaskSheet open={false} onClose={onClose} defaultRoomId="hallway" />,
    );
    rerender(
      <NewTaskSheet open={true} onClose={onClose} defaultRoomId="main-bedroom" />,
    );

    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Re-sync Lamp" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add task" }));

    const created = repo
      .getState()
      .tasks.find((task) => task.title === "Re-sync Lamp");
    expect(created?.roomId).toBe("main-bedroom");
    expect(onClose).toHaveBeenCalledOnce();
  });
});
