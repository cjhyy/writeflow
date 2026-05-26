/**
 * Renderer-side state for the AI assistant.
 *
 * Holds:
 *   - the chat session's message list and current streaming buffer
 *   - the currently in-flight runId (so cancel works)
 *   - pending propose_edit and permission_request events the UI must render
 *   - the panel-open flag
 *
 * Inline actions (selection bubble, Cmd+J continue) do NOT touch this store —
 * they use local component state. Only the side-panel chat lives here.
 */

import { create } from 'zustand'
import type {
  AiEvent,
  AiIntent,
  AiOutlineSection,
  AiPermissionRequest,
  AiProposedEdit,
} from '@shared/ai-types'

export type ChatMessageRole = 'user' | 'assistant' | 'tool'

export interface ChatMessage {
  id: string
  role: ChatMessageRole
  text: string
  /** Tool calls grouped under the assistant message that emitted them. */
  toolCalls?: Array<{ id: string; name: string; args: Record<string, unknown>; result?: string; ok?: boolean }>
}

export interface PendingEdit {
  runId: string
  edit: AiProposedEdit
  createdAt: number
}

export interface PendingOutline {
  runId: string
  title: string
  sections: AiOutlineSection[]
}

interface AiStore {
  panelOpen: boolean
  sessionId: string
  messages: ChatMessage[]
  currentAssistantId: string | null
  runIdInFlight: string | null
  /** Which intent the user's next message will fire as. */
  activeIntent: Exclude<AiIntent, 'inline-rewrite' | 'inline-continue' | 'organize'>
  pendingEdits: PendingEdit[]
  pendingOutline: PendingOutline | null
  pendingPermissions: Array<AiPermissionRequest & { runId: string }>

  togglePanel: () => void
  setPanelOpen: (open: boolean) => void
  setActiveIntent: (intent: AiStore['activeIntent']) => void
  resetSession: () => void
  addUserMessage: (text: string) => string
  addSystemNote: (text: string) => void
  setRunInFlight: (runId: string | null) => void
  applyEvent: (event: AiEvent) => void
  acceptEdit: (runId: string) => PendingEdit | null
  rejectEdit: (runId: string) => void
  clearPendingOutline: () => void
}

function newSessionId() {
  return `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export const useAiStore = create<AiStore>((set, get) => ({
  panelOpen: false,
  sessionId: newSessionId(),
  messages: [],
  currentAssistantId: null,
  runIdInFlight: null,
  activeIntent: 'chat',
  pendingEdits: [],
  pendingOutline: null,
  pendingPermissions: [],

  togglePanel: () => set((s) => ({ panelOpen: !s.panelOpen })),
  setPanelOpen: (open) => set({ panelOpen: open }),
  setActiveIntent: (intent) => set({ activeIntent: intent }),

  resetSession: () => {
    const old = get().sessionId
    window.api.ai.resetSession(old).catch(() => undefined)
    set({
      sessionId: newSessionId(),
      messages: [],
      currentAssistantId: null,
      runIdInFlight: null,
      activeIntent: 'chat',
      pendingEdits: [],
      pendingOutline: null,
      pendingPermissions: [],
    })
  },

  addUserMessage: (text) => {
    const id = `u-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    set((s) => ({ messages: [...s.messages, { id, role: 'user', text }] }))
    return id
  },

  addSystemNote: (text) => {
    const id = `s-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    set((s) => ({ messages: [...s.messages, { id, role: 'assistant', text }] }))
  },

  setRunInFlight: (runId) => set({ runIdInFlight: runId }),

  clearPendingOutline: () => set({ pendingOutline: null }),

  applyEvent: (event) => {
    set((s) => {
      switch (event.type) {
        case 'token': {
          let assistantId = s.currentAssistantId
          let messages = s.messages
          if (!assistantId) {
            assistantId = `a-${event.runId}`
            messages = [...messages, { id: assistantId, role: 'assistant', text: '', toolCalls: [] }]
          }
          messages = messages.map((m) =>
            m.id === assistantId ? { ...m, text: m.text + event.text } : m,
          )
          return { messages, currentAssistantId: assistantId }
        }
        case 'tool_call': {
          let assistantId = s.currentAssistantId
          let messages = s.messages
          if (!assistantId) {
            assistantId = `a-${event.runId}`
            messages = [...messages, { id: assistantId, role: 'assistant', text: '', toolCalls: [] }]
          }
          messages = messages.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  toolCalls: [
                    ...(m.toolCalls ?? []),
                    { id: event.toolCallId, name: event.name, args: event.args },
                  ],
                }
              : m,
          )
          return { messages, currentAssistantId: assistantId }
        }
        case 'tool_result': {
          const messages = s.messages.map((m) => {
            if (m.role !== 'assistant' || !m.toolCalls) return m
            return {
              ...m,
              toolCalls: m.toolCalls.map((tc) =>
                tc.id === event.toolCallId ? { ...tc, result: event.summary, ok: event.ok } : tc,
              ),
            }
          })
          return { messages }
        }
        case 'propose_edit': {
          return {
            pendingEdits: [
              ...s.pendingEdits.filter((p) => p.runId !== event.runId),
              { runId: event.runId, edit: event.edit, createdAt: Date.now() },
            ],
          }
        }
        case 'propose_outline': {
          return {
            pendingOutline: {
              runId: event.runId,
              title: event.title,
              sections: event.sections,
            },
          }
        }
        case 'doc_append':
        case 'doc_replace_section': {
          // Handled by App.tsx (it has the doc store + remount key). Nothing
          // to do in the AI store itself.
          return {}
        }
        case 'permission_request': {
          return {
            pendingPermissions: [
              ...s.pendingPermissions,
              { ...event.request, runId: event.runId },
            ],
          }
        }
        case 'error': {
          const id = `e-${event.runId}-${Math.random().toString(36).slice(2, 6)}`
          return {
            messages: [
              ...s.messages,
              { id, role: 'assistant', text: `⚠️ ${event.message}` },
            ],
          }
        }
        case 'done': {
          return {
            runIdInFlight: s.runIdInFlight === event.runId ? null : s.runIdInFlight,
            currentAssistantId: null,
          }
        }
        case 'thinking':
        default:
          return {}
      }
    })
  },

  acceptEdit: (runId) => {
    const found = get().pendingEdits.find((p) => p.runId === runId) ?? null
    set((s) => ({ pendingEdits: s.pendingEdits.filter((p) => p.runId !== runId) }))
    return found
  },

  rejectEdit: (runId) =>
    set((s) => ({ pendingEdits: s.pendingEdits.filter((p) => p.runId !== runId) })),
}))
