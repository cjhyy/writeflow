import { useEffect, useState } from 'react'
import type { DirEntry } from '@shared/types'

interface SidebarProps {
  activeFilePath: string | null
  markdown: string
  onSelectFile: (filePath: string) => void
  onJumpHeading: (text: string) => void
}

type Tab = 'files' | 'outline'
const TAB_KEY = 'writeflow.sidebar.tab'

interface Heading {
  level: number
  text: string
}

function parseHeadings(md: string): Heading[] {
  const out: Heading[] = []
  let inFence = false
  let fenceMarker = ''
  for (const raw of md.split('\n')) {
    const trimmed = raw.trim()
    if (inFence) {
      if (trimmed.startsWith(fenceMarker)) inFence = false
      continue
    }
    if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
      inFence = true
      fenceMarker = trimmed.startsWith('```') ? '```' : '~~~'
      continue
    }
    const m = raw.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/)
    if (!m) continue
    const level = m[1].length
    if (level > 3) continue
    out.push({ level, text: m[2].trim() })
  }
  return out
}

/**
 * Typora-style single side panel with two internal tabs (文件 / 大纲).
 * The active tab persists in localStorage so a user who lives in 大纲 doesn't
 * have to re-pick it on every launch.
 */
export function Sidebar({ activeFilePath, markdown, onSelectFile, onJumpHeading }: SidebarProps) {
  const [tab, setTab] = useState<Tab>(() => (localStorage.getItem(TAB_KEY) as Tab) || 'files')
  const [entries, setEntries] = useState<DirEntry[]>([])
  const [folder, setFolder] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    localStorage.setItem(TAB_KEY, tab)
  }, [tab])

  // Siblings of current file (no folder explicitly opened)
  useEffect(() => {
    if (folder) return
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
  }, [activeFilePath, folder])

  useEffect(() => {
    if (!folder) return
    setLoading(true)
    window.api.file.listFolder(folder).then((list) => {
      setEntries(list)
      setLoading(false)
    })
  }, [folder])

  async function openFolder() {
    try {
      const res = await window.api.file.openFolder()
      if (res.ok && res.folder) {
        setFolder(res.folder)
        setEntries(res.entries ?? [])
      }
    } catch (err) {
      console.error('[Sidebar] openFolder failed:', err)
    }
  }

  const headings = parseHeadings(markdown)

  return (
    <aside className="sidebar">
      <div className="sidebar-tabs">
        <button
          className={`sidebar-tab ${tab === 'files' ? 'active' : ''}`}
          onClick={() => setTab('files')}
        >
          文件
        </button>
        <button
          className={`sidebar-tab ${tab === 'outline' ? 'active' : ''}`}
          onClick={() => setTab('outline')}
        >
          大纲
        </button>
      </div>

      <div className="sidebar-body">
        {tab === 'files' && (
          <>
            {loading ? (
              <div className="sidebar-empty">加载中…</div>
            ) : entries.length === 0 ? (
              <div className="sidebar-empty">没有打开的文件夹</div>
            ) : (
              <ul className="sidebar-list">
                {entries.map((e) => {
                  const active = e.filePath === activeFilePath
                  return (
                    <li key={e.filePath}>
                      <button
                        className={`sidebar-item ${active ? 'active' : ''}`}
                        onClick={() => onSelectFile(e.filePath)}
                        title={e.filePath}
                      >
                        {e.fileName}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </>
        )}

        {tab === 'outline' && (
          <>
            {headings.length === 0 ? (
              <div className="sidebar-empty">还没有标题</div>
            ) : (
              <ul className="sidebar-list">
                {headings.map((h, i) => (
                  <li key={`${i}-${h.text}`}>
                    <button
                      className="sidebar-item"
                      style={{
                        paddingLeft: `${0.75 + (h.level - 1) * 0.9}rem`,
                        fontWeight: h.level === 1 ? 500 : 400,
                        color: h.level === 1 ? 'var(--text)' : 'var(--text-muted)',
                      }}
                      onClick={() => onJumpHeading(h.text)}
                    >
                      {h.text}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      {tab === 'files' && (
        <div className="sidebar-footer">
          <button onClick={openFolder} className="sidebar-open-btn">
            打开文件夹…
          </button>
        </div>
      )}
    </aside>
  )
}
