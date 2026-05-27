import { useEffect, useRef } from 'react'
import { Crepe } from '@milkdown/crepe'
import '@milkdown/crepe/theme/common/style.css'
import '@milkdown/crepe/theme/frame.css'
import { useUiStore } from '../stores/ui-store'
import { useDocStore } from '../stores/document-store'

interface EditorProps {
  value: string
  onChange: (v: string) => void
  /** Optional ⌘J continuation handler — given the trailing context. */
  onContinueWrite?: (contextBefore: string) => void
}

/**
 * Read the user's current text selection inside the active ProseMirror, if
 * any. Returns the plain text only — source-level offsets aren't available
 * here, so callers do a text-based search-and-replace against the markdown
 * source when applying an edit.
 */
export function getEditorSelectionText(): string {
  const sel = window.getSelection()
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return ''
  const range = sel.getRangeAt(0)
  const el =
    range.commonAncestorContainer.nodeType === 1
      ? (range.commonAncestorContainer as Element)
      : range.commonAncestorContainer.parentElement
  if (!el?.closest('.ProseMirror')) return ''
  return sel.toString()
}

/**
 * Milkdown Crepe configured for a Typora-like calm surface.
 *
 * Enabled:
 *   - Toolbar          floating selection bar (Typora has this too)
 *   - Placeholder      "Start writing…" on empty docs
 *   - CodeMirror       syntax highlighting in code blocks
 *   - ListItem, LinkTooltip, ImageBlock, Table, CursorPlaceholder
 *
 * Disabled:
 *   - BlockEdit        the `+` and drag-dots at line start (too Notion-y)
 *   - Latex            deferred to a later phase
 *
 * Behaviors layered on top:
 *   - Click in whitespace below the last paragraph → caret jumps to end
 *   - Paste/drop image → save under {docDir}/assets/ and insert relative link
 *   - Focus mode → other paragraphs fade to ~40% opacity
 *   - Typewriter mode → on each selection change, scroll caret line to center
 *
 * The editor remounts on document switch via a `key` prop, so `value` is
 * read only on mount as the initial markdown.
 */
