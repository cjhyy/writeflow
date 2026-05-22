import { useEffect, useRef, useState } from 'react'
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
  const { fileName, dirty } = useDocStore()
  const [recent, setRecent] = useState<RecentFile[]>([])
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    window.api.file.readRecentFiles().then(setRecent)
    function onClick(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [menuOpen])

  return (
    <div className={`title-bar ${scrolled ? 'scrolled' : ''}`}>
      {/* Left: file tree toggle + new file */}
      <button
        className={`title-icon-btn interactive ${fileTreeOpen ? 'active' : ''}`}
        title="Toggle file tree (⌘\\)"
        onClick={onToggleFileTree}
      >
        <SidebarIcon side="left" />
      </button>
      <button
        className="title-icon-btn interactive"
        title="New file (⌘N)"
        onClick={onNew}
      >
        <NewFileIcon />
      </button>

      {/* Center: filename + recent dropdown */}
      <div ref={menuRef} className="interactive relative flex-1 flex items-center justify-center">
        <button
          className="px-2 py-1 hover:bg-neutral-200 rounded text-[12px]"
          onClick={() => setMenuOpen((v) => !v)}
        >
          {fileName}
          {dirty && <span className="dirty-dot" />}
        </button>
        {menuOpen && (
          <div className="recent-menu">
            <button onClick={() => { setMenuOpen(false); onNew() }}>＋ New File</button>
            <button onClick={() => { setMenuOpen(false); onOpen() }}>📂 Open…</button>
            {recent.length > 0 && (
              <>
                <div className="text-[10px] text-neutral-500 px-2 py-1 mt-1 uppercase tracking-wider">Recent</div>
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

      {/* Right: outline toggle */}
      <button
        className={`title-icon-btn interactive ${outlineOpen ? 'active' : ''}`}
        title="Toggle outline (⌘⇧1)"
        onClick={onToggleOutline}
      >
        <SidebarIcon side="right" />
      </button>
    </div>
  )
}

function SidebarIcon({ side }: { side: 'left' | 'right' }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="2" y="3" width="12" height="10" rx="1.5" />
      <line x1={side === 'left' ? '6' : '10'} y1="3" x2={side === 'left' ? '6' : '10'} y2="13" />
    </svg>
  )
}

function NewFileIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M4 2h5l3 3v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" />
      <path d="M9 2v3h3" />
      <line x1="7.5" y1="8" x2="7.5" y2="12" />
      <line x1="5.5" y1="10" x2="9.5" y2="10" />
    </svg>
  )
}
