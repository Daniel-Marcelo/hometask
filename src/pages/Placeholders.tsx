/**
 * The 1 remaining placeholder route (Home, Tasks and Rooms became real
 * pages in Tasks 8, 9 and 10). It becomes a real page in a later task;
 * keep the route path (`/spend`) stable.
 */
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
