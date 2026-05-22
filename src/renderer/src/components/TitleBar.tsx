import { useEffect, useMemo, useRef, useState } from 'react'
import { useDocStore } from '../stores/document-store'
import type { RecentFile } from '@shared/types'

interface TitleBarProps {
  onOpenRecent: (filePath: string) => void
  onNew: () => void
  onOpen: () => void
  onToggleFileTree: () => void
  onToggleOutline: () => void
  fileTreeOpen: boolean
  outlineOpen: boolean
  scrolled: boolean
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
  onToggleFileTree,
  onToggleOutline,
  fileTreeOpen,
  outlineOpen,
  scrolled,
}: TitleBarProps) {
  const { fileName, dirty, content } = useDocStore()
  const [recent, setRecent] = useState<RecentFile[]>([])
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const words = useMemo(() => countWords(content), [content])

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

      {/* Right: word count + outline + file-tree */}
      <div className="title-bar-right interactive">
        <span className="title-words" title="Word count">
          {words} 词
        </span>
        <button
          className={`title-icon-btn ${outlineOpen ? 'active' : ''}`}
          title="Toggle outline (⌘⇧1)"
          onClick={onToggleOutline}
        >
          <OutlineIcon />
        </button>
        <button
          className={`title-icon-btn ${fileTreeOpen ? 'active' : ''}`}
          title="Toggle file tree (⌘\\)"
          onClick={onToggleFileTree}
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

function OutlineIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <line x1="3" y1="4" x2="13" y2="4" />
      <line x1="5" y1="8" x2="13" y2="8" />
      <line x1="7" y1="12" x2="13" y2="12" />
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
