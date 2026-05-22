export interface DocumentState {
  filePath: string | null
  fileName: string
  content: string
  savedContent: string
  dirty: boolean
  lastSavedAt: string | null
  isHtmlPreview: boolean
}

export interface RecentFile {
  filePath: string
  fileName: string
  lastOpenedAt: string
}

export interface AppSettings {
  theme: 'light' | 'dark' | 'system'
  autoSave: boolean
  autoSaveDelayMs: number
  editorFontSize: number
  editorLineHeight: number
}

export interface SaveResult {
  ok: boolean
  filePath?: string
  fileName?: string
  error?: string
}

export interface OpenResult {
  ok: boolean
  filePath?: string
  fileName?: string
  content?: string
  isHtmlPreview?: boolean
  error?: string
  cancelled?: boolean
}

export interface DesktopApi {
  file: {
    newFile: () => Promise<DocumentState>
    openFile: () => Promise<OpenResult>
    openFileByPath: (filePath: string) => Promise<OpenResult>
    saveFile: (input: { filePath: string | null; content: string }) => Promise<SaveResult>
    saveFileAs: (input: { content: string; suggestedName?: string }) => Promise<SaveResult>
    readRecentFiles: () => Promise<RecentFile[]>
    clearRecentFiles: () => Promise<void>
  }
  settings: {
    get: () => Promise<AppSettings>
    update: (patch: Partial<AppSettings>) => Promise<AppSettings>
  }
  on: {
    menuNew: (cb: () => void) => () => void
    menuOpen: (cb: () => void) => () => void
    menuSave: (cb: () => void) => () => void
    menuSaveAs: (cb: () => void) => () => void
  }
}

declare global {
  interface Window {
    api: DesktopApi
  }
}