export function Editor({ value, onChange, onContinueWrite }: EditorProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const onChangeRef = useRef(onChange)
  const onContinueRef = useRef(onContinueWrite)
  const focusMode = useUiStore((s) => s.focusMode)
  const typewriterMode = useUiStore((s) => s.typewriterMode)

  useEffect(() => {
    onContinueRef.current = onContinueWrite
  })

  // ⌘J / Ctrl+J inside the editor surface → continue-write at cursor.
  useEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return
    function onKey(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey) || e.key !== 'j') return
      const sel = window.getSelection()
      const node = sel?.anchorNode
      const el = node?.nodeType === 1 ? (node as Element) : node?.parentElement
      if (!el?.closest('.ProseMirror')) return
      e.preventDefault()
      // We don't have an authoritative source offset, so the handler reads
      // the trailing 800 chars of the doc content as proxy. App.tsx handles
      // the actual run — this just delivers the doc tail.
      const docContent = useDocStore.getState().content
      const before = docContent.slice(Math.max(0, docContent.length - 800))
      onContinueRef.current?.(before)
    }
    wrapper.addEventListener('keydown', onKey)
    return () => wrapper.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    onChangeRef.current = onChange
  })

  useEffect(() => {
    if (!hostRef.current) return

    const crepe = new Crepe({
      root: hostRef.current,
      defaultValue: value,
      features: {
        // Disabled: our custom AI SelectionBubble occupies the on-selection
        // floating-bar slot. Keeping Crepe's toolbar too stacked two bars on
        // every selection (the "weird background that won't dismiss"). Bold/
        // italic/etc. remain available via the 格式 menu + ⌘B/⌘I shortcuts.
        [Crepe.Feature.Toolbar]: false,
        [Crepe.Feature.BlockEdit]: false,
        [Crepe.Feature.Latex]: false,
        [Crepe.Feature.Cursor]: true,
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
      const pm = hostRef.current?.querySelector<HTMLElement>('.ProseMirror')
      pm?.focus()
    })

    return () => {
      crepe.destroy()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Rewrite local-file image sources so they render. The renderer is served
  // over http:// (dev), and Electron's webSecurity blocks file:// from an
  // http:// origin. wf-asset:// is a registered privileged scheme that maps
  // back to the real file in the main process. The markdown source keeps the
  // original file:// path — only the rendered <img src> is swapped.
  useEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return
    const rewrite = () => {
      wrapper.querySelectorAll<HTMLImageElement>('img').forEach((img) => {
        const raw = img.getAttribute('src') ?? ''
        if (raw.startsWith('file://')) {
          const abs = decodeURIComponent(raw.replace(/^file:\/\//, ''))
          img.src = `wf-asset://local/${encodeURIComponent(abs)}`
        }
      })
    }
    rewrite()
    const obs = new MutationObserver(rewrite)
    obs.observe(wrapper, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] })
    return () => obs.disconnect()
  }, [])

  // Click in whitespace below content → caret to end of doc
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const pm = wrapperRef.current?.querySelector<HTMLElement>('.ProseMirror')
    if (!pm) return
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

  // Paste/drop image: write file via main IPC, insert markdown image syntax.
  // We intercept at the wrapper level so it works even before ProseMirror is fully wired.
  useEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return

    async function handleFiles(files: FileList | File[], evt: Event) {
      const arr = Array.from(files as ArrayLike<File>)
      const images = arr.filter((f) => f.type.startsWith('image/'))
      if (images.length === 0) return
      evt.preventDefault()
      const docPath = useDocStore.getState().filePath
      for (const file of images) {
        const bytes = await file.arrayBuffer()
        const ext = file.name.includes('.') ? file.name.split('.').pop()! : file.type.split('/')[1] ?? 'png'
        const res = await window.api.file.saveImage({ docPath, bytes, ext })
        if (!res.ok || !res.mdPath) continue
        insertAtCursor(`![](${res.mdPath})\n`)
      }
    }

    function onPaste(e: ClipboardEvent) {
      if (!e.clipboardData) return
      const files = Array.from(e.clipboardData.files ?? [])
      if (files.length > 0) void handleFiles(files, e)
    }

    function onDrop(e: DragEvent) {
      if (!e.dataTransfer) return
      const files = Array.from(e.dataTransfer.files ?? [])
      if (files.length > 0) void handleFiles(files, e)
    }

    function onDragOver(e: DragEvent) {
      if (e.dataTransfer?.types.includes('Files')) e.preventDefault()
    }

    wrapper.addEventListener('paste', onPaste)
    wrapper.addEventListener('drop', onDrop)
    wrapper.addEventListener('dragover', onDragOver)
    return () => {
      wrapper.removeEventListener('paste', onPaste)
      wrapper.removeEventListener('drop', onDrop)
      wrapper.removeEventListener('dragover', onDragOver)
    }
  }, [])

  // Focus mode: tag the wrapper so CSS can dim non-current paragraphs.
  // We track the current paragraph by selection change and add a class to it.
  useEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return
    wrapper.classList.toggle('focus-mode', focusMode)
    if (!focusMode) {
      wrapper.querySelectorAll('.focus-current').forEach((el) => el.classList.remove('focus-current'))
      return
    }
    function update() {
      const sel = window.getSelection()
      if (!sel || sel.rangeCount === 0) return
      const node = sel.anchorNode
      if (!node) return
      const startEl = (node.nodeType === 1 ? (node as Element) : node.parentElement) ?? null
      const block = startEl?.closest('p, h1, h2, h3, h4, h5, h6, li, blockquote, pre')
      wrapper?.querySelectorAll('.focus-current').forEach((el) => el.classList.remove('focus-current'))
      block?.classList.add('focus-current')
    }
    document.addEventListener('selectionchange', update)
    update()
    return () => document.removeEventListener('selectionchange', update)
  }, [focusMode])

  // Typewriter mode: keep the caret line vertically centered.
  useEffect(() => {
    if (!typewriterMode) return
    const scroller = wrapperRef.current?.closest<HTMLElement>('[data-editor-scroll]')
    if (!scroller) return
    function center() {
      const sel = window.getSelection()
      if (!sel || sel.rangeCount === 0) return
      const range = sel.getRangeAt(0).cloneRange()
      range.collapse(true)
      const rect = range.getClientRects()[0] ?? range.getBoundingClientRect()
      if (!rect) return
      const scrollerRect = scroller!.getBoundingClientRect()
      const targetY = scrollerRect.top + scrollerRect.height / 2
      const delta = rect.top - targetY
      if (Math.abs(delta) > 2) scroller!.scrollBy({ top: delta, behavior: 'smooth' })
    }
    document.addEventListener('selectionchange', center)
    return () => document.removeEventListener('selectionchange', center)
  }, [typewriterMode])

  return (
    <div
      ref={wrapperRef}
      className="min-h-full bg-[var(--bg)] cursor-text"
      onMouseDown={handleMouseDown}
    >
      <div className="writing-surface min-h-full">
        <div ref={hostRef} />
      </div>
    </div>
  )
}

function insertAtCursor(text: string) {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return
  const range = sel.getRangeAt(0)
  range.deleteContents()
  range.insertNode(document.createTextNode(text))
  range.collapse(false)
  sel.removeAllRanges()
  sel.addRange(range)
  // Trigger an input event so Crepe's markdown listener fires
  const pm = (range.startContainer as Element).closest?.('.ProseMirror') as HTMLElement | null
  pm?.dispatchEvent(new InputEvent('input', { bubbles: true }))
}
