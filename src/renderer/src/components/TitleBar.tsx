import { useEffect, useRef, useState } from 'react'
import { useDocStore } from '../stores/document-store'
import type { RecentFile } from '@shared/types'

interface TitleBarProps {
  onOpenRecent: (filePath: string) => void
  onNew: () => void
  onOpen: () => void
  scrolled: boolean
}

export function TitleBar({ onOpenRecent, onNew, onOpen, scrolled }: TitleBarProps) {
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
      <div ref={menuRef} className="interactive relative">
        <button
          className="px-2 py-1 hover:bg-neutral-200 rounded"
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
    </div>
  )
}
