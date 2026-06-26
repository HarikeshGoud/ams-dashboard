import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useThemeStore = create(persist(
  (set) => ({
    theme: 'dark',
    toggle: () => set(s => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),
  }),
  { name: 'ams-theme' }
))
