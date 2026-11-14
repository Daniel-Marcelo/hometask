/**
 * The 2 remaining placeholder routes (Home and Tasks became real pages in
 * Tasks 8 and 9). Each becomes a real page in a later task; keep the route
 * paths (`/rooms`, `/spend`) stable.
 */
export function RoomsPlaceholder() {
  return <PagePlaceholder title="Rooms" />
}

export function SpendPlaceholder() {
  return <PagePlaceholder title="Spend" />
}

function PagePlaceholder({ title }: { title: string }) {
  return (
    <main style={{ padding: '24px 16px' }}>
      <h1 style={{ margin: 0 }}>{title}</h1>
      <p style={{ color: 'var(--muted)' }}>Coming in a later task.</p>
    </main>
  )
}
