import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import itemListCsvText from './data/csv/item-list.csv?raw'
import { parseItemListCsv } from './data/parse'
import { repo } from './data/useRepo'
import { SESSION_KEY } from './lib/auth'
import { App } from './App'

// RTL auto-cleanup needs vitest globals, which this project doesn't enable.
afterEach(cleanup)

const STORAGE_KEY = 'hometask.v1'

/**
 * Restore the pristine CSV seed (same pattern as the feature-page tests):
 * the repo singleton is module-level and persists mutations, so a prior
 * test's writes would leak into this suite.
 */
function resetSeed(): void {
  const { rooms, tasks } = parseItemListCsv(itemListCsvText)
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ rooms, tasks, queuedOps: [], lastSyncedAt: null }),
  )
}

/** Stub navigator.onLine — jsdom doesn't let you assign it directly. */
function setOnline(online: boolean): void {
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    value: online,
  })
}

describe('App offline banner wiring', () => {
  beforeEach(() => {
    resetSeed()
    setOnline(true)
    // The app shell renders only for a signed-in user (Task 14): the auth
    // gate resolves the persisted session on mount.
    localStorage.setItem(SESSION_KEY, JSON.stringify({ email: 'test@example.com' }))
  })

  it('hides the banner while online', () => {
    render(<App />)
    expect(screen.queryByText('Offline — changes will sync')).toBeNull()
  })

  it('shows the banner when the browser goes offline and hides it again on reconnect', async () => {
    render(<App />)

    window.dispatchEvent(new Event('offline'))
    await waitFor(() =>
      expect(screen.getByText('Offline — changes will sync')).toBeInTheDocument(),
    )

    window.dispatchEvent(new Event('online'))
    await waitFor(() =>
      expect(screen.queryByText('Offline — changes will sync')).toBeNull(),
    )
  })

  it('renders the banner on mount when the app starts offline', () => {
    setOnline(false)
    render(<App />)
    expect(screen.getByText('Offline — changes will sync')).toBeInTheDocument()
  })

  it('renders the banner in flow ahead of the page content when offline', () => {
    setOnline(false)
    const { container } = render(<App />)

    // First child of the app column (in-flow, no overlay).
    const column = container.querySelector('#app-column')!
    expect(column.firstElementChild).toHaveClass('ht-offline')

    // It precedes the page heading in DOM order — it pushes content down
    // rather than covering it.
    const order = [...column.querySelectorAll('.ht-offline, h1')]
    expect(order).toHaveLength(2)
    expect(order[0]).toHaveClass('ht-offline')
  })

  it('shows a storage warning after a failed persist and clears it on the next success', () => {
    const warning = 'Storage is full — recent changes may not be saved'
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const setItemSpy = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new DOMException('quota exceeded', 'QuotaExceededError')
      })

    try {
      render(<App />)
      act(() => {
        repo.updateTask('all-house-clean-windows', { title: 'Unsaved edit' })
      })
      expect(screen.getByText(warning)).toBeInTheDocument()

      // The next successful write clears the flag and the strip.
      setItemSpy.mockRestore()
      act(() => {
        repo.updateTask('all-house-clean-windows', { title: 'Saved edit' })
      })
      expect(screen.queryByText(warning)).toBeNull()
    } finally {
      setItemSpy.mockRestore()
      warnSpy.mockRestore()
    }
  })
})
