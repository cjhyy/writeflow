import { app, ipcMain, safeStorage } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { AppSettings } from '../shared/types.js'

const DEFAULTS: AppSettings = {
  theme: 'light',
  autoSave: true,
  autoSaveDelayMs: 1500,
  editorFontSize: 17,
  editorLineHeight: 1.5,
  editorFontFamily: 'system',
  focusModeDefault: false,
  typewriterDefault: false,
  aiProvider: 'openrouter',
  aiBaseUrl: 'https://openrouter.ai/api/v1',
  aiModel: 'anthropic/claude-sonnet-4',
  aiPanelWidth: 360,
}

function settingsPath() {
  return path.join(app.getPath('userData'), 'settings.json')
}

function apiKeyPath() {
  return path.join(app.getPath('userData'), 'apiKey.bin')
}

async function readSettings(): Promise<AppSettings> {
  try {
    const raw = await fs.readFile(settingsPath(), 'utf-8')
    const parsed = JSON.parse(raw)
    return { ...DEFAULTS, ...parsed }
  } catch {
    return { ...DEFAULTS }
  }
}

async function writeSettings(settings: AppSettings) {
  await fs.mkdir(path.dirname(settingsPath()), { recursive: true })
  await fs.writeFile(settingsPath(), JSON.stringify(settings, null, 2), 'utf-8')
}

/**
 * API key handling: stored separately from settings.json in apiKeyPath().
 *
 * If the OS supports `safeStorage` encryption (macOS Keychain / Windows DPAPI
 * / linux secret-service), the buffer on disk is encrypted ciphertext. If
 * encryption is unavailable, fall back to plain UTF-8 so the feature still
 * works — desktop tool, single user, defense in depth is the goal, not a
 * hard guarantee.
 */
async function readApiKey(): Promise<string> {
  try {
    const buf = await fs.readFile(apiKeyPath())
    if (safeStorage.isEncryptionAvailable()) {
      try {
        return safeStorage.decryptString(buf)
      } catch {
        // file may have been written as plaintext before encryption was
        // available — try interpreting as utf8
        return buf.toString('utf-8')
      }
    }
    return buf.toString('utf-8')
  } catch {
    return ''
  }
}

async function writeApiKey(key: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await fs.mkdir(path.dirname(apiKeyPath()), { recursive: true })
    const data = safeStorage.isEncryptionAvailable()
      ? safeStorage.encryptString(key)
      : Buffer.from(key, 'utf-8')
    await fs.writeFile(apiKeyPath(), data)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

export function registerSettingsHandlers() {
  ipcMain.handle('settings:get', readSettings)
  ipcMain.handle('settings:update', async (_e, patch: Partial<AppSettings>) => {
    const current = await readSettings()
    const next = { ...current, ...patch }
    await writeSettings(next)
    return next
  })
  ipcMain.handle('settings:getApiKey', readApiKey)
  ipcMain.handle('settings:setApiKey', async (_e, key: string) => writeApiKey(key))
}
