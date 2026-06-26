import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="layout-root">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="layout-main">
        <Header onMenuClick={() => setSidebarOpen(o => !o)} />
        <main className="layout-content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
