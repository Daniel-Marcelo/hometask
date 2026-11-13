import { UndoToast } from "../../components/UndoToast";
import { clearUndo, useUndoToast } from "./undoStore";

/**
 * App-level undo host, rendered once outside Routes. It owns the toast for
 * the full 5-second window — so a task row unmounting (re-filter, re-sort,
 * completed-section collapse) can never take a pending undo with it — and
 * only ever one instance, so two quick completions can't stack toasts.
 */
export function UndoToastHost() {
  const undo = useUndoToast();
  if (undo === null) return null;
  return (
    <UndoToast
      message={undo.message}
      onUndo={() => {
        undo.onUndo();
        // Undo taken: dismiss now instead of waiting out the window.
        clearUndo();
      }}
      visible={true}
    />
  );
}
