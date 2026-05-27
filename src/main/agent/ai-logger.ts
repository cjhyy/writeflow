/**
 * Append-only AI activity log at userData/logs/ai.log.
 *
 * Captures the agent run lifecycle (request / tool calls / stream errors /
 * done) so a stuck or failed turn can be diagnosed after the fact without a
 * live DevTools session. Best-effort: logging never throws into the run path.
 */

import { app } from 'electron'
import { createWriteStream, mkdirSync, type WriteStream } from 'node:fs'
import path from 'node:path'

let stream: WriteStream | null = null

function ensureStream(): WriteStream | null {
  if (stream) return stream
  try {
    const dir = path.join(app.getPath('userData'), 'logs')
    mkdirSync(dir, { recursive: true })
    stream = createWriteStream(path.join(dir, 'ai.log'), { flags: 'a' })
  } catch {
    stream = null
  }
  return stream
}

export function aiLogPath(): string {
  return path.join(app.getPath('userData'), 'logs', 'ai.log')
}

export function aiLog(event: string, data?: Record<string, unknown>): void {
  try {
    const s = ensureStream()
    if (!s) return
    const line = JSON.stringify({ t: new Date().toISOString(), event, ...data })
    s.write(line + '\n')
  } catch {
    /* never throw from logging */
  }
}
