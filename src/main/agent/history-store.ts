/**
 * Persisted chat history for the AI panel.
 *
 * The UI message list is saved to userData/ai-history.json so closing the app
 * doesn't lose the conversation. The SDK Engine's transcript persists
 * separately under sessionStorageDir keyed by the same sessionId, so resuming
 * a session (rebuilding the Engine with that id) restores the agent's actual
 * memory — this file only restores what the user sees.
 */

import { app } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'

export interface StoredSession {
  sessionId: string
  title: string
  updatedAt: string
  /** Opaque UI message blobs — shape owned by the renderer's ai-store. */
  messages: unknown[]
}

const MAX_SESSIONS = 30

function historyPath() {
  return path.join(app.getPath('userData'), 'ai-history.json')
}

export async function readHistory(): Promise<StoredSession[]> {
  try {
    const raw = await fs.readFile(historyPath(), 'utf-8')
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export async function saveSession(session: StoredSession): Promise<void> {
  const list = await readHistory()
  const next = [
    session,
    ...list.filter((s) => s.sessionId !== session.sessionId),
  ].slice(0, MAX_SESSIONS)
  await fs.mkdir(path.dirname(historyPath()), { recursive: true })
  await fs.writeFile(historyPath(), JSON.stringify(next, null, 2), 'utf-8')
}

export async function deleteSession(sessionId: string): Promise<void> {
  const list = await readHistory()
  const next = list.filter((s) => s.sessionId !== sessionId)
  await fs.writeFile(historyPath(), JSON.stringify(next, null, 2), 'utf-8')
}
