import { create } from 'zustand'
import type { DocumentState } from '@shared/types'

interface DocumentStore extends DocumentState {
  setContent: (content: string) => void
  markSaved: (filePath: string, fileName: string, content: string) => void
  reset: (next: DocumentState) => void
}

const emptyDoc: DocumentState = {
  filePath: null,
  fileName: 'Untitled.md',
  content: '',
  savedContent: '',
  dirty: false,
  lastSavedAt: null,
  isHtmlPreview: false,
}

export const useDocStore = create<DocumentStore>((set) => ({
  ...emptyDoc,
  setContent: (content) =>
    set((s) => ({
      content,
      dirty: content !== s.savedContent,
    })),
  markSaved: (filePath, fileName, content) =>
    set({
      filePath,
      fileName,
      content,
      savedContent: content,
      dirty: false,
      lastSavedAt: new Date().toISOString(),
    }),
  reset: (next) => set(next),
}))
