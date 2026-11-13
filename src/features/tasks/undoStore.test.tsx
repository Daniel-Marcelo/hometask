import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearUndo, showUndo, useUndoToast } from "./undoStore";

afterEach(() => {
  clearUndo();
  vi.useRealTimers();
});

describe("undoStore", () => {
  it("showUndo exposes message/onUndo and the window hides the toast after 5s", () => {
    vi.useFakeTimers();
    const onUndo = vi.fn();
    const { result } = renderHook(() => useUndoToast());
    expect(result.current).toBeNull();

    act(() => {
      showUndo('Completed "X"', onUndo);
    });
    expect(result.current).toMatchObject({
      message: 'Completed "X"',
      id: expect.any(Number),
    });
    // The exposed closure is the undo the host will hand to the toast.
    result.current?.onUndo();
    expect(onUndo).toHaveBeenCalledOnce();

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current).toBeNull();
    // Expiry never fires the undo closure — undo lives only in the toast.
    expect(onUndo).toHaveBeenCalledOnce();
  });

  it("clearUndo hides the toast now and cancels the pending timer", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useUndoToast());
    act(() => {
      showUndo("A", () => {});
    });
    act(() => {
      clearUndo();
    });
    expect(result.current).toBeNull();
    expect(() => {
      act(() => {
        vi.advanceTimersByTime(5000);
      });
    }).not.toThrow();
    expect(result.current).toBeNull();
  });

  it("a second showUndo cancels the first toast's timer — one pending timeout, newest wins", () => {
    vi.useFakeTimers();
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
    const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");
    const first = vi.fn();
    const second = vi.fn();

    const { result } = renderHook(() => useUndoToast());
    act(() => {
      showUndo("First", first);
    });
    expect(result.current?.message).toBe("First");

    act(() => {
      showUndo("Second", second);
    });
    // Only the newest toast is exposed; exactly one timer was cancelled, so
    // exactly one timeout stays pending.
    expect(result.current?.message).toBe("Second");
    expect(setTimeoutSpy).toHaveBeenCalledTimes(2);
    expect(clearTimeoutSpy).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current).toBeNull();
    // Neither closure was fired by a timer — undo lives only in the toast.
    expect(first).not.toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();
  });
});
