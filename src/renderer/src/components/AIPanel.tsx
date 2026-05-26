import { useEffect, useRef, useState } from 'react'
import type { AiEvent, DocContext, AiRunInput } from '@shared/ai-types'
import { useAiStore } from '../stores/ai-store'
import { useDocStore } from '../stores/document-store'
import { AIDiffPreview } from './AIDiffPreview'

interface AIPanelProps {
  /** Apply an accepted edit by returning the new markdown source. */
  onApplyEdit: (newContent: string) => void
  /** The currently-open workspace folder, if any. */
  workspaceRoot: string | null
  /** Current selection in the editor (text + source offsets). */
  getSelection: () => { text: string; from: number; to: number }
}

const PRESETS = [
  { label: '总结当前文档', prompt: '请用 5 个要点总结当前打开的文档。先用 get_doc 拿到内容。' },
  { label: '生成大纲', prompt: '根据当前文档主题生成一个三级大纲，输出在面板里，不要直接改文档。' },
  { label: '找出薄弱论点', prompt: '通读当前文档，列出 3 个最薄弱的论点和改进建议。' },
  { label: '检查语法和措辞', prompt: '检查当前文档的语法和措辞问题，给出 5 条最重要的建议。' },
]

export function AIPanel({ onApplyEdit, workspaceRoot, getSelection }: AIPanelProps) {
  const messages = useAiStore((s) => s.messages)
  const sessionId = useAiStore((s) => s.sessionId)
  const runIdInFlight = useAiStore((s) => s.runIdInFlight)
  const pendingEdits = useAiStore((s) => s.pendingEdits)
  const pendingPermissions = useAiStore((s) => s.pendingPermissions)
  const addUserMessage = useAiStore((s) => s.addUserMessage)
  const setRunInFlight = useAiStore((s) => s.setRunInFlight)
  const applyEvent = useAiStore((s) => s.applyEvent)
  const resetSession = useAiStore((s) => s.resetSession)
  const acceptEdit = useAiStore((s) => s.acceptEdit)
  const rejectEdit = useAiStore((s) => s.rejectEdit)

  const [draft, setDraft] = useState('')
  const scrollerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const unsub = window.api.ai.onEvent((e: AiEvent) => applyEvent(e))
    return unsub
  }, [applyEvent])

  useEffect(() => {
    const el = scrollerRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, pendingEdits, pendingPermissions])

  function buildDocContext(): DocContext {
    const s = useDocStore.getState()
    const sel = getSelection()
    return {
      filePath: s.filePath,
      content: s.content,
      selectionText: sel.text,
      selection: { from: sel.from, to: sel.to },
      workspaceRoot,
    }
  }

  async function send(message: string) {
    if (!message.trim() || runIdInFlight) return
    addUserMessage(message)
    setDraft('')
    const input: AiRunInput = {
      intent: 'chat',
      sessionId,
      message,
      docContext: buildDocContext(),
    }
    const { runId } = await window.api.ai.run(input)
    setRunInFlight(runId)
  }

  function cancel() {
    if (runIdInFlight) void window.api.ai.cancel(runIdInFlight)
  }

  function onAcceptEdit(runId: string) {
    const found = acceptEdit(runId)
    if (!found) return
    const doc = useDocStore.getState()
    const next = applyEditToSource(doc.content, found.edit)
    onApplyEdit(next)
  }

  async function respondPerm(reqId: string, approved: boolean) {
    await window.api.ai.respondPermission({ reqId, approved })
    useAiStore.setState((s) => ({
      pendingPermissions: s.pendingPermissions.filter((p) => p.reqId !== reqId),
    }))
  }

  return (
    <div className="flex flex-col h-full bg-[var(--bg)] border-l border-[var(--border)]">
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border)]">
        <div className="text-sm font-medium">AI 助手</div>
        <div className="flex items-center gap-2">
          <button
            className="text-xs text-[var(--muted)] hover:text-[var(--fg)]"
            onClick={resetSession}
            title="新对话"
          >
            ↺ 新对话
          </button>
        </div>
      </div>
      <div ref={scrollerRef} className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && pendingPermissions.length === 0 && pendingEdits.length === 0 && (
          <div className="text-sm text-[var(--muted)] space-y-2">
            <p>问点什么，或选个快捷预设：</p>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  className="text-xs px-2 py-1 rounded border border-[var(--border)] hover:bg-[var(--bg-soft)]"
                  onClick={() => void send(p.prompt)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={
              m.role === 'user'
                ? 'text-sm bg-[var(--bg-soft)] rounded-md px-3 py-2'
                : 'text-sm'
            }
          >
            {m.text && <div className="whitespace-pre-wrap">{m.text}</div>}
            {m.toolCalls?.map((tc) => (
              <div key={tc.id} className="mt-1 text-xs text-[var(--muted)] font-mono">
                {tc.ok === undefined ? '⋯' : tc.ok ? '✓' : '✗'} {tc.name}
                {tc.result && <span className="ml-2 opacity-60">{tc.result.slice(0, 80)}</span>}
              </div>
            ))}
          </div>
        ))}
        {pendingEdits.map((p) => (
          <AIDiffPreview
            key={p.runId}
            edit={p.edit}
            onAccept={() => onAcceptEdit(p.runId)}
            onReject={() => rejectEdit(p.runId)}
          />
        ))}
        {pendingPermissions.map((p) => (
          <div
            key={p.reqId}
            className="text-sm border border-[var(--border)] rounded-md p-2"
          >
            <div className="font-medium">需要授权</div>
            <div className="text-xs text-[var(--muted)] my-1">{p.description}</div>
            <div className="flex gap-2 mt-2">
              <button
                className="text-xs px-2 py-1 rounded border border-[var(--border)] hover:bg-[var(--bg-soft)]"
                onClick={() => void respondPerm(p.reqId, true)}
              >
                允许
              </button>
              <button
                className="text-xs px-2 py-1 rounded border border-[var(--border)] hover:bg-[var(--bg-soft)]"
                onClick={() => void respondPerm(p.reqId, false)}
              >
                拒绝
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="p-2 border-t border-[var(--border)]">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              void send(draft)
            }
          }}
          placeholder="问点什么… (⌘↩ 发送)"
          rows={3}
          className="w-full resize-none rounded-md border border-[var(--border)] bg-[var(--bg)] p-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
        />
        <div className="flex justify-end gap-2 mt-1">
          {runIdInFlight ? (
            <button
              onClick={cancel}
              className="text-xs px-3 py-1 rounded border border-[var(--border)] hover:bg-[var(--bg-soft)]"
            >
              取消
            </button>
          ) : (
            <button
              onClick={() => void send(draft)}
              disabled={!draft.trim()}
              className="text-xs px-3 py-1 rounded bg-[var(--accent)] text-white disabled:opacity-50"
            >
              发送 ⌘↩
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export function applyEditToSource(content: string, edit: { kind: string; text: string; range?: { from: number; to: number } }): string {
  switch (edit.kind) {
    case 'replace_doc':
      return edit.text
    case 'replace_range':
      if (!edit.range) return content
      return content.slice(0, edit.range.from) + edit.text + content.slice(edit.range.to)
    case 'replace_selection':
    case 'insert_at_cursor': {
      // For panel-driven edits we don't reliably know the selection at insert
      // time. The renderer that triggers an inline action passes its own
      // range via the bubble's local state; panel-driven edits fall back to
      // appending. Treat both kinds the same here.
      const r = edit.range
      if (r) return content.slice(0, r.from) + edit.text + content.slice(r.to)
      return content + (content.endsWith('\n') ? '' : '\n') + edit.text
    }
    default:
      return content
  }
}
