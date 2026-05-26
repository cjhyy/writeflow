import { useEffect, useRef, useState } from 'react'
import type { AiEvent, DocContext, AiRunInput, AiIntent, AiOutlineSection } from '@shared/ai-types'
import { useAiStore } from '../stores/ai-store'
import { useDocStore } from '../stores/document-store'
import { AIDiffPreview } from './AIDiffPreview'

interface AIPanelProps {
  /** Apply an accepted edit by returning the new markdown source. */
  onApplyEdit: (newContent: string) => void
  /** Append text to the live document (called for doc_append events). */
  onAppendToDoc: (text: string) => void
  /** Replace the section under a heading. */
  onReplaceSection: (heading: string, newContent: string) => void
  /** The currently-open workspace folder, if any. */
  workspaceRoot: string | null
  /** Current selection in the editor. */
  getSelection: () => { text: string; from: number; to: number }
}

const CHAT_PRESETS = [
  { label: '总结当前文档', prompt: '先用 get_doc 拿到当前文档内容，然后用 5 个要点总结。' },
  { label: '检查语法和措辞', prompt: '检查当前文档的语法和措辞问题，给出 5 条最重要的建议。' },
  { label: '找出薄弱论点', prompt: '通读当前文档，列出 3 个最薄弱的论点和改进建议。' },
]

const WRITE_PRESETS = [
  '帮我写一篇关于「React 19 新特性」的入门博客，给前端工程师看，约 2000 字',
  '起草一份产品需求 PRD，主题：',
  '写一个本周工作总结，重点：',
]

