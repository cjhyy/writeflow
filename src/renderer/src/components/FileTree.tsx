import { useEffect, useState } from 'react'
import type { DirEntry } from '@shared/types'

interface FileTreeProps {
  activeFilePath: string | null
  onSelect: (filePath: string) => void
}

/**
 * Typora-style file panel.
 *
 * Two states:
 *   - No folder opened → empty hero text + "打开文件夹…" CTA at footer
 *   - Folder opened    → list of .md files (recursive up to depth 2)
 *
 * The current file's sibling directory is shown as a fallback when no
 * folder has been explicitly opened (so users get something useful even
 * without explicitly opening a workspace).
 */
export function FileTree({ activeFilePath, onSelect }: FileTreeProps) {
  const [entries, setEntries] = useState<DirEntry[]>([])
  const [folder, setFolder] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // When no folder is opened but a file is active, show its siblings as fallback
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

  // When folder is opened, list .md recursively
  useEffect(() => {
    if (!folder) return
    setLoading(true)
    window.api.file.listFolder(folder).then((list) => {
      setEntries(list)
      setLoading(false)
    })
  }, [folder])

  async function openFolder() {
    const res = await window.api.file.openFolder()
    if (res.ok && res.folder) {
      setFolder(res.folder)
      setEntries(res.entries ?? [])
    }
  }

  return (
    <aside className="file-tree">
      <div className="file-tree-header">
        <h2 className="file-tree-title">文件</h2>
      </div>

      <div className="file-tree-body">
        {loading ? (
          <div className="file-tree-empty">加载中…</div>
        ) : entries.length === 0 ? (
          <div className="file-tree-empty">没有打开的文件夹</div>
        ) : (
          <ul className="file-tree-list">
            {entries.map((e) => {
              const active = e.filePath === activeFilePath
              return (
                <li key={e.filePath}>
                  <button
                    className={`file-tree-item ${active ? 'active' : ''}`}
                    onClick={() => onSelect(e.filePath)}
                    title={e.filePath}
                  >
                    {e.fileName}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div className="file-tree-footer">
        <button onClick={openFolder} className="file-tree-open-btn">
          打开文件夹…
        </button>
      </div>
    </aside>
  )
}
