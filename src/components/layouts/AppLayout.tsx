import { Outlet } from 'react-router-dom'

import { Header } from './Header'
import { Sidebar } from './Sidebar'

export function AppLayout() {
  return (
    // No fixed/viewport height and no overflow-hidden here: the document
    // itself (html/body) is the only scroll container. Sidebar and header
    // stay in view via their own `sticky` positioning (see Sidebar.tsx /
    // Header.tsx) rather than by clipping this shell to h-svh and scrolling
    // an inner <main> — that pattern was what produced a second,
    // dashboard-internal scrollbar alongside the browser's own.
    <div className="bg-background flex min-h-screen w-full">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        <main className="flex-1 p-4">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
