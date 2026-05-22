import { contextBridge, ipcRenderer } from 'electron'
import type { AppSettings, DesktopApi, OpenResult, RecentFile, SaveResult } from '../shared/types.js'

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
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get') as Promise<AppSettings>,
    update: (patch) => ipcRenderer.invoke('settings:update', patch) as Promise<AppSettings>,
  },
  on: {
    menuNew: (cb) => {
      const handler = () => cb()
      ipcRenderer.on('menu:new', handler)
      return () => ipcRenderer.removeListener('menu:new', handler)
    },
    menuOpen: (cb) => {
      const handler = () => cb()
      ipcRenderer.on('menu:open', handler)
      return () => ipcRenderer.removeListener('menu:open', handler)
    },
    menuSave: (cb) => {
      const handler = () => cb()
      ipcRenderer.on('menu:save', handler)
      return () => ipcRenderer.removeListener('menu:save', handler)
    },
    menuSaveAs: (cb) => {
      const handler = () => cb()
      ipcRenderer.on('menu:saveAs', handler)
      return () => ipcRenderer.removeListener('menu:saveAs', handler)
    },
  },
}

contextBridge.exposeInMainWorld('api', api)
