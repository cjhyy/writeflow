import { contextBridge, ipcRenderer } from 'electron'
import type {
  AppSettings,
  DesktopApi,
  DirEntry,
  ExportPdfResult,
  OpenResult,
  RecentFile,
  SaveImageResult,
  SaveResult,
  ThemeName,
} from '../shared/types.js'

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
    listFolder: (f) => ipcRenderer.invoke('file:listFolder', f) as Promise<DirEntry[]>,
    saveImage: (input) => ipcRenderer.invoke('file:saveImage', input) as Promise<SaveImageResult>,
    exportPdf: (input) => ipcRenderer.invoke('file:exportPdf', input) as Promise<ExportPdfResult>,
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get') as Promise<AppSettings>,
    update: (patch) => ipcRenderer.invoke('settings:update', patch) as Promise<AppSettings>,
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
  },
}

contextBridge.exposeInMainWorld('api', api)
