/**
 * File-system primitives for AI tools. Path-sandboxed and atomic-write-safe.
 *
 * Kept separate from file-service.ts because that module is tied to IPC
 * handlers and the renderer's DirEntry shape; here we want plain async
 * functions usable from inside tool closures.
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'

export type Sandboxed = { ok: true; path: string } | { ok: false; error: string }

/**
 * Resolve `userPath` (absolute or relative) against `root` and reject if the
 * result escapes the root. The check uses `path.relative` so symlinks inside
 * the root are honored (matches Typora behavior — workspaces commonly include
 * symlinked subfolders).
 */
export function resolveSandboxed(root: string, userPath: string): Sandboxed {
  if (!userPath) return { ok: false, error: 'empty path' }
  const abs = path.isAbsolute(userPath) ? userPath : path.resolve(root, userPath)
  const rel = path.relative(root, abs)
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    return { ok: false, error: `path escapes sandbox root (${root})` }
  }
  return { ok: true, path: abs }
}

export async function readMarkdownFile(filePath: string): Promise<string> {
  if (!/\.(md|markdown)$/i.test(filePath)) {
    return `Error: only .md/.markdown files are readable via this tool (got ${path.basename(filePath)}).`
  }
  try {
    const content = await fs.readFile(filePath, 'utf-8')
    return content
  } catch (err) {
    return `Error: ${(err as Error).message}`
  }
}

export async function atomicWrite(filePath: string, content: string): Promise<void> {
  const dir = path.dirname(filePath)
  await fs.mkdir(dir, { recursive: true })
  const tmp = path.join(dir, `.${path.basename(filePath)}.${process.pid}.tmp`)
  await fs.writeFile(tmp, content, 'utf-8')
  await fs.rename(tmp, filePath)
}

export async function moveFile(from: string, to: string): Promise<void> {
  await fs.mkdir(path.dirname(to), { recursive: true })
  await fs.rename(from, to)
}

export interface MdEntry {
  filePath: string
  fileName: string
}

export async function listMarkdownInFolder(folder: string, depth = 2): Promise<MdEntry[]> {
  const out: MdEntry[] = []
  async function walk(dir: string, level: number) {
    if (level > depth) return
    let entries
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      if (entry.name === 'node_modules' || entry.name === 'assets') continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) await walk(full, level + 1)
      else if (/\.(md|markdown)$/i.test(entry.name)) {
        out.push({ filePath: full, fileName: entry.name })
      }
    }
  }
  await walk(folder, 0)
  return out.sort((a, b) => a.fileName.localeCompare(b.fileName))
}
