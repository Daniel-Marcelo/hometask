/** Dashboard stat card: muted label, serif display value, optional sub line. */
export function StatTile({
  label,
  value,
  sub,
  accent,
}: {
  label: string
  value: string
  sub?: string
  accent?: boolean
}) {
  const className = accent ? 'ht-tile ht-tile--accent' : 'ht-tile'
  return (
    <div className={className}>
      <span className="ht-tile__label">{label}</span>
      <span className="ht-tile__value">{value}</span>
      {sub && <span className="ht-tile__sub">{sub}</span>}
    </div>
  )
}
