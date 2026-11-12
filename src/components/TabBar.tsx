import type { CSSProperties, ReactNode } from 'react'
import { NavLink } from 'react-router-dom'

type Tab = {
  to: string
  label: string
  icon: ReactNode
}

const homeIcon = (
  <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
    <path
      d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5.5v-6h-5v6H4a1 1 0 0 1-1-1Z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
  </svg>
)

const gridIcon = (
  <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
    <rect x="3" y="3" width="8" height="8" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
    <rect x="13" y="3" width="8" height="8" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
    <rect x="3" y="13" width="8" height="8" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
    <rect x="13" y="13" width="8" height="8" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
  </svg>
)

const listIcon = (
  <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
    <path d="M8 6h13M8 12h13M8 18h13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <circle cx="3.5" cy="6" r="1.2" fill="currentColor" />
    <circle cx="3.5" cy="12" r="1.2" fill="currentColor" />
    <circle cx="3.5" cy="18" r="1.2" fill="currentColor" />
  </svg>
)

const coinsIcon = (
  <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
    <ellipse cx="12" cy="6.5" rx="8" ry="3.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
    <path d="M4 6.5v5c0 1.93 3.58 3.5 8 3.5s8-1.57 8-3.5v-5" fill="none" stroke="currentColor" strokeWidth="1.8" />
    <path d="M4 11.5v5c0 1.93 3.58 3.5 8 3.5s8-1.57 8-3.5v-5" fill="none" stroke="currentColor" strokeWidth="1.8" />
  </svg>
)

const tabs: Tab[] = [
  { to: '/', label: 'Home', icon: homeIcon },
  { to: '/tasks', label: 'Tasks', icon: gridIcon },
  { to: '/rooms', label: 'Rooms', icon: listIcon },
  { to: '/spend', label: 'Spend', icon: coinsIcon },
]

/** Fixed bottom tab bar; every tab is a ≥44px touch target. */
export function TabBar() {
  return (
    <nav aria-label="Primary" style={styles.nav}>
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.to === '/'}
          aria-label={tab.label}
          style={({ isActive }) => ({
            ...styles.tab,
            color: isActive ? 'var(--accent)' : 'var(--muted)',
          })}
        >
          {tab.icon}
          <span style={styles.label}>{tab.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}

const styles: Record<string, CSSProperties> = {
  nav: {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    maxWidth: '480px',
    margin: '0 auto',
    display: 'flex',
    background: 'var(--card)',
    borderTop: '1px solid var(--hairline)',
  },
  tab: {
    flex: 1,
    minHeight: '44px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '2px',
    padding: '6px 4px',
    textDecoration: 'none',
    fontSize: '11px',
  },
  label: {
    lineHeight: 1,
  },
}

