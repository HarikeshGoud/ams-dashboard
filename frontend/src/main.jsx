import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import '@fontsource/poppins/400.css'
import '@fontsource/poppins/500.css'
import '@fontsource/poppins/600.css'
import '@fontsource/poppins/700.css'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
)

// PWA install is intentionally TECHNICIAN-ONLY. Browsers only offer to "install"
// a site once a service worker is registered, so we register it just for a
// technician session (also re-registered when the technician dashboard mounts —
// see EmployeeLayout) and actively remove it for admin/deskwork. Result: only
// technician devices can install the app; everyone else stays a plain website.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    let role = null
    try { role = JSON.parse(localStorage.getItem('ams_user') || 'null')?.role } catch {}
    if (role === 'technician') {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    } else if (role === 'admin' || role === 'deskwork') {
      navigator.serviceWorker.getRegistrations()
        .then(regs => regs.forEach(r => r.unregister()))
        .catch(() => {})
    }
    // role null (logged out / login screen): leave any existing registration
    // untouched so an already-installed technician app isn't disturbed.
  })
}
