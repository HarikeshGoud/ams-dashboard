import { create } from 'zustand'

// Shared PWA-install state so BOTH the pop-up card (InstallPrompt) and the
// persistent header icon (InstallButton) react to the same browser event.
export const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true

export const isIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

export const usePwaStore = create((set, get) => ({
  deferred: null,          // the stashed beforeinstallprompt event
  canInstall: false,       // true once the browser says the app is installable
  installed: isStandalone(),
  ios: isIOS(),

  // Fire the native install prompt. Returns 'accepted' | 'dismissed' | 'unavailable'.
  promptInstall: async () => {
    const d = get().deferred
    if (!d) return 'unavailable'
    d.prompt()
    let outcome = 'dismissed'
    try { outcome = (await d.userChoice)?.outcome || 'dismissed' } catch {}
    // The event is single-use; clear it (the browser re-fires it on the next load
    // if the app is still installable, so the prompt returns after a refresh).
    set({ deferred: null, canInstall: false })
    return outcome
  },
}))

// Attach the global listeners exactly once, as early as possible (called from main.jsx).
let inited = false
export function initPwa() {
  if (inited || typeof window === 'undefined') return
  inited = true
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()                                   // suppress the default mini-infobar; we show our own UI
    usePwaStore.setState({ deferred: e, canInstall: true })
  })
  window.addEventListener('appinstalled', () => {
    usePwaStore.setState({ deferred: null, canInstall: false, installed: true })
  })
}
