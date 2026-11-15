import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { TabBar } from './components/TabBar'
import { HomePage } from './features/home/HomePage'
import { RoomDetailPage } from './features/rooms/RoomDetailPage'
import { RoomsPage } from './features/rooms/RoomsPage'
import { SpendPage } from './features/spend/SpendPage'
import { TaskListPage } from './features/tasks/TaskListPage'
import { UndoToastHost } from './features/tasks/UndoToastHost'

/**
 * App shell: centered mobile-first column, 4 bottom tabs, hash-based routing
 * (static-host friendly — no server rewrites needed).
 */
export function App() {
  return (
    <HashRouter>
      <div id="app-column">
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
  )
}
