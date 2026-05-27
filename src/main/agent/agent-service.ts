/**
 * IPC bridge between the renderer's AI surfaces and the code-shell Engine.
 *
 * - ai:run        renderer → main → start a turn
 * - ai:cancel     renderer → main → abort a turn
 * - ai:permission renderer → main → resolve a pending permission request
 * - ai:event      main → renderer (one-way) → token / tool / propose_edit / etc.
 *
 * Two session shapes:
 *   - chat: one persistent Engine per sessionId, reused across turns
 *   - inline / organize: ephemeral Engine per call, disposed after `done`
 */

import { ipcMain, type BrowserWindow, type WebContents } from 'electron'
import { randomUUID } from 'node:crypto'
import type {
  AiEvent,
  AiPermissionResponse,
  AiRunInput,
  AiTestConnectionResult,
} from '../../shared/ai-types.js'
import type { AppSettings } from '../../shared/types.js'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { app, safeStorage } from 'electron'
import { clearRunContext, setRunContext } from './doc-context.js'
import { buildEngine } from './engine-builder.js'
import { intentPrompt } from './prompts/index.js'
import { readHistory, saveSession, deleteSession, type StoredSession } from './history-store.js'
import { aiLog } from './ai-logger.js'
import { fetchModelList, defaultCacheDir } from '@cjhyy/code-shell-core'
import type { Engine, StreamEvent, ProviderKindName } from '@cjhyy/code-shell-core'
import type { AiListModelsResult } from '../../shared/ai-types.js'
import type { ToolHostHooks } from './tools/index.js'

// ─── Settings/API key helpers (local copies to avoid circular dep) ──

function settingsPath() {
  return path.join(app.getPath('userData'), 'settings.json')
}

function apiKeyPath() {
  return path.join(app.getPath('userData'), 'apiKey.bin')
}

async function readSettingsRaw(): Promise<AppSettings> {
  const raw = await fs.readFile(settingsPath(), 'utf-8').catch(() => '{}')
  return JSON.parse(raw)
}

async function readApiKey(): Promise<string> {
  try {
    const buf = await fs.readFile(apiKeyPath())
    if (safeStorage.isEncryptionAvailable()) {
      try {
        return safeStorage.decryptString(buf)
      } catch {
        return buf.toString('utf-8')
      }
    }
    return buf.toString('utf-8')
  } catch {
    return ''
  }
}

// ─── In-flight run state ────────────────────────────────────────────

interface ActiveRun {
  runId: string
  abort: AbortController
  webContents: WebContents
  /** Panel session id (for session-scoped permission memory). */
  sessionId?: string
  /** Pending permission requests keyed by reqId. */
  pendingPerms: Map<string, { tool: string; resolve: (resp: AiPermissionResponse) => void }>
}

const activeRuns = new Map<string, ActiveRun>()
/**
 * Per-session cached Engine + its toolHost. The Engine is reused across turns
 * so the transcript persists; its custom tools captured `toolHost` by
 * reference at registration time, so we MUTATE the same toolHost object each
 * run (runId / emit / requestPermission) rather than building a new one —
 * otherwise the tools would read a stale runId and getRunContext() would miss.
 */
const chatSessions = new Map<string, { engine: Engine; toolHost: ToolHostHooks }>()
/** "<sessionId>:<tool>" entries the user chose to allow for the whole session. */
const sessionAllowed = new Set<string>()

function emit(wc: WebContents, event: AiEvent) {
  if (!wc.isDestroyed()) wc.send('ai:event', event)
}

// ─── Stream event mapper ────────────────────────────────────────────

