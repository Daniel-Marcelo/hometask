/**
 * Fixed slide-up toast with a single Undo action. Renders nothing while
 * hidden; consumers own keeping only one instance visible at a time.
 */
export function UndoToast({
  message,
  onUndo,
  visible,
}: {
  message: string
  onUndo: () => void
  visible: boolean
}) {
  if (!visible) return null
  return (
    <div className="ht-undo" role="status">
      <span className="ht-undo__message">{message}</span>
      <button type="button" className="ht-undo__undo" onClick={onUndo}>
        Undo
      </button>
    </div>
  )
}
