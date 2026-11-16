import { useEffect, useState } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { OfflineBanner } from './components/OfflineBanner'
import { TabBar } from './components/TabBar'
import { AuthGate } from './features/auth/AuthGate'
import { HomePage } from './features/home/HomePage'
import { RoomDetailPage } from './features/rooms/RoomDetailPage'
import { RoomsPage } from './features/rooms/RoomsPage'
import { SpendPage } from './features/spend/SpendPage'
import { TaskListPage } from './features/tasks/TaskListPage'
import { UndoToastHost } from './features/tasks/UndoToastHost'

/**
 * Tracks browser connectivity: `navigator.onLine` at mount, then follows the
 * `online`/`offline` window events. Drives the OfflineBanner.
 */
function useOfflineVisible(): boolean {
  const [offline, setOffline] = useState(() => !navigator.onLine)
  useEffect(() => {
    const goOffline = () => setOffline(true)
    const goOnline = () => setOffline(false)
    window.addEventListener('offline', goOffline)
    window.addEventListener('online', goOnline)
    return () => {
      window.removeEventListener('offline', goOffline)
      window.removeEventListener('online', goOnline)
    }
  }, [])
  return offline
}

/**
 * App shell: centered mobile-first column, 4 bottom tabs, hash-based routing
 * (static-host friendly — no server rewrites needed).
 *
 * The whole shell sits behind the auth gate: the routes only render for a
 * signed-in user, everyone else gets the sign-in page.
 */
export function App() {
  const offline = useOfflineVisible()
  return (
    <AuthGate>
      <HashRouter>
        <div id="app-column">
          <OfflineBanner visible={offline} />
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/tasks" element={<TaskListPage />} />
            <Route path="/rooms" element={<RoomsPage />} />
            <Route path="/rooms/:id" element={<RoomDetailPage />} />
            <Route path="/spend" element={<SpendPage />} />
            {/* Unknown hashes land home instead of a blank page. */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <TabBar />
          {/* One app-level undo host outside Routes: survives row unmounts and
              route changes, and only ever shows the newest toast. */}
          <UndoToastHost />
        </div>
      </HashRouter>
    </AuthGate>
  )
}
