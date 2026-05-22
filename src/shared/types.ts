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

export interface DirEntry {
  filePath: string
  fileName: string
}

export interface SaveImageResult {
  ok: boolean
  mdPath?: string
  error?: string
}

export interface ExportPdfResult {
  ok: boolean
  filePath?: string
  error?: string
}

export type ThemeName = 'light' | 'dark' | 'sepia'

export interface DesktopApi {
  file: {
    newFile: () => Promise<DocumentState>
    openFile: () => Promise<OpenResult>
    openFileByPath: (filePath: string) => Promise<OpenResult>
    saveFile: (input: { filePath: string | null; content: string }) => Promise<SaveResult>
    saveFileAs: (input: { content: string; suggestedName?: string }) => Promise<SaveResult>
    readRecentFiles: () => Promise<RecentFile[]>
    clearRecentFiles: () => Promise<void>
    listDir: (filePath: string) => Promise<DirEntry[]>
    openFolder: () => Promise<{ ok: boolean; folder?: string; entries?: DirEntry[] }>
    listFolder: (folder: string) => Promise<DirEntry[]>
    saveImage: (input: { docPath: string | null; bytes: ArrayBuffer; ext: string }) => Promise<SaveImageResult>
    exportPdf: (input: { suggestedName?: string }) => Promise<ExportPdfResult>
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
    menuExportPdf: (cb: () => void) => () => void
    menuFind: (cb: () => void) => () => void
    menuToggleFileTree: (cb: () => void) => () => void
    menuToggleOutline: (cb: () => void) => () => void
    menuToggleFocusMode: (cb: () => void) => () => void
    menuToggleTypewriter: (cb: () => void) => () => void
    menuTheme: (cb: (t: ThemeName) => void) => () => void
  }
}

declare global {
  interface Window {
    api: DesktopApi
  }
}
