import { useEffect, useRef, useState } from 'react'

interface FindBarProps {
  scrollContainer: HTMLElement | null
  onClose: () => void
  initialMode?: 'find' | 'replace'
}

/**
 * Inline find / replace bar. Search walks the rendered ProseMirror DOM and
 * wraps matches with <mark class="find-hit">. Replace mutates the DOM in
 * place and dispatches an input event so Crepe re-emits markdown.
 *
 * DOM-level replace is not undo-aware — for now, replacement triggers the
 * editor's normal change pipeline and will appear as a single big input
 * event. Phase-2 we can do this through ProseMirror transactions for proper
 * undo granularity.
 */
export function FindBar({ scrollContainer, onClose, initialMode = 'find' }: FindBarProps) {
  const [mode, setMode] = useState<'find' | 'replace'>(initialMode)
  const [query, setQuery] = useState('')
  const [replacement, setReplacement] = useState('')
  const [matches, setMatches] = useState<HTMLElement[]>([])
  const [index, setIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  useEffect(() => {
    if (!scrollContainer) return
    clearHits(scrollContainer)
    if (!query) {
      setMatches([])
      setIndex(0)
      return
    }
    const hits = highlightMatches(scrollContainer, query)
    setMatches(hits)
    setIndex(0)
    if (hits[0]) hits[0].scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [query, scrollContainer])

  useEffect(() => {
    matches.forEach((el, i) => el.classList.toggle('current', i === index))
    matches[index]?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [index, matches])

  useEffect(() => {
    return () => {
      if (scrollContainer) clearHits(scrollContainer)
    }
  }, [scrollContainer])

  function nudge(delta: number) {
    if (matches.length === 0) return
    setIndex((i) => (i + delta + matches.length) % matches.length)
  }

  function replaceOne() {
    const target = matches[index]
    if (!target) return
    const newNode = document.createTextNode(replacement)
    target.parentNode?.replaceChild(newNode, target)
    notifyEditorChanged(target)
    // Re-scan
    if (scrollContainer) {
      const hits = highlightMatches(scrollContainer, query)
      setMatches(hits)
      setIndex(Math.min(index, Math.max(0, hits.length - 1)))
    }
  }

  function replaceAll() {
    if (matches.length === 0) return
    const sampleParent = matches[0]
    for (const m of matches) {
      const text = document.createTextNode(replacement)
      m.parentNode?.replaceChild(text, m)
    }
    notifyEditorChanged(sampleParent)
    if (scrollContainer) {
      clearHits(scrollContainer)
      setMatches([])
      setIndex(0)
    }
  }

  return (
    <div className="find-bar">
      <div className="find-bar-rows">
        <div className="find-bar-row">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); nudge(e.shiftKey ? -1 : 1) }
              else if (e.key === 'Escape') { e.preventDefault(); onClose() }
            }}
            placeholder="查找…"
          />
          <span className="find-bar-count">
            {matches.length === 0 && query ? '无匹配' : matches.length > 0 ? `${index + 1}/${matches.length}` : ''}
          </span>
          <button onClick={() => nudge(-1)} title="上一个 (⇧⏎)">↑</button>
          <button onClick={() => nudge(1)} title="下一个 (⏎)">↓</button>
          <button onClick={() => setMode(mode === 'find' ? 'replace' : 'find')} title="切换替换模式">
            {mode === 'find' ? '替换' : '查找'}
          </button>
          <button onClick={onClose} title="关闭 (Esc)">✕</button>
        </div>
        {mode === 'replace' && (
          <div className="find-bar-row">
            <input
              value={replacement}
              onChange={(e) => setReplacement(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); replaceOne() }
                else if (e.key === 'Escape') { e.preventDefault(); onClose() }
              }}
              placeholder="替换为…"
            />
            <button onClick={replaceOne} disabled={matches.length === 0}>替换</button>
            <button onClick={replaceAll} disabled={matches.length === 0}>全部</button>
          </div>
        )}
      </div>
    </div>
  )
}

function notifyEditorChanged(refNode: Node | null) {
  if (!refNode) return
  const pm = (refNode as Element).closest?.('.ProseMirror') as HTMLElement | null
  pm?.dispatchEvent(new InputEvent('input', { bubbles: true }))
}

function clearHits(root: HTMLElement) {
  const hits = root.querySelectorAll('mark.find-hit')
  hits.forEach((m) => {
    const parent = m.parentNode
    if (!parent) return
    parent.replaceChild(document.createTextNode(m.textContent ?? ''), m)
    parent.normalize()
  })
}

function highlightMatches(root: HTMLElement, query: string): HTMLElement[] {
  if (!query) return []
  const lower = query.toLowerCase()
  const out: HTMLElement[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      const parent = node.parentElement
      if (!parent) return NodeFilter.FILTER_REJECT
      if (parent.closest('.find-bar')) return NodeFilter.FILTER_REJECT
      if (!node.textContent?.toLowerCase().includes(lower)) return NodeFilter.FILTER_REJECT
      return NodeFilter.FILTER_ACCEPT
    },
  })
  const nodes: Text[] = []
  let n: Node | null
  while ((n = walker.nextNode())) nodes.push(n as Text)

  for (const textNode of nodes) {
    const text = textNode.textContent ?? ''
    const lowerText = text.toLowerCase()
    let from = 0
    const frag = document.createDocumentFragment()
    let idx = lowerText.indexOf(lower, from)
    while (idx !== -1) {
      if (idx > from) frag.appendChild(document.createTextNode(text.slice(from, idx)))
      const mark = document.createElement('mark')
      mark.className = 'find-hit'
      mark.textContent = text.slice(idx, idx + query.length)
      frag.appendChild(mark)
      out.push(mark)
      from = idx + query.length
      idx = lowerText.indexOf(lower, from)
    }
    if (from < text.length) frag.appendChild(document.createTextNode(text.slice(from)))
    textNode.parentNode?.replaceChild(frag, textNode)
  }
  return out
}
