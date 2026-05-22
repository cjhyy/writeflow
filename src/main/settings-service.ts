import { app, ipcMain } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { AppSettings } from '../shared/types.js'

const DEFAULTS: AppSettings = {
  theme: 'system',
  autoSave: true,
  autoSaveDelayMs: 1500,
  editorFontSize: 16,
  editorLineHeight: 1.7,
}

function settingsPath() {
  return path.join(app.getPath('userData'), 'settings.json')
}

async function read(): Promise<AppSettings> {
  try {
    const raw = await fs.readFile(settingsPath(), 'utf-8')
    const parsed = JSON.parse(raw)
    return { ...DEFAULTS, ...parsed }
  } catch {
    return { ...DEFAULTS }
  }
}

async function write(settings: AppSettings) {
  await fs.mkdir(path.dirname(settingsPath()), { recursive: true })
  await fs.writeFile(settingsPath(), JSON.stringify(settings, null, 2), 'utf-8')
}

export function registerSettingsHandlers() {
  ipcMain.handle('settings:get', read)
  ipcMain.handle('settings:update', async (_e, patch: Partial<AppSettings>) => {
    const current = await read()
    const next = { ...current, ...patch }
    await write(next)
    return next
  })
}
