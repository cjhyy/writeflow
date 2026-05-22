import { useEffect, useRef } from 'react'
import { Crepe } from '@milkdown/crepe'
import '@milkdown/crepe/theme/common/style.css'
import '@milkdown/crepe/theme/frame.css'

interface EditorProps {
  value: string
  onChange: (v: string) => void
}

/**
 * Milkdown Crepe configured for a Typora-like calm surface.
 *
 * Disabled features (Crepe defaults add Notion-style chrome we don't want):
 *   - Toolbar          (floating bold/italic bar over selection)
 *   - BlockEdit        (the `+` and drag-handle that appears at line start)
 *   - Latex
 *
 * Kept:
 *   - Placeholder      "Start writing…" when empty
 *   - CodeMirror       syntax highlighting inside code blocks
 *   - ListItem, LinkTooltip, ImageBlock, Table, CursorPlaceholder
 *
 * The editor remounts on document switch via a `key` prop in the caller, so
 * `value` is read only on mount as the initial markdown.
 *
 * "Click anywhere to write" behavior: the wrapper captures clicks that land
 * outside the ProseMirror content area (whitespace below the last paragraph)
 * and moves the caret to the end of the document, so the writing surface
 * behaves like a single sheet of paper rather than a fixed-height widget.
 */
export function Editor({ value, onChange }: EditorProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const onChangeRef = useRef(onChange)

  useEffect(() => {
    onChangeRef.current = onChange
  })

  useEffect(() => {
    if (!hostRef.current) return

    const crepe = new Crepe({
      root: hostRef.current,
      defaultValue: value,
      features: {
        [Crepe.Feature.Toolbar]: false,
        [Crepe.Feature.BlockEdit]: false,
        [Crepe.Feature.Latex]: false,
        [Crepe.Feature.CursorPlaceholder]: true,
        [Crepe.Feature.Placeholder]: true,
        [Crepe.Feature.CodeMirror]: true,
        [Crepe.Feature.ListItem]: true,
        [Crepe.Feature.LinkTooltip]: true,
        [Crepe.Feature.ImageBlock]: true,
        [Crepe.Feature.Table]: true,
      },
      featureConfigs: {
        [Crepe.Feature.Placeholder]: {
          text: 'Start writing…',
          mode: 'doc',
        },
      },
    })

    crepe.create().then(() => {
      crepe.on((listener) => {
        listener.markdownUpdated((_ctx, markdown) => {
          onChangeRef.current(markdown)
        })
      })
      // autofocus on mount
      const pm = hostRef.current?.querySelector<HTMLElement>('.ProseMirror')
      pm?.focus()
    })

    return () => {
      crepe.destroy()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // If the click lands outside the contenteditable area (e.g. the empty space
  // below the last paragraph), place the caret at the end so the user can
  // just keep typing. We do this on mousedown rather than click so it fires
  // before the browser blurs/refocuses.
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const pm = wrapperRef.current?.querySelector<HTMLElement>('.ProseMirror')
    if (!pm) return
    // If the click is already inside the editable, let ProseMirror handle it.
    if (pm.contains(e.target as Node)) return
    e.preventDefault()
    pm.focus()
    const range = document.createRange()
    range.selectNodeContents(pm)
    range.collapse(false)
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)
  }

  return (
    <div
      ref={wrapperRef}
      className="min-h-full bg-white cursor-text"
      onMouseDown={handleMouseDown}
    >
      <div className="writing-surface min-h-full">
        <div ref={hostRef} />
      </div>
    </div>
  )
}