function mapStreamEvent(runId: string, e: StreamEvent): AiEvent | null {
  switch (e.type) {
    case 'text_delta':
      return { type: 'token', runId, text: e.text }
    case 'thinking_delta':
      return { type: 'thinking', runId, text: e.text }
    case 'tool_use_start':
      return {
        type: 'tool_call',
        runId,
        name: e.toolCall.toolName,
        args: e.toolCall.args ?? {},
        toolCallId: e.toolCall.id,
      }
    case 'tool_result': {
      const r = e.result
      const text = r.result ?? r.error ?? (r.isError ? 'failed' : 'ok')
      return {
        type: 'tool_result',
        runId,
        name: r.toolName ?? 'unknown',
        ok: !r.isError,
        summary: text.slice(0, 200),
        toolCallId: r.id,
      }
    }
    case 'error':
      return { type: 'error', runId, message: e.error }
    default:
      return null
  }
}

// ─── User-message composer ──────────────────────────────────────────

function composeUserMessage(input: AiRunInput): string {
  return `${intentPrompt(input.intent)}\n\n---\n\n${composeUserBody(input)}`
}

function composeUserBody(input: AiRunInput): string {
  const { intent, message, docContext, inlineAction, organizeTarget } = input
  const sel = docContext.selectionText
  switch (intent) {
    case 'inline-rewrite': {
      const action = inlineAction ?? 'rewrite'
      const ACTION_LABEL: Record<string, string> = {
        rewrite: 'Rewrite this for clarity, keeping meaning intact.',
        shorten: 'Shorten this — keep the key points, drop fluff.',
        expand: 'Expand this with one or two sentences of supporting detail.',
        'fix-grammar': 'Fix grammar, spelling, and punctuation. Do not change meaning or voice.',
        translate: 'Translate this to the language asked in the user message; if unspecified, translate Chinese ↔ English.',
        'change-tone': 'Change the tone as the user requested. Match register.',
        ask: message,
      }
      const directive = ACTION_LABEL[action] ?? message
      return `${directive}\n\n---\nSELECTED TEXT:\n${sel}`
    }
    case 'inline-continue': {
      const before = docContext.content.slice(
        Math.max(0, docContext.selection.from - 800),
        docContext.selection.from,
      )
      return `Continue writing from this cursor position. Context follows; the cursor is at the end.\n\n---\n${before}`
    }
    case 'organize': {
      const target = organizeTarget?.folderPath ?? '.'
      return `${message}\n\nTarget folder: ${target}`
    }
    case 'write-doc':
    case 'auto': {
      const flag = input.outlineApproved
        ? '[outlineApproved=true — 用户已确认大纲，跳过问清楚/列大纲，直接进第3步逐节写入。确认后的大纲见下方。]\n\n'
        : ''
      return flag + message
    }
    case 'chat':
    default:
      return message
  }
}

// ─── Run lifecycle ──────────────────────────────────────────────────

