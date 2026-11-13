/** Slender progress bar: olive fill on a warm hairline track. */
export function ProgressBar({ pct }: { pct: number }) {
  const clamped = Math.min(100, Math.max(0, pct))
  return (
    <div
      className="ht-progress"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped)}
    >
      <div className="ht-progress__fill" style={{ width: `${clamped}%` }} />
    </div>
  )
}
