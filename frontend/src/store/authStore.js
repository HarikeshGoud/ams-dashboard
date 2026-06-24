import { create } from 'zustand'

const stored = (() => {
  try { return JSON.parse(localStorage.getItem('ams_user') || 'null') } catch { return null }
})()

export const useAuthStore = create(set => ({
  user: stored,
  token: localStorage.getItem('ams_token') || null,
  setAuth: (user, token) => {
    localStorage.setItem('ams_token', token)
    localStorage.setItem('ams_user', JSON.stringify(user))
    set({ user, token })
  },
  logout: () => {
    localStorage.removeItem('ams_token')
    localStorage.removeItem('ams_user')
    set({ user: null, token: null })
  }
}))
