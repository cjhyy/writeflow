import { useMemo } from 'react'
import { useDocStore } from '../stores/document-store'

function countWords(text: string) {
  // English words by whitespace + CJK characters individually
  const stripped = text.replace(/```[\s\S]*?```/g, '').replace(/[#*_>\-`!\[\]()]/g, ' ')
  const cjk = stripped.match(/[一-鿿぀-ヿ가-힯]/g)?.length ?? 0
  const ascii = stripped
    .replace(/[一-鿿぀-ヿ가-힯]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length
  return cjk + ascii
}

export function StatusBar() {
  const { content, filePath, dirty } = useDocStore()
  const words = useMemo(() => countWords(content), [content])
  const chars = content.length

  return (
    <div className="status-bar">
      <div className="flex-1 truncate" style={{ color: 'var(--text-faint)' }}>
        {filePath ?? 'Unsaved'} {dirty && '•'}
      </div>
      <div className="flex gap-3 shrink-0" style={{ color: 'var(--text-muted)' }}>
        <span>{words} words</span>
        <span>{chars} chars</span>
      </div>
    </div>
  )
}
