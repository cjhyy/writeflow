import { useEffect, useRef, useState } from 'react'
import type { AiEvent, DocContext, AiRunInput, AiOutlineSection, AiStoredSession, AiTaskInfo } from '@shared/ai-types'
import { useAiStore, type ChatMessage } from '../stores/ai-store'
import { useDocStore } from '../stores/document-store'
import { useUiStore } from '../stores/ui-store'
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

const PRESETS = [
  '帮我写一篇关于「React 19 新特性」的入门博客，给前端工程师看，约 2000 字',
  '总结当前文档的要点',
  '检查当前文档的语法和措辞',
  '帮我起草一份产品 PRD，主题：',
]

export function AIPanel({ onApplyEdit, onAppendToDoc, onReplaceSection, workspaceRoot, getSelection }: AIPanelProps) {
  const messages = useAiStore((s) => s.messages)
  const sessionId = useAiStore((s) => s.sessionId)
  const runIdInFlight = useAiStore((s) => s.runIdInFlight)
  const tasks = useAiStore((s) => s.tasks)
  const pendingEdits = useAiStore((s) => s.pendingEdits)
  const pendingOutline = useAiStore((s) => s.pendingOutline)
  const pendingPermissions = useAiStore((s) => s.pendingPermissions)
  const addUserMessage = useAiStore((s) => s.addUserMessage)
  const setRunInFlight = useAiStore((s) => s.setRunInFlight)
  const applyEvent = useAiStore((s) => s.applyEvent)
  const clearPendingOutline = useAiStore((s) => s.clearPendingOutline)
  const resetSession = useAiStore((s) => s.resetSession)
  const restoreSession = useAiStore((s) => s.restoreSession)
  const acceptEdit = useAiStore((s) => s.acceptEdit)
  const rejectEdit = useAiStore((s) => s.rejectEdit)

  const [draft, setDraft] = useState('')
  const [historyOpen, setHistoryOpen] = useState(false)
  const [history, setHistory] = useState<AiStoredSession[]>([])
  // Files the user attached (drag from sidebar, or @mention). Sent to the AI
  // as paths it can read_file; rendered as removable chips above the input.
  const [attachments, setAttachments] = useState<Array<{ filePath: string; fileName: string }>>([])
  const [dragOver, setDragOver] = useState(false)
  // @mention picker
  const [mentionOpen, setMentionOpen] = useState(false)
  const [mentionFiles, setMentionFiles] = useState<Array<{ filePath: string; fileName: string }>>([])
  const [mentionQuery, setMentionQuery] = useState('')
  const scrollerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  function addAttachment(file: { filePath: string; fileName: string }) {
    setAttachments((prev) =>
      prev.some((a) => a.filePath === file.filePath) ? prev : [...prev, file],
    )
  }
  function removeAttachment(filePath: string) {
    setAttachments((prev) => prev.filter((a) => a.filePath !== filePath))
  }

  // Restore the most recent saved session on first mount (so closing/reopening
  // the app keeps the last conversation).
  useEffect(() => {
    let cancelled = false
    window.api.ai.loadHistory().then((list) => {
      if (cancelled) return
      setHistory(list)
      const cur = useAiStore.getState()
      if (cur.messages.length === 0 && list[0]) {
        restoreSession(list[0].sessionId, list[0].messages as ChatMessage[])
      }
    })
    return () => {
      cancelled = true
    }
  }, [restoreSession])

  async function openHistory() {
    const list = await window.api.ai.loadHistory()
    setHistory(list)
    setHistoryOpen((v) => !v)
  }

  useEffect(() => {
    const unsub = window.api.ai.onEvent((e: AiEvent) => {
      applyEvent(e)
      // Side effect: doc_append / doc_replace_section mutate the live doc.
      if (e.type === 'doc_append') onAppendToDoc(e.text)
      if (e.type === 'doc_replace_section') onReplaceSection(e.heading, e.newContent)
      // A successful write/move changes the workspace → refresh the sidebar.
      if (
        e.type === 'tool_result' &&
        e.ok &&
        (e.name === 'write_file' || e.name === 'move_file')
      ) {
        useUiStore.getState().bumpFileTree()
      }
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
    const atts = attachments
    // What the user sees in the transcript: their text + @file chips.
    const displayMsg =
      atts.length > 0
        ? `${message}\n\n${atts.map((a) => `@${a.fileName}`).join(' ')}`
        : message
    // What the agent receives: explicit paths + an instruction to read them.
    const agentMsg =
      atts.length > 0
        ? `${message}\n\n[引用的文件，请用 read_file 读取后再回答]\n${atts
            .map((a) => `- ${a.filePath}`)
            .join('\n')}`
        : message
    addUserMessage(displayMsg)
    setDraft('')
    setAttachments([])
    const input: AiRunInput = {
      intent: 'auto',
      sessionId,
      message: agentMsg,
      docContext: buildDocContext(),
      ...overrides,
    }
    const { runId } = await window.api.ai.run(input)
    setRunInFlight(runId)
  }

  function cancel() {
    if (runIdInFlight) void window.api.ai.cancel(runIdInFlight)
  }

  // Load candidate files for the @mention picker (workspace folder if open,
  // else siblings of the active doc).
  async function loadMentionFiles(): Promise<Array<{ filePath: string; fileName: string }>> {
    const doc = useDocStore.getState()
    if (workspaceRoot) return window.api.file.listFolder(workspaceRoot)
    if (doc.filePath) return window.api.file.listDir(doc.filePath)
    return []
  }

  // Detect a trailing "@query" the user is typing and toggle the picker.
  function onDraftChange(value: string) {
    setDraft(value)
    const m = value.match(/(^|\s)@([^\s@]*)$/)
    if (m) {
      const q = m[2]
      setMentionQuery(q)
      if (!mentionOpen) {
        setMentionOpen(true)
        void loadMentionFiles().then(setMentionFiles)
      }
    } else if (mentionOpen) {
      setMentionOpen(false)
    }
  }

  // Replace the trailing "@query" with nothing and attach the chosen file.
  function pickMention(file: { filePath: string; fileName: string }) {
    addAttachment(file)
    setDraft((d) => d.replace(/(^|\s)@([^\s@]*)$/, '$1'))
    setMentionOpen(false)
    textareaRef.current?.focus()
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const raw = e.dataTransfer.getData('application/x-writeflow-file')
    if (raw) {
      try {
        const f = JSON.parse(raw) as { filePath: string; fileName: string }
        addAttachment(f)
      } catch {
        /* ignore malformed */
      }
    }
  }

  const filteredMentions = mentionFiles
    .filter((f) => f.fileName.toLowerCase().includes(mentionQuery.toLowerCase()))
    .slice(0, 8)

  function onAcceptEdit(runId: string) {
    const found = acceptEdit(runId)
    if (!found) return
    const doc = useDocStore.getState()
    const next = applyEditToSource(doc.content, found.edit)
    onApplyEdit(next)
  }

  async function respondPerm(reqId: string, approved: boolean, scope?: 'once' | 'session') {
    await window.api.ai.respondPermission({ reqId, approved, scope })
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
    await send(message, { outlineApproved: true })
  }

  return (
    <div className="flex flex-col h-full bg-[var(--bg)] border-l border-[var(--border)]">
      <div className="relative flex items-center justify-between px-3 py-2 border-b border-[var(--border)] gap-2">
        <ModelPicker />
        <div className="flex items-center gap-2 shrink-0">
          <StatusDot busy={!!runIdInFlight} tasks={tasks} />
          <button
            className="text-xs text-[var(--muted)] hover:text-[var(--fg)]"
            onClick={openHistory}
            title="历史对话"
          >
            🕘 历史
          </button>
          <button
            className="text-xs text-[var(--muted)] hover:text-[var(--fg)]"
            onClick={() => {
              resetSession()
              setHistoryOpen(false)
            }}
            title="新对话"
          >
            ↺ 新对话
          </button>
        </div>
        {historyOpen && (
          <div className="absolute right-2 top-full z-20 mt-1 w-64 max-h-80 overflow-y-auto rounded-md border border-[var(--border)] bg-[var(--bg)] shadow-md">
            {history.length === 0 && (
              <div className="p-3 text-xs text-[var(--muted)]">还没有历史对话</div>
            )}
            {history.map((h) => (
              <div
                key={h.sessionId}
                className="flex items-center gap-1 px-2 py-1.5 hover:bg-[var(--bg-soft)] cursor-pointer group"
                onClick={() => {
                  restoreSession(h.sessionId, h.messages as ChatMessage[])
                  setHistoryOpen(false)
                }}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-xs truncate">{h.title || '对话'}</div>
                  <div className="text-[10px] text-[var(--muted)]">
                    {new Date(h.updatedAt).toLocaleString()}
                  </div>
                </div>
                <button
                  className="text-xs text-[var(--muted)] hover:text-red-500 opacity-0 group-hover:opacity-100 px-1"
                  onClick={(e) => {
                    e.stopPropagation()
                    void window.api.ai.deleteSession(h.sessionId)
                    setHistory((list) => list.filter((x) => x.sessionId !== h.sessionId))
                  }}
                  title="删除"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div ref={scrollerRef} className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && !pendingOutline && pendingPermissions.length === 0 && pendingEdits.length === 0 && (
          <div className="text-sm text-[var(--muted)] space-y-2">
            <p>直接说你想干什么 —— 改写、总结、提问、或写一整篇文档都行。写整篇时我会先列大纲让你确认。</p>
            <div className="flex flex-col gap-1">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  className="text-xs text-left px-2 py-1 rounded border border-[var(--border)] hover:bg-[var(--bg-soft)]"
                  onClick={() => setDraft(p)}
                >
                  {p}
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
            <div className="flex flex-wrap gap-2 mt-2">
              <button
                className="text-xs px-2 py-1 rounded bg-[var(--accent)] text-white"
                onClick={() => void respondPerm(p.reqId, true, 'once')}
              >
                允许一次
              </button>
              <button
                className="text-xs px-2 py-1 rounded border border-[var(--border)] hover:bg-[var(--bg-soft)]"
                onClick={() => void respondPerm(p.reqId, true, 'session')}
              >
                本次对话都允许
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
      <div
        className={`relative p-2 border-t border-[var(--border)] ${
          dragOver ? 'bg-[var(--accent)]/10' : ''
        }`}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes('application/x-writeflow-file')) {
            e.preventDefault()
            setDragOver(true)
          }
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        {/* @mention picker */}
        {mentionOpen && filteredMentions.length > 0 && (
          <div className="absolute bottom-full left-2 right-2 mb-1 max-h-48 overflow-y-auto rounded-md border border-[var(--border)] bg-[var(--bg)] shadow-md z-20">
            {filteredMentions.map((f) => (
              <button
                key={f.filePath}
                className="block w-full text-left text-xs px-2 py-1.5 hover:bg-[var(--bg-soft)] truncate"
                onClick={() => pickMention(f)}
                title={f.filePath}
              >
                📄 {f.fileName}
              </button>
            ))}
          </div>
        )}

        {/* Attachment chips */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-1">
            {attachments.map((a) => (
              <span
                key={a.filePath}
                className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-[var(--bg-soft)] border border-[var(--border)]"
                title={a.filePath}
              >
                📄 {a.fileName}
                <button
                  className="text-[var(--muted)] hover:text-red-500"
                  onClick={() => removeAttachment(a.filePath)}
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}

        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={(e) => {
            if (mentionOpen && (e.key === 'Escape')) {
              setMentionOpen(false)
              return
            }
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              void send(draft)
            }
          }}
          placeholder="说点什么…拖文件进来或打 @ 引用 (⌘↩ 发送)"
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

function StatusDot({ busy, tasks }: { busy: boolean; tasks: AiTaskInfo[] }) {
  const [hover, setHover] = useState(false)

  // Tooltip text: the in-progress task's activeForm, else a count summary,
  // else idle.
  const active = tasks.find((t) => t.status === 'in_progress')
  const done = tasks.filter((t) => t.status === 'completed').length
  const tip = busy
    ? active?.activeForm ?? active?.subject ?? '正在处理…'
    : tasks.length > 0
      ? `已完成 ${done}/${tasks.length} 项`
      : '空闲'

  return (
    <div
      className="relative flex items-center"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <span
        className={`inline-block w-2.5 h-2.5 rounded-full ${
          busy ? 'bg-green-500 animate-pulse' : tasks.length > 0 ? 'bg-[var(--muted)]' : 'bg-[var(--border)]'
        }`}
        title={tip}
      />
      {hover && (tasks.length > 0 || busy) && (
        <div className="absolute right-0 top-full mt-1 z-30 w-56 max-h-72 overflow-y-auto rounded-md border border-[var(--border)] bg-[var(--bg)] shadow-md p-2 text-xs">
          {busy && <div className="text-green-600 mb-1">● {tip}</div>}
          {tasks.length === 0 ? (
            <div className="text-[var(--muted)]">{tip}</div>
          ) : (
            <ul className="space-y-0.5">
              {tasks.map((t) => (
                <li key={t.id} className="flex items-start gap-1">
                  <span className="shrink-0">
                    {t.status === 'completed' ? '✓' : t.status === 'in_progress' ? '⏳' : '○'}
                  </span>
                  <span className={t.status === 'completed' ? 'line-through opacity-60' : ''}>
                    {t.subject}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function ModelPicker() {
  const [model, setModel] = useState<string>('')
  const [models, setModels] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [manual, setManual] = useState(false)
  const [manualValue, setManualValue] = useState('')

  useEffect(() => {
    let cancelled = false
    window.api.settings.get().then((s) => {
      if (!cancelled) setModel(s.aiModel)
    })
    setLoading(true)
    window.api.ai.listModels(false).then((res) => {
      if (cancelled) return
      setModels(res.models.map((m) => m.id))
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  async function pick(id: string) {
    if (id === '__manual__') {
      setManual(true)
      setManualValue(model)
      return
    }
    setModel(id)
    await window.api.settings.update({ aiModel: id })
    await window.api.ai.flush()
  }

  async function commitManual() {
    const v = manualValue.trim()
    if (!v) {
      setManual(false)
      return
    }
    setModel(v)
    setModels((m) => (m.includes(v) ? m : [v, ...m]))
    setManual(false)
    await window.api.settings.update({ aiModel: v })
    await window.api.ai.flush()
  }

  if (manual) {
    return (
      <input
        autoFocus
        value={manualValue}
        onChange={(e) => setManualValue(e.target.value)}
        onBlur={commitManual}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void commitManual()
          if (e.key === 'Escape') setManual(false)
        }}
        placeholder="输入模型 ID，如 anthropic/claude-opus-4.7-fast"
        className="flex-1 min-w-0 text-xs bg-transparent border-b border-[var(--border)] py-1 focus:outline-none focus:border-[var(--accent)]"
      />
    )
  }

  // Ensure the current model always appears even if it's not in the fetched list.
  const options = models.includes(model) || !model ? models : [model, ...models]

  return (
    <select
      value={model}
      onChange={(e) => void pick(e.target.value)}
      title="切换模型"
      className="flex-1 min-w-0 text-xs bg-transparent border border-[var(--border)] rounded px-1 py-1 focus:outline-none focus:border-[var(--accent)] cursor-pointer"
    >
      {!model && <option value="">{loading ? '加载模型…' : '选择模型'}</option>}
      {options.map((id) => (
        <option key={id} value={id}>
          {id}
        </option>
      ))}
      <option value="__manual__">＋ 手动输入…</option>
    </select>
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
