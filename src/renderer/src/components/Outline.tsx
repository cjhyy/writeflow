import { useMemo } from 'react'

interface OutlineProps {
  markdown: string
  onJump: (slug: string, text: string) => void
}

interface Heading {
  level: number
  text: string
  id: string
}

/**
 * Parse ATX headings (# foo, ## bar) from raw markdown. Skips lines inside
 * fenced code blocks so we don't treat `# comment` as a heading.
 */
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
    const text = m[2].trim()
    if (level > 3) continue
    const id = text
      .toLowerCase()
      .replace(/[^\w一-龥\s-]/g, '')
      .replace(/\s+/g, '-')
    out.push({ level, text, id })
  }
  return out
}

export function Outline({ markdown, onJump }: OutlineProps) {
  const headings = useMemo(() => parseHeadings(markdown), [markdown])

  return (
    <aside className="w-60 shrink-0 h-full overflow-y-auto border-l" style={{ background: 'var(--bg-sidebar)', borderColor: 'var(--border)' }}>
      <div className="px-3 py-2 text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-muted)' }}>
        Outline
      </div>
      {headings.length === 0 ? (
        <div className="px-3 py-2 text-[11px]" style={{ color: 'var(--text-faint)' }}>
          No headings yet.
        </div>
      ) : (
        <ul className="pb-2">
          {headings.map((h, i) => (
            <li key={`${i}-${h.id}`}>
              <button
                className="w-full text-left px-3 py-1 text-[12px] truncate hover:bg-[var(--row-hover)]"
                style={{
                  paddingLeft: `${0.75 + (h.level - 1) * 0.9}rem`,
                  color: h.level === 1 ? 'var(--text)' : 'var(--text-muted)',
                  fontWeight: h.level === 1 ? 600 : 400,
                }}
                onClick={() => onJump(h.id, h.text)}
              >
                {h.text}
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  )
}
