/** Fixed offline notice pinned to the top of the viewport. Task 13 wires this. */
export function OfflineBanner({ visible }: { visible: boolean }) {
  if (!visible) return null
  return (
    <div className="ht-offline" role="status">
      Offline — changes will sync
    </div>
  )
}
