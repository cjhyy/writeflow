import { useEffect, useState } from 'react'
import type { DirEntry } from '@shared/types'

interface FileTreeProps {
  activeFilePath: string | null
  onSelect: (filePath: string) => void
}

export function FileTree({ activeFilePath, onSelect }: FileTreeProps) {
  const [entries, setEntries] = useState<DirEntry[]>([])

  useEffect(() => {
    if (!activeFilePath) {
      setEntries([])
      return
    }
    let cancelled = false
    window.api.file.listDir(activeFilePath).then((list) => {
      if (!cancelled) setEntries(list)
    })
    return () => {
      cancelled = true
    }
  }, [activeFilePath])

  return (
    <aside className="w-60 shrink-0 h-full overflow-y-auto border-r" style={{ background: 'var(--bg-sidebar)', borderColor: 'var(--border)' }}>
      <div className="px-3 py-2 text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-muted)' }}>
        Files
      </div>
      {entries.length === 0 ? (
        <div className="px-3 py-2 text-[11px]" style={{ color: 'var(--text-faint)' }}>
          {activeFilePath ? 'No other markdown files.' : 'Open a file to browse its folder.'}
        </div>
      ) : (
        <ul className="pb-2">
          {entries.map((e) => {
            const active = e.filePath === activeFilePath
            return (
              <li key={e.filePath}>
                <button
                  className="w-full text-left px-3 py-1.5 text-[12px] truncate"
                  style={{
                    background: active ? 'var(--row-active)' : 'transparent',
                    color: active ? 'var(--accent)' : 'var(--text)',
                  }}
                  onMouseEnter={(ev) => { if (!active) ev.currentTarget.style.background = 'var(--row-hover)' }}
                  onMouseLeave={(ev) => { if (!active) ev.currentTarget.style.background = 'transparent' }}
                  onClick={() => onSelect(e.filePath)}
                >
                  {e.fileName}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </aside>
  )
}
