import { useEffect, useMemo, useRef, useState } from 'react'
import { useDocStore } from '../stores/document-store'
import type { RecentFile } from '@shared/types'

interface TitleBarProps {
  onOpenRecent: (filePath: string) => void
  onNew: () => void
  onOpen: () => void
  onToggleSidebar: () => void
  sidebarOpen: boolean
  scrolled: boolean
  aiPanelOpen: boolean
  onToggleAiPanel: () => void
}

function countWords(text: string) {
  const stripped = text.replace(/```[\s\S]*?```/g, '').replace(/[#*_>\-`!\[\]()]/g, ' ')
  const cjk = stripped.match(/[一-鿿぀-ヿ가-힯]/g)?.length ?? 0
  const ascii = stripped.replace(/[一-鿿぀-ヿ가-힯]/g, ' ').trim().split(/\s+/).filter(Boolean).length
  return cjk + ascii
}

export function TitleBar({
  onOpenRecent,
  onNew,
  onOpen,
  onToggleSidebar,
  sidebarOpen,
  scrolled,
  aiPanelOpen,
  onToggleAiPanel,
}: TitleBarProps) {
  const { fileName, dirty, content } = useDocStore()
  const [recent, setRecent] = useState<RecentFile[]>([])
  const [menuOpen, setMenuOpen] = useState(false)
  const [caretPos, setCaretPos] = useState<{ line: number; col: number } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const words = useMemo(() => countWords(content), [content])

  // Track caret line/col inside ProseMirror editor.
  // We compute by collapsing the selection to a text range, then counting
  // line breaks before the caret in the ProseMirror DOM's textContent.
  useEffect(() => {
    function update() {
      const sel = window.getSelection()
      if (!sel || sel.rangeCount === 0) return
      const range = sel.getRangeAt(0)
      const pm = (range.startContainer.parentElement?.closest('.ProseMirror') ?? null) as HTMLElement | null
      if (!pm) {
        setCaretPos(null)
        return
      }
      const before = range.cloneRange()
      before.selectNodeContents(pm)
      before.setEnd(range.endContainer, range.endOffset)
      const text = before.toString()
      const lines = text.split('\n')
      setCaretPos({ line: lines.length, col: lines[lines.length - 1].length + 1 })
    }
    document.addEventListener('selectionchange', update)
    return () => document.removeEventListener('selectionchange', update)
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    window.api.file.readRecentFiles().then(setRecent)
    function onClick(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [menuOpen])

  const displayName = fileName.replace(/\.md$/i, '')

  return (
    <div className={`title-bar ${scrolled ? 'scrolled' : ''}`}>
      {/* Left: empty space for macOS traffic lights only */}
      <div className="title-bar-left" />

      {/* Center: filename — dirty marker + dropdown */}
      <div ref={menuRef} className="title-bar-center interactive">
        <button
          className="title-filename-btn"
          onClick={() => setMenuOpen((v) => !v)}
          title="Recent files"
        >
          <span className="title-name">{displayName}</span>
          <span className="title-dash">—</span>
          <span className="title-status">{dirty ? '已编辑' : '已保存'}</span>
          <ChevronDownIcon />
        </button>
        {menuOpen && (
          <div className="recent-menu">
            <button onClick={() => { setMenuOpen(false); onNew() }}>＋ 新建</button>
            <button onClick={() => { setMenuOpen(false); onOpen() }}>📂 打开…</button>
            {recent.length > 0 && (
              <>
                <div className="recent-menu-label">最近</div>
                {recent.map((r) => (
                  <button
                    key={r.filePath}
                    onClick={() => { setMenuOpen(false); onOpenRecent(r.filePath) }}
                  >
                    {r.fileName}
                    <span className="path">{r.filePath}</span>
                  </button>
                ))}
              </>
            )}
          </div>
        )}
      </div>

      {/* Right: word count, caret position, sidebar toggle */}
      <div className="title-bar-right interactive">
        <span className="title-words" title="字数 · 光标位置">
          {words} 词
          {caretPos && (
            <span className="title-caret">
              {' · '}L{caretPos.line} C{caretPos.col}
            </span>
          )}
        </span>
        <button
          className={`title-icon-btn ${aiPanelOpen ? 'active' : ''}`}
          title="AI 助手 (⌘J)"
          onClick={onToggleAiPanel}
        >
          <SparkIcon />
        </button>
        <button
          className={`title-icon-btn ${sidebarOpen ? 'active' : ''}`}
          title="切换侧边栏 (⌘\\)"
          onClick={onToggleSidebar}
        >
          <SidebarIcon />
        </button>
      </div>
    </div>
  )
}

function ChevronDownIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ marginLeft: 4, opacity: 0.6 }}>
      <polyline points="3,5 6,8 9,5" />
    </svg>
  )
}

function SparkIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M8 2.5 L9.4 6.6 L13.5 8 L9.4 9.4 L8 13.5 L6.6 9.4 L2.5 8 L6.6 6.6 Z" />
    </svg>
  )
}

function SidebarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="2" y="3" width="12" height="10" rx="1.5" />
      <line x1="6" y1="3" x2="6" y2="13" />
    </svg>
  )
}
