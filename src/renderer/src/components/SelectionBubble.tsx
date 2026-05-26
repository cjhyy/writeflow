import { useEffect, useRef, useState } from 'react'
import type { AiEvent, AiInlineAction, DocContext } from '@shared/ai-types'
import { useDocStore } from '../stores/document-store'

interface SelectionBubbleProps {
  /** Returns the currently-selected text inside the editor, plus source offsets if known. */
  getRange: () => { text: string; from: number; to: number } | null
  /** Workspace folder if open. */
  workspaceRoot: string | null
  /** Apply an accepted edit by setting new markdown source. */
  onApplyEdit: (newContent: string) => void
}

function applyInlineEdit(content: string, selectionText: string, newText: string, kind: string): string {
  if (kind === 'replace_doc') return newText
  if (kind === 'insert_at_cursor') {
    // Without exact cursor offset, fall back to appending at the end of doc.
    return content + (content.endsWith('\n') ? '' : '\n') + newText
  }
  // replace_selection / replace_range: text-based search-and-replace on the
  // first occurrence of the selected text. ProseMirror's plain-text view
  // usually matches the markdown source for prose, so this is the right
  // default. If the selection has been edited away in the meantime, we
  // append the result so the user still sees it.
  if (selectionText && content.includes(selectionText)) {
    return content.replace(selectionText, newText)
  }
  return content + '\n\n' + newText
}

const ACTIONS: Array<{ key: AiInlineAction; label: string }> = [
  { key: 'rewrite', label: '改写' },
  { key: 'shorten', label: '缩短' },
  { key: 'expand', label: '扩写' },
  { key: 'fix-grammar', label: '修语法' },
  { key: 'translate', label: '翻译' },
  { key: 'change-tone', label: '调语气' },
]

export function SelectionBubble({ getRange, workspaceRoot, onApplyEdit }: SelectionBubbleProps) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [askOpen, setAskOpen] = useState(false)
  const [askText, setAskText] = useState('')
  const activeRangeRef = useRef<{ text: string; from: number; to: number } | null>(null)
  const activeRunIdRef = useRef<string | null>(null)

  // Track DOM selection; place bubble above it. Hide when selection collapses
  // or when focus leaves the editor surface.
  useEffect(() => {
    function update() {
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        if (!askOpen) setPos(null)
        return
      }
      const range = sel.getRangeAt(0)
      // Only show when the selection lives inside ProseMirror — avoid showing
      // over the side panel, inputs, etc.
      const container = range.commonAncestorContainer
      const el = container.nodeType === 1 ? (container as Element) : container.parentElement
      if (!el?.closest('.ProseMirror')) {
        if (!askOpen) setPos(null)
        return
      }
      const rect = range.getBoundingClientRect()
      if (rect.width === 0 && rect.height === 0) {
        if (!askOpen) setPos(null)
        return
      }
      setPos({ top: rect.top - 44, left: rect.left + rect.width / 2 })
    }
    document.addEventListener('selectionchange', update)
    return () => document.removeEventListener('selectionchange', update)
  }, [askOpen])

  // Listen for ai:event and intercept this bubble's run only.
  useEffect(() => {
    const off = window.api.ai.onEvent((e: AiEvent) => {
      if (!activeRunIdRef.current || e.runId !== activeRunIdRef.current) return
      if (e.type === 'propose_edit') {
        const range = activeRangeRef.current
        if (!range) return
        const doc = useDocStore.getState()
        const next = applyInlineEdit(doc.content, range.text, e.edit.text, e.edit.kind)
        onApplyEdit(next)
      }
      if (e.type === 'done' || e.type === 'error') {
        activeRunIdRef.current = null
        activeRangeRef.current = null
        setBusy(false)
        setAskOpen(false)
        setAskText('')
        setPos(null)
      }
    })
    return off
  }, [onApplyEdit])

  function buildDocContext(range: { text: string; from: number; to: number }): DocContext {
    const s = useDocStore.getState()
    return {
      filePath: s.filePath,
      content: s.content,
      selectionText: range.text,
      selection: { from: range.from, to: range.to },
      workspaceRoot,
    }
  }

  async function runAction(action: AiInlineAction, message?: string) {
    const range = getRange()
    if (!range || !range.text) return
    activeRangeRef.current = range
    setBusy(true)
    const { runId } = await window.api.ai.run({
      intent: 'inline-rewrite',
      message: message ?? '',
      inlineAction: action,
      docContext: buildDocContext(range),
    })
    activeRunIdRef.current = runId
  }

  if (!pos) return null

  return (
    <div
      className="fixed z-50 -translate-x-1/2 flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--bg)] shadow-md px-1 py-1"
      style={{ top: pos.top, left: pos.left }}
      onMouseDown={(e) => e.preventDefault()}
    >
      {askOpen ? (
        <>
          <input
            autoFocus
            value={askText}
            onChange={(e) => setAskText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && askText.trim()) {
                void runAction('ask', askText)
              } else if (e.key === 'Escape') {
                setAskOpen(false)
                setAskText('')
              }
            }}
            placeholder="问 AI…"
            className="text-xs px-2 py-1 rounded bg-[var(--bg)] border border-[var(--border)] w-48 focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
          />
          <button
            disabled={busy || !askText.trim()}
            onClick={() => void runAction('ask', askText)}
            className="text-xs px-2 py-1 rounded bg-[var(--accent)] text-white disabled:opacity-50"
          >
            ↵
          </button>
        </>
      ) : (
        <>
          {ACTIONS.map((a) => (
            <button
              key={a.key}
              disabled={busy}
              onClick={() => void runAction(a.key)}
              className="text-xs px-2 py-1 rounded hover:bg-[var(--bg-soft)] disabled:opacity-50"
            >
              {busy ? '…' : a.label}
            </button>
          ))}
          <div className="w-px h-4 bg-[var(--border)] mx-1" />
          <button
            disabled={busy}
            onClick={() => setAskOpen(true)}
            className="text-xs px-2 py-1 rounded hover:bg-[var(--bg-soft)] disabled:opacity-50"
            title="自由提问"
          >
            问…
          </button>
        </>
      )}
    </div>
  )
}
