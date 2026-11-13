import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { TabBar } from './components/TabBar'
import { HomePlaceholder, RoomsPlaceholder, SpendPlaceholder, TasksPlaceholder } from './pages/Placeholders'

/**
 * App shell: centered mobile-first column, 4 bottom tabs, hash-based routing
 * (static-host friendly — no server rewrites needed).
 */
export function App() {
  return (
    <HashRouter>
      <div id="app-column">
        <Routes>
          <Route path="/" element={<HomePlaceholder />} />
          <Route path="/tasks" element={<TasksPlaceholder />} />
          <Route path="/rooms" element={<RoomsPlaceholder />} />
          <Route path="/spend" element={<SpendPlaceholder />} />
          {/* Unknown hashes land home instead of a blank page. */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <TabBar />
      </div>
    </HashRouter>
  )
}