async function startRun(wc: WebContents, input: AiRunInput): Promise<{ runId: string }> {
  const runId = randomUUID()
  setRunContext(runId, input.docContext)

  const settings = await readSettingsRaw()
  const apiKey = await readApiKey()

  aiLog('run.start', {
    runId,
    intent: input.intent,
    sessionId: input.sessionId,
    model: (settings as AppSettings).aiModel,
    baseUrl: (settings as AppSettings).aiBaseUrl,
    hasKey: !!apiKey,
    msgLen: input.message.length,
  })

  if (!apiKey || !apiKey.trim()) {
    emit(wc, {
      type: 'error',
      runId,
      message: 'Missing API key. Open Preferences → AI and set one.',
    })
    emit(wc, { type: 'done', runId, terminalReason: 'config_error', text: '' })
    return { runId }
  }

  const abort = new AbortController()
  const pendingPerms = new Map<string, { tool: string; resolve: (r: AiPermissionResponse) => void }>()
  const permSessionId = input.sessionId
  const active: ActiveRun = {
    runId,
    abort,
    webContents: wc,
    sessionId: permSessionId,
    pendingPerms,
  }
  activeRuns.set(runId, active)

  // The toolHost reads everything live from `active`, so a reused (cached)
  // host can be re-pointed at the current run by mutating host.runId.
  function makeToolHost(): ToolHostHooks {
    const host: ToolHostHooks = {
      runId,
      emit: (ev) => emit(active.webContents, ev),
      requestPermission: (req) => {
        return new Promise<AiPermissionResponse>((resolve, reject) => {
          if (active.abort.signal.aborted) {
            reject(new Error('aborted'))
            return
          }
          if (active.sessionId && sessionAllowed.has(`${active.sessionId}:${req.tool}`)) {
            resolve({ reqId: 'auto', approved: true, scope: 'session' })
            return
          }
          const reqId = randomUUID()
          active.pendingPerms.set(reqId, { tool: req.tool, resolve })
          emit(active.webContents, {
            type: 'permission_request',
            runId: host.runId,
            request: {
              reqId,
              tool: req.tool,
              args: req.args,
              description: req.description,
              riskLevel: req.riskLevel,
            },
          })
          const onAbort = () => {
            active.pendingPerms.delete(reqId)
            reject(new Error('aborted'))
          }
          active.abort.signal.addEventListener('abort', onAbort, { once: true })
        })
      },
    }
    return host
  }

  // Resolve / build the Engine. Chat panel sessions share one persistent
  // Engine per sessionId so multi-turn workflows keep their transcript. The
  // cached toolHost is re-pointed at the current run (mutate runId + closures'
  // live `active` lookup). Inline shots build a fresh Engine each run.
  const panelSession =
    (input.intent === 'auto' || input.intent === 'chat' || input.intent === 'write-doc') &&
    input.sessionId
  let engine: Engine
  let sessionId: string | undefined
  if (panelSession && chatSessions.has(input.sessionId!)) {
    const cached = chatSessions.get(input.sessionId!)!
    engine = cached.engine
    // The Engine's registered tools captured `cached.toolHost` by reference.
    // Re-point that SAME object at this run by copying in a fresh host's
    // fields, so getRunContext(host.runId) resolves the current snapshot.
    const fresh = makeToolHost()
    cached.toolHost.runId = fresh.runId
    cached.toolHost.emit = fresh.emit
    cached.toolHost.requestPermission = fresh.requestPermission
    sessionId = input.sessionId
  } else {
    const toolHost = makeToolHost()
    engine = buildEngine({ settings: settings as AppSettings, apiKey, intent: input.intent, toolHost })
    if (panelSession) {
      chatSessions.set(input.sessionId!, { engine, toolHost })
      sessionId = input.sessionId
    }
  }

  const userMessage = composeUserMessage(input)
  aiLog('run.engine_run', { runId })

  // Fire-and-forget; events stream back via the onStream callback.
  ;(async () => {
    try {
      const result = await engine.run(userMessage, {
        signal: abort.signal,
        sessionId,
        onStream: (ev) => {
          if (ev.type === 'tool_use_start') {
            aiLog('tool.call', { runId, tool: ev.toolCall.toolName })
          } else if (ev.type === 'tool_result') {
            aiLog('tool.result', { runId, tool: ev.result.toolName, isError: ev.result.isError })
          } else if (ev.type === 'error') {
            aiLog('stream.error', { runId, error: ev.error })
          }
          const mapped = mapStreamEvent(runId, ev)
          if (mapped) emit(wc, mapped)
        },
      })
      aiLog('run.done', { runId, reason: result.reason, textLen: result.text.length })
      emit(wc, {
        type: 'done',
        runId,
        terminalReason: result.reason,
        text: result.text,
      })
    } catch (err) {
      const msg = (err as Error).message ?? 'unknown error'
      aiLog('run.error', { runId, error: msg, aborted: abort.signal.aborted })
      if (!abort.signal.aborted) {
        emit(wc, { type: 'error', runId, message: msg })
      }
      emit(wc, {
        type: 'done',
        runId,
        terminalReason: abort.signal.aborted ? 'aborted_streaming' : 'model_error',
        text: '',
      })
    } finally {
      activeRuns.delete(runId)
      clearRunContext(runId)
    }
  })()

  return { runId }
}

