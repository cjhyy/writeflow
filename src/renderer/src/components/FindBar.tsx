import { useEffect, useRef, useState } from 'react'

interface FindBarProps {
  scrollContainer: HTMLElement | null
  onClose: () => void
}

/**
 * Inline find bar. Walks the rendered ProseMirror DOM, wraps matches with
 * <mark class="find-hit">, scrolls the current match into view. No replace
 * support yet — Phase 1 just searches.
 */
export function FindBar({ scrollContainer, onClose }: FindBarProps) {
  const [query, setQuery] = useState('')
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
    matches.forEach((el, i) => {
      el.classList.toggle('current', i === index)
    })
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

  return (
    <div className="find-bar">
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            nudge(e.shiftKey ? -1 : 1)
          } else if (e.key === 'Escape') {
            e.preventDefault()
            onClose()
          }
        }}
        placeholder="Find…"
      />
      <div className="find-bar-count">
        {matches.length === 0 && query ? 'no matches' : matches.length > 0 ? `${index + 1} / ${matches.length}` : ''}
      </div>
      <button onClick={() => nudge(-1)} title="Previous (⇧⏎)">↑</button>
      <button onClick={() => nudge(1)} title="Next (⏎)">↓</button>
      <button onClick={onClose} title="Close (Esc)">✕</button>
    </div>
  )
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
