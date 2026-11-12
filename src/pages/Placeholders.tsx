/**
 * The 4 placeholder routes. Each becomes a real page in a later task;
 * keep the route paths (`/`, `/tasks`, `/rooms`, `/spend`) stable.
 */
export function HomePlaceholder() {
  return <PagePlaceholder title="Home" />
}

export function TasksPlaceholder() {
  return <PagePlaceholder title="Tasks" />
}

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
