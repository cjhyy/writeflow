/**
 * Shared types crossing the IPC boundary for the AI assistant.
 *
 * Renderer drives one IPC call per user action (window.api.ai.run); main
 * streams events back via webContents.send('ai:event', e). Both sides
 * import this file so the wire format stays in sync.
 */

export type AiIntent =
  | 'inline-rewrite'
  | 'inline-continue'
  | 'chat'
  | 'write-doc'
  | 'organize'

export interface SelectionRange {
  /** Character offset in the markdown source (inclusive). */
  from: number
  /** Character offset in the markdown source (exclusive). */
  to: number
}

/**
 * Snapshot of the current editor state the user is acting on.
 *
 * For chat panel sessions the renderer refreshes this on every turn so the
 * agent always sees the live doc, not a stale snapshot from session start.
 */
export interface DocContext {
  /** Absolute path of the open file, or null for an unsaved buffer. */
  filePath: string | null
  /** Full markdown source. */
  content: string
  /** Currently selected text (empty if no selection). */
  selectionText: string
  /** Selection range in source offsets. Both = cursor offset when no selection. */
  selection: SelectionRange
  /** Workspace folder if one is open (sets sandbox root). */
  workspaceRoot: string | null
}

export type AiInlineAction =
  | 'rewrite'
  | 'shorten'
  | 'expand'
  | 'fix-grammar'
  | 'translate'
  | 'change-tone'
  | 'ask'

export interface AiRunInput {
  intent: AiIntent
  /** Stable id for chat sessions; ignored / generated for inline turns. */
  sessionId?: string
  /** Conversational message or action label. */
  message: string
  /** Optional inline-action discriminator (for 'inline-rewrite'). */
  inlineAction?: AiInlineAction
  /** Optional target args for 'organize' (a folder path). */
  organizeTarget?: { folderPath: string }
  /**
   * For `write-doc`: true when the user has already approved an outline in
   * this thread, so the agent should skip the outline step and stream into
   * the doc directly. The agent's prompt also receives this signal.
   */
  outlineApproved?: boolean
  /** Live doc snapshot. */
  docContext: DocContext
}

export interface AiRunHandle {
  runId: string
}

export type AiProposedEditKind =
  | 'replace_selection'
  | 'insert_at_cursor'
  | 'replace_range'
  | 'replace_doc'

export interface AiProposedEdit {
  kind: AiProposedEditKind
  text: string
  /** Required for kind === 'replace_range'. */
  range?: SelectionRange
}

export interface AiPermissionRequest {
  reqId: string
  tool: string
  args: Record<string, unknown>
  description: string
  riskLevel: 'low' | 'medium' | 'high'
}

export interface AiOutlineSection {
  heading: string
  hint: string
}

export type AiEvent =
  | { type: 'token'; runId: string; text: string }
  | { type: 'thinking'; runId: string; text: string }
  | { type: 'tool_call'; runId: string; name: string; args: Record<string, unknown>; toolCallId: string }
  | { type: 'tool_result'; runId: string; name: string; ok: boolean; summary: string; toolCallId: string }
  | { type: 'propose_edit'; runId: string; edit: AiProposedEdit }
  | { type: 'propose_outline'; runId: string; title: string; sections: AiOutlineSection[] }
  | { type: 'doc_append'; runId: string; text: string }
  | { type: 'doc_replace_section'; runId: string; heading: string; newContent: string }
  | { type: 'permission_request'; runId: string; request: AiPermissionRequest }
  | { type: 'done'; runId: string; terminalReason: string; text: string }
  | { type: 'error'; runId: string; message: string }

export interface AiPermissionResponse {
  reqId: string
  approved: boolean
  scope?: 'once' | 'session'
}

/**
 * Provider connection test result. Used by the Preferences AI tab.
 */
export interface AiTestConnectionResult {
  ok: boolean
  /** Provider-reported error or our parsed reason. */
  error?: string
  /** Round-trip latency in ms when ok. */
  latencyMs?: number
}

export interface AiServiceApi {
  run: (input: AiRunInput) => Promise<AiRunHandle>
  cancel: (runId: string) => Promise<void>
  respondPermission: (response: AiPermissionResponse) => Promise<void>
  resetSession: (sessionId: string) => Promise<void>
  testConnection: () => Promise<AiTestConnectionResult>
  onEvent: (cb: (e: AiEvent) => void) => () => void
}
