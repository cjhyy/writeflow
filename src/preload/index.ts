import { contextBridge, ipcRenderer } from 'electron'
import type {
  AppSettings,
  DesktopApi,
  DirEntry,
  ExportPdfResult,
  FormatAction,
  OpenResult,
  RecentFile,
  SaveImageResult,
  SaveResult,
  ThemeName,
} from '../shared/types.js'
import type {
  AiEvent,
  AiPermissionResponse,
  AiRunHandle,
  AiRunInput,
  AiTestConnectionResult,
} from '../shared/ai-types.js'

function onChannel(channel: string, cb: () => void) {
  const handler = () => cb()
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const api: DesktopApi = {
  file: {
    newFile: async () => ({
      filePath: null,
      fileName: 'Untitled.md',
      content: '',
      savedContent: '',
      dirty: false,
      lastSavedAt: null,
      isHtmlPreview: false,
    }),
    openFile: () => ipcRenderer.invoke('file:open') as Promise<OpenResult>,
    openFileByPath: (p) => ipcRenderer.invoke('file:openByPath', p) as Promise<OpenResult>,
    saveFile: (input) => ipcRenderer.invoke('file:save', input) as Promise<SaveResult>,
    saveFileAs: (input) => ipcRenderer.invoke('file:saveAs', input) as Promise<SaveResult>,
    readRecentFiles: () => ipcRenderer.invoke('file:recent') as Promise<RecentFile[]>,
    clearRecentFiles: () => ipcRenderer.invoke('file:clearRecent') as Promise<void>,
    listDir: (p) => ipcRenderer.invoke('file:listDir', p) as Promise<DirEntry[]>,
    openFolder: () => ipcRenderer.invoke('file:openFolder') as Promise<{ ok: boolean; folder?: string; entries?: DirEntry[] }>,
    takePendingOpen: () => ipcRenderer.invoke('app:takePendingOpen') as Promise<string | null>,
    listFolder: (f) => ipcRenderer.invoke('file:listFolder', f) as Promise<DirEntry[]>,
    saveImage: (input) => ipcRenderer.invoke('file:saveImage', input) as Promise<SaveImageResult>,
    exportPdf: (input) => ipcRenderer.invoke('file:exportPdf', input) as Promise<ExportPdfResult>,
    exportHtml: (input) => ipcRenderer.invoke('file:exportHtml', input) as Promise<ExportPdfResult>,
    revealInFinder: (p) => ipcRenderer.invoke('shell:revealInFinder', p) as Promise<{ ok: boolean; error?: string }>,
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get') as Promise<AppSettings>,
    update: (patch) => ipcRenderer.invoke('settings:update', patch) as Promise<AppSettings>,
    getApiKey: () => ipcRenderer.invoke('settings:getApiKey') as Promise<string>,
    setApiKey: (key) => ipcRenderer.invoke('settings:setApiKey', key) as Promise<{ ok: boolean; error?: string }>,
  },
  ai: {
    run: (input: AiRunInput) =>
      ipcRenderer.invoke('ai:run', input) as Promise<AiRunHandle>,
    cancel: (runId: string) => ipcRenderer.invoke('ai:cancel', runId) as Promise<void>,
    respondPermission: (resp: AiPermissionResponse) =>
      ipcRenderer.invoke('ai:permission', resp) as Promise<void>,
    resetSession: (sessionId: string) =>
      ipcRenderer.invoke('ai:resetSession', sessionId) as Promise<void>,
    testConnection: () =>
      ipcRenderer.invoke('ai:testConnection') as Promise<AiTestConnectionResult>,
    flush: () => ipcRenderer.invoke('ai:flush') as Promise<void>,
    onEvent: (cb: (e: AiEvent) => void) => {
      const handler = (_: unknown, e: AiEvent) => cb(e)
      ipcRenderer.on('ai:event', handler)
      return () => ipcRenderer.removeListener('ai:event', handler)
    },
  },
  on: {
    menuNew: (cb) => onChannel('menu:new', cb),
    menuOpen: (cb) => onChannel('menu:open', cb),
    menuSave: (cb) => onChannel('menu:save', cb),
    menuSaveAs: (cb) => onChannel('menu:saveAs', cb),
    menuExportPdf: (cb) => onChannel('menu:exportPdf', cb),
    menuFind: (cb) => onChannel('menu:find', cb),
    menuToggleFileTree: (cb) => onChannel('menu:toggleFileTree', cb),
    menuToggleOutline: (cb) => onChannel('menu:toggleOutline', cb),
    menuToggleFocusMode: (cb) => onChannel('menu:toggleFocusMode', cb),
    menuToggleTypewriter: (cb) => onChannel('menu:toggleTypewriter', cb),
    menuTheme: (cb) => {
      const handler = (theme: ThemeName) => () => cb(theme)
      const hLight = handler('light')
      const hDark = handler('dark')
      const hSepia = handler('sepia')
      ipcRenderer.on('menu:themeLight', hLight)
      ipcRenderer.on('menu:themeDark', hDark)
      ipcRenderer.on('menu:themeSepia', hSepia)
      return () => {
        ipcRenderer.removeListener('menu:themeLight', hLight)
        ipcRenderer.removeListener('menu:themeDark', hDark)
        ipcRenderer.removeListener('menu:themeSepia', hSepia)
      }
    },
    menuPreferences: (cb) => onChannel('menu:preferences', cb),
    menuOpenFolder: (cb) => onChannel('menu:openFolder', cb),
    menuRevealInFinder: (cb) => onChannel('menu:revealInFinder', cb),
    menuExportHtml: (cb) => onChannel('menu:exportHtml', cb),
    menuReplace: (cb) => onChannel('menu:replace', cb),
    appOpenFromOS: (cb) => {
      const handler = (_: unknown, p: string) => cb(p)
      ipcRenderer.on('app:openFromOS', handler)
      return () => ipcRenderer.removeListener('app:openFromOS', handler)
    },
    menuFormat: (cb) => {
      const map: Record<string, FormatAction> = {
        'menu:fmtH1': 'h1', 'menu:fmtH2': 'h2', 'menu:fmtH3': 'h3', 'menu:fmtH4': 'h4',
        'menu:fmtParagraph': 'paragraph', 'menu:fmtBlockquote': 'blockquote',
        'menu:fmtOL': 'ol', 'menu:fmtUL': 'ul', 'menu:fmtTask': 'task',
        'menu:fmtCodeBlock': 'codeBlock', 'menu:fmtTable': 'table', 'menu:fmtHr': 'hr',
        'menu:fmtBold': 'bold', 'menu:fmtItalic': 'italic', 'menu:fmtStrike': 'strike',
        'menu:fmtInlineCode': 'inlineCode', 'menu:fmtLink': 'link', 'menu:fmtImage': 'image',
        'menu:fmtClear': 'clear',
      }
      const handlers: Array<[string, () => void]> = []
      for (const [channel, action] of Object.entries(map)) {
        const h = () => cb(action)
        ipcRenderer.on(channel, h)
        handlers.push([channel, h])
      }
      return () => {
        for (const [channel, h] of handlers) ipcRenderer.removeListener(channel, h)
      }
    },
  },
}

contextBridge.exposeInMainWorld('api', api)
