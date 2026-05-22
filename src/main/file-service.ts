import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { DirEntry, OpenResult, RecentFile, SaveResult } from '../shared/types.js'

const RECENT_LIMIT = 20

function recentFilesPath() {
  return path.join(app.getPath('userData'), 'recent.json')
}

async function readRecentFiles(): Promise<RecentFile[]> {
  try {
    const raw = await fs.readFile(recentFilesPath(), 'utf-8')
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
  } catch {
    return []
  }
}

async function pushRecentFile(filePath: string) {
  const fileName = path.basename(filePath)
  const list = await readRecentFiles()
  const next = [
    { filePath, fileName, lastOpenedAt: new Date().toISOString() },
    ...list.filter((r) => r.filePath !== filePath),
  ].slice(0, RECENT_LIMIT)
  await fs.mkdir(path.dirname(recentFilesPath()), { recursive: true })
  await fs.writeFile(recentFilesPath(), JSON.stringify(next, null, 2), 'utf-8')
}

async function clearRecent() {
  try {
    await fs.unlink(recentFilesPath())
  } catch {
    /* ignore */
  }
}

function isHtmlExt(filePath: string) {
  const ext = path.extname(filePath).toLowerCase()
  return ext === '.html' || ext === '.htm'
}

async function atomicWrite(filePath: string, content: string) {
  const dir = path.dirname(filePath)
  const tmp = path.join(dir, `.${path.basename(filePath)}.${process.pid}.tmp`)
  await fs.writeFile(tmp, content, 'utf-8')
  await fs.rename(tmp, filePath)
}

async function loadFile(filePath: string): Promise<OpenResult> {
  try {
    const content = await fs.readFile(filePath, 'utf-8')
    await pushRecentFile(filePath)
    return {
      ok: true,
      filePath,
      fileName: path.basename(filePath),
      content,
      isHtmlPreview: isHtmlExt(filePath),
    }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

export function registerFileHandlers() {
  ipcMain.handle('file:open', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) return { ok: false, cancelled: true } satisfies OpenResult
    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: [
        { name: 'Markdown', extensions: ['md', 'markdown'] },
        { name: 'HTML', extensions: ['html', 'htm'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    })
    if (result.canceled || result.filePaths.length === 0) {
      return { ok: false, cancelled: true } satisfies OpenResult
    }
    return loadFile(result.filePaths[0])
  })

  ipcMain.handle('file:openByPath', async (_e, filePath: string) => {
    return loadFile(filePath)
  })

  ipcMain.handle(
    'file:save',
    async (_e, { filePath, content }: { filePath: string | null; content: string }): Promise<SaveResult> => {
      if (!filePath) {
        return { ok: false, error: 'No file path' }
      }
      try {
        await atomicWrite(filePath, content)
        await pushRecentFile(filePath)
        return { ok: true, filePath, fileName: path.basename(filePath) }
      } catch (err) {
        return { ok: false, error: (err as Error).message }
      }
    },
  )

  ipcMain.handle(
    'file:saveAs',
    async (e, { content, suggestedName }: { content: string; suggestedName?: string }): Promise<SaveResult> => {
      const win = BrowserWindow.fromWebContents(e.sender)
      if (!win) return { ok: false, error: 'No window' }
      const result = await dialog.showSaveDialog(win, {
        defaultPath: suggestedName ?? 'untitled.md',
        filters: [{ name: 'Markdown', extensions: ['md'] }],
      })
      if (result.canceled || !result.filePath) {
        return { ok: false, error: 'cancelled' }
      }
      try {
        await atomicWrite(result.filePath, content)
        await pushRecentFile(result.filePath)
        return {
          ok: true,
          filePath: result.filePath,
          fileName: path.basename(result.filePath),
        }
      } catch (err) {
        return { ok: false, error: (err as Error).message }
      }
    },
  )

  ipcMain.handle('file:recent', readRecentFiles)
  ipcMain.handle('file:clearRecent', clearRecent)

  ipcMain.handle('file:listDir', async (_e, filePath: string): Promise<DirEntry[]> => {
    try {
      const dir = path.dirname(filePath)
      const names = await fs.readdir(dir)
      return names
        .filter((n) => /\.(md|markdown)$/i.test(n))
        .filter((n) => !n.startsWith('.'))
        .sort((a, b) => a.localeCompare(b))
        .map((name) => ({ filePath: path.join(dir, name), fileName: name }))
    } catch {
      return []
    }
  })

  /**
   * Save a pasted/dropped image next to the current document under ./assets/.
   * Returns the relative path to insert into the markdown.
   *
   * If the document has no path yet (Untitled), we use app userData/scratch/ as
   * a fallback and return an absolute file:// URL.
   */
  ipcMain.handle(
    'file:saveImage',
    async (
      _e,
      { docPath, bytes, ext }: { docPath: string | null; bytes: ArrayBuffer; ext: string },
    ): Promise<{ ok: boolean; mdPath?: string; error?: string }> => {
      try {
        const safeExt = ext.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'png'
        const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
        const fileName = `image-${stamp}.${safeExt}`
        let assetsDir: string
        let mdPath: string
        if (docPath) {
          assetsDir = path.join(path.dirname(docPath), 'assets')
          mdPath = `./assets/${fileName}`
        } else {
          assetsDir = path.join(app.getPath('userData'), 'scratch', 'assets')
          mdPath = `file://${path.join(assetsDir, fileName)}`
        }
        await fs.mkdir(assetsDir, { recursive: true })
        await fs.writeFile(path.join(assetsDir, fileName), Buffer.from(bytes))
        return { ok: true, mdPath }
      } catch (err) {
        return { ok: false, error: (err as Error).message }
      }
    },
  )
}
