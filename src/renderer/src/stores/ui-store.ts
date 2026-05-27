import { create } from 'zustand'

export type Theme = 'light' | 'dark' | 'sepia'

interface UiStore {
  theme: Theme
  focusMode: boolean
  typewriterMode: boolean
  findOpen: boolean
  /** Bumped whenever a file is written/created so the sidebar re-lists. */
  fileTreeVersion: number

  setTheme: (t: Theme) => void
  toggleFocusMode: () => void
  toggleTypewriterMode: () => void
  setFindOpen: (v: boolean) => void
  bumpFileTree: () => void
}

export const useUiStore = create<UiStore>((set) => ({
  theme: 'light',
  focusMode: false,
  typewriterMode: false,
  findOpen: false,
  fileTreeVersion: 0,

  setTheme: (theme) => set({ theme }),
  toggleFocusMode: () => set((s) => ({ focusMode: !s.focusMode })),
  toggleTypewriterMode: () => set((s) => ({ typewriterMode: !s.typewriterMode })),
  setFindOpen: (findOpen) => set({ findOpen }),
  bumpFileTree: () => set((s) => ({ fileTreeVersion: s.fileTreeVersion + 1 })),
}))