export function AIPanel({ onApplyEdit, onAppendToDoc, onReplaceSection, workspaceRoot, getSelection }: AIPanelProps) {
  const messages = useAiStore((s) => s.messages)
  const sessionId = useAiStore((s) => s.sessionId)
  const runIdInFlight = useAiStore((s) => s.runIdInFlight)
  const activeIntent = useAiStore((s) => s.activeIntent)
  const setActiveIntent = useAiStore((s) => s.setActiveIntent)
  const pendingEdits = useAiStore((s) => s.pendingEdits)
  const pendingOutline = useAiStore((s) => s.pendingOutline)
  const pendingPermissions = useAiStore((s) => s.pendingPermissions)
  const addUserMessage = useAiStore((s) => s.addUserMessage)
  const setRunInFlight = useAiStore((s) => s.setRunInFlight)
  const applyEvent = useAiStore((s) => s.applyEvent)
  const clearPendingOutline = useAiStore((s) => s.clearPendingOutline)
  const resetSession = useAiStore((s) => s.resetSession)
  const acceptEdit = useAiStore((s) => s.acceptEdit)
  const rejectEdit = useAiStore((s) => s.rejectEdit)

  const [draft, setDraft] = useState('')
  const scrollerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const unsub = window.api.ai.onEvent((e: AiEvent) => {
      applyEvent(e)
      // Side effect: doc_append / doc_replace_section mutate the live doc.
      if (e.type === 'doc_append') onAppendToDoc(e.text)
      if (e.type === 'doc_replace_section') onReplaceSection(e.heading, e.newContent)
    })
    return unsub
  }, [applyEvent, onAppendToDoc, onReplaceSection])

  useEffect(() => {
    const el = scrollerRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, pendingEdits, pendingPermissions, pendingOutline])

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

  async function send(message: string, overrides?: Partial<AiRunInput>) {
    if (!message.trim() || runIdInFlight) return
    addUserMessage(message)
    setDraft('')
    const input: AiRunInput = {
      intent: activeIntent as AiIntent,
      sessionId,
      message,
      docContext: buildDocContext(),
      ...overrides,
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

  async function approveOutline(outline: { title: string; sections: AiOutlineSection[] }) {
    clearPendingOutline()
    const lines = [
      `# ${outline.title}`,
      '',
      ...outline.sections.flatMap((s) => [`## ${s.heading}`, s.hint, '']),
    ]
    const message = `已采纳大纲，现在开始草稿。\n\n采纳的大纲：\n\n${lines.join('\n')}`
    await send(message, { intent: 'write-doc', outlineApproved: true })
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

      {/* Intent switcher */}
      <div className="flex gap-1 px-3 py-2 border-b border-[var(--border)]">
        <IntentBtn current={activeIntent} value="chat" onClick={setActiveIntent}>
          💬 聊一聊
        </IntentBtn>
        <IntentBtn current={activeIntent} value="write-doc" onClick={setActiveIntent}>
          ✍️ 写一篇
        </IntentBtn>
      </div>

      <div ref={scrollerRef} className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && !pendingOutline && pendingPermissions.length === 0 && pendingEdits.length === 0 && (
          <div className="text-sm text-[var(--muted)] space-y-2">
            {activeIntent === 'chat' ? (
              <>
                <p>问点什么，或选个快捷预设：</p>
                <div className="flex flex-wrap gap-2">
                  {CHAT_PRESETS.map((p) => (
                    <button
                      key={p.label}
                      className="text-xs px-2 py-1 rounded border border-[var(--border)] hover:bg-[var(--bg-soft)]"
                      onClick={() => void send(p.prompt)}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <p>告诉我要写什么，AI 会先列大纲，你点"开始写"后才往文档里填内容。</p>
                <p className="opacity-70">示例：</p>
                <div className="flex flex-col gap-1">
                  {WRITE_PRESETS.map((p) => (
                    <button
                      key={p}
                      className="text-xs text-left px-2 py-1 rounded border border-[var(--border)] hover:bg-[var(--bg-soft)]"
                      onClick={() => setDraft(p)}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </>
            )}
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

        {pendingOutline && (
          <OutlineCard
            outline={pendingOutline}
            onApprove={(o) => void approveOutline(o)}
            onCancel={clearPendingOutline}
          />
        )}

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
          placeholder={
            activeIntent === 'write-doc'
              ? '要写什么？（主题、读者、长度…AI 会先问需要补的信息）'
              : '问点什么… (⌘↩ 发送)'
          }
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
              {activeIntent === 'write-doc' ? '开始 ⌘↩' : '发送 ⌘↩'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function IntentBtn({
  current,
  value,
  onClick,
  children,
}: {
  current: string
  value: 'chat' | 'write-doc'
  onClick: (v: 'chat' | 'write-doc') => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={() => onClick(value)}
      className={`text-xs px-2 py-1 rounded ${
        current === value
          ? 'bg-[var(--accent)] text-white'
          : 'border border-[var(--border)] hover:bg-[var(--bg-soft)]'
      }`}
    >
      {children}
    </button>
  )
}

function OutlineCard({
  outline,
  onApprove,
  onCancel,
}: {
  outline: { title: string; sections: AiOutlineSection[] }
  onApprove: (o: { title: string; sections: AiOutlineSection[] }) => void
  onCancel: () => void
}) {
  const [title, setTitle] = useState(outline.title)
  const [sections, setSections] = useState<AiOutlineSection[]>(outline.sections)

  useEffect(() => {
    setTitle(outline.title)
    setSections(outline.sections)
  }, [outline])

  function setHeading(i: number, v: string) {
    setSections((arr) => arr.map((s, idx) => (idx === i ? { ...s, heading: v } : s)))
  }
  function setHint(i: number, v: string) {
    setSections((arr) => arr.map((s, idx) => (idx === i ? { ...s, hint: v } : s)))
  }
  function removeSection(i: number) {
    setSections((arr) => arr.filter((_, idx) => idx !== i))
  }
  function addSection() {
    setSections((arr) => [...arr, { heading: '新章节', hint: '' }])
  }

  return (
    <div className="border border-[var(--accent)] rounded-md overflow-hidden">
      <div className="px-2 py-1 text-xs bg-[var(--accent)]/10 text-[var(--accent)]">
        AI 建议的大纲（点开始写后会逐节填入文档）
      </div>
      <div className="p-2 space-y-2 max-h-80 overflow-y-auto">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full text-base font-medium bg-transparent border-b border-[var(--border)] py-1 focus:outline-none focus:border-[var(--accent)]"
          placeholder="文档标题"
        />
        {sections.map((s, i) => (
          <div key={i} className="space-y-1">
            <div className="flex items-center gap-1">
              <span className="text-xs text-[var(--muted)] w-4">{i + 1}.</span>
              <input
                value={s.heading}
                onChange={(e) => setHeading(i, e.target.value)}
                className="flex-1 text-sm bg-transparent border-b border-[var(--border)] py-0.5 focus:outline-none focus:border-[var(--accent)]"
                placeholder="章节标题"
              />
              <button
                onClick={() => removeSection(i)}
                className="text-xs text-[var(--muted)] hover:text-red-500 px-1"
                title="删除"
              >
                ✕
              </button>
            </div>
            <input
              value={s.hint}
              onChange={(e) => setHint(i, e.target.value)}
              className="w-full text-xs text-[var(--muted)] bg-transparent ml-5 py-0.5 focus:outline-none focus:text-[var(--fg)]"
              placeholder="一句话说明这节写什么"
            />
          </div>
        ))}
        <button
          onClick={addSection}
          className="text-xs text-[var(--muted)] hover:text-[var(--fg)] px-1"
        >
          + 加一节
        </button>
      </div>
      <div className="flex justify-end gap-2 p-2 border-t border-[var(--border)]">
        <button
          onClick={onCancel}
          className="text-xs px-3 py-1 rounded border border-[var(--border)] hover:bg-[var(--bg-soft)]"
        >
          取消
        </button>
        <button
          onClick={() => onApprove({ title, sections })}
          disabled={sections.length === 0}
          className="text-xs px-3 py-1 rounded bg-[var(--accent)] text-white disabled:opacity-50"
        >
          开始写 →
        </button>
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
      const r = edit.range
      if (r) return content.slice(0, r.from) + edit.text + content.slice(r.to)
      return content + (content.endsWith('\n') ? '' : '\n') + edit.text
    }
    default:
      return content
  }
}
