import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { registerFileHandlers } from './file-service.js'
import { registerSettingsHandlers } from './settings-service.js'
import { buildMenu } from './menu.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

let mainWindow: BrowserWindow | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 600,
    minHeight: 400,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    show: false,
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
    // Auto-open DevTools in dev so console errors are visible without ⌥⌘I
    mainWindow.webContents.openDevTools({ mode: 'right' })
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(() => {
  registerFileHandlers()
  registerSettingsHandlers()

  ipcMain.handle('dialog:confirm-discard', async (_e, fileName: string) => {
    if (!mainWindow) return 'cancel'
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      buttons: ['Save', 'Discard', 'Cancel'],
      defaultId: 0,
      cancelId: 2,
      message: `${fileName} has unsaved changes.`,
      detail: 'Save before continuing?',
    })
    return ['save', 'discard', 'cancel'][response]
  })

  ipcMain.handle(
    'file:exportPdf',
    async (e, { suggestedName }: { suggestedName?: string }): Promise<{ ok: boolean; filePath?: string; error?: string }> => {
      const win = BrowserWindow.fromWebContents(e.sender)
      if (!win) return { ok: false, error: 'no window' }
      const save = await dialog.showSaveDialog(win, {
        defaultPath: (suggestedName ?? 'document').replace(/\.md$/, '') + '.pdf',
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      })
      if (save.canceled || !save.filePath) return { ok: false, error: 'cancelled' }
      try {
        const pdfData = await win.webContents.printToPDF({
          printBackground: true,
          pageSize: 'A4',
          margins: { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 },
        })
        const fs = await import('node:fs/promises')
        await fs.writeFile(save.filePath, pdfData)
        return { ok: true, filePath: save.filePath }
      } catch (err) {
        return { ok: false, error: (err as Error).message }
      }
    },
  )

  createWindow()
  buildMenu(() => mainWindow)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
