import { create } from 'zustand'

export type Theme = 'light' | 'dark' | 'sepia'

interface UiStore {
  theme: Theme
  focusMode: boolean
  typewriterMode: boolean
  findOpen: boolean

  setTheme: (t: Theme) => void
  toggleFocusMode: () => void
  toggleTypewriterMode: () => void
  setFindOpen: (v: boolean) => void
}

export const useUiStore = create<UiStore>((set) => ({
  theme: 'light',
  focusMode: false,
  typewriterMode: false,
  findOpen: false,

  setTheme: (theme) => set({ theme }),
  toggleFocusMode: () => set((s) => ({ focusMode: !s.focusMode })),
  toggleTypewriterMode: () => set((s) => ({ typewriterMode: !s.typewriterMode })),
  setFindOpen: (findOpen) => set({ findOpen }),
}))