async function cancelRun(runId: string): Promise<void> {
  const r = activeRuns.get(runId)
  if (!r) return
  r.abort.abort()
}

function respondPermission(resp: AiPermissionResponse): void {
  for (const run of activeRuns.values()) {
    const entry = run.pendingPerms.get(resp.reqId)
    if (entry) {
      run.pendingPerms.delete(resp.reqId)
      // Remember session-scoped approvals so the same tool won't re-prompt
      // for the rest of this chat session.
      if (resp.approved && resp.scope === 'session' && run.sessionId) {
        sessionAllowed.add(`${run.sessionId}:${entry.tool}`)
      }
      entry.resolve(resp)
      return
    }
  }
}

async function resetChatSession(sessionId: string): Promise<void> {
  chatSessions.delete(sessionId)
  for (const key of sessionAllowed) {
    if (key.startsWith(`${sessionId}:`)) sessionAllowed.delete(key)
  }
}

async function testConnection(): Promise<AiTestConnectionResult> {
  const settings = (await readSettingsRaw()) as AppSettings
  const apiKey = await readApiKey()
  if (!apiKey) return { ok: false, error: 'no api key set' }
  const baseUrl = settings.aiBaseUrl?.replace(/\/$/, '') || 'https://openrouter.ai/api/v1'
  const t0 = Date.now()
  try {
    const res = await fetch(`${baseUrl}/models`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status} ${res.statusText}` }
    }
    return { ok: true, latencyMs: Date.now() - t0 }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

function providerKindFromSettings(s: AppSettings): ProviderKindName {
  if (s.aiProvider === 'openrouter') return 'openrouter'
  if (s.aiProvider === 'openai') return 'openai'
  return 'custom'
}

async function listModels(refresh = false): Promise<AiListModelsResult> {
  const settings = (await readSettingsRaw()) as AppSettings
  const apiKey = await readApiKey()
  const kind = providerKindFromSettings(settings)
  try {
    const result = await fetchModelList(
      {
        key: settings.aiProvider,
        kind,
        baseUrl: settings.aiBaseUrl,
        apiKey: apiKey || undefined,
      },
      { cacheDir: defaultCacheDir(), refresh, timeoutMs: 15000 },
    )
    return {
      models: result.models.map((m) => ({ id: m.id, contextLength: m.contextLength })),
      error: result.error,
      fromCache: result.fromCache,
    }
  } catch (err) {
    return { models: [], error: (err as Error).message }
  }
}

// ─── Public registration ────────────────────────────────────────────

export function registerAgentHandlers(getMainWindow: () => BrowserWindow | null): void {
  ipcMain.handle('ai:run', async (e, input: AiRunInput) => {
    return startRun(e.sender, input)
  })
  ipcMain.handle('ai:cancel', async (_e, runId: string) => {
    await cancelRun(runId)
  })
  ipcMain.handle('ai:permission', async (_e, resp: AiPermissionResponse) => {
    respondPermission(resp)
  })
  ipcMain.handle('ai:resetSession', async (_e, sessionId: string) => {
    await resetChatSession(sessionId)
  })
  ipcMain.handle('ai:testConnection', async () => {
    return testConnection()
  })
  ipcMain.handle('ai:listModels', async (_e, refresh?: boolean) => {
    return listModels(refresh ?? false)
  })
  ipcMain.handle('ai:loadHistory', async () => readHistory())
  ipcMain.handle('ai:saveSession', async (_e, session: StoredSession) => saveSession(session))
  ipcMain.handle('ai:deleteSession', async (_e, sessionId: string) => deleteSession(sessionId))

  // When settings change, dispose cached chat engines so the next run picks up
  // the new provider / model / key. We piggy-back on settings:update via a
  // separate IPC listener — the settings-service handler doesn't know about
  // us. Renderer convention: fire `ai:flush` after a successful settings save.
  ipcMain.handle('ai:flush', async () => {
    chatSessions.clear()
  })

  // Keep the unused getMainWindow signature so callers can wire it later.
  void getMainWindow
}
