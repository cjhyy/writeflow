import { useCallback, useEffect, useRef, useState } from 'react'
import { Editor } from './components/Editor'
import { FileTree } from './components/FileTree'
import { FindBar } from './components/FindBar'
import { HtmlPreview } from './components/HtmlPreview'
import { Outline } from './components/Outline'
import { ScrollToTop } from './components/ScrollToTop'
import { TitleBar } from './components/TitleBar'
import { useDocStore } from './stores/document-store'
import { useUiStore } from './stores/ui-store'

const AUTOSAVE_DELAY_MS = 1500

export function App() {
  const doc = useDocStore()
  const { theme, focusMode, typewriterMode, findOpen, setTheme, toggleFocusMode, toggleTypewriterMode, setFindOpen } = useUiStore()
  const [scrolled, setScrolled] = useState(false)
  const [fileTreeOpen, setFileTreeOpen] = useState(false)
  const [outlineOpen, setOutlineOpen] = useState(false)
  // Using a state ref so children that mount after the scroller (FindBar,
  // ScrollToTop) get a stable, current DOM reference instead of a stale null.
  const [scrollerEl, setScrollerEl] = useState<HTMLDivElement | null>(null)
  const editorScrollRef = useRef<HTMLDivElement | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Apply theme to root so CSS variables pick up the right palette
  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  const scheduleAutosave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      const s = useDocStore.getState()
      if (s.dirty && s.filePath && !s.isHtmlPreview) {
        void doSave()
      }
    }, AUTOSAVE_DELAY_MS)
  }, [])

  const doSave = useCallback(async (): Promise<boolean> => {
    const s = useDocStore.getState()
    if (s.isHtmlPreview) return false
    if (!s.filePath) return doSaveAs()
    const res = await window.api.file.saveFile({ filePath: s.filePath, content: s.content })
    if (res.ok && res.filePath && res.fileName) {
      useDocStore.getState().markSaved(res.filePath, res.fileName, s.content)
      return true
    }
    return false
  }, [])

  const doSaveAs = useCallback(async (): Promise<boolean> => {
    const s = useDocStore.getState()
    if (s.isHtmlPreview) return false
    const res = await window.api.file.saveFileAs({
      content: s.content,
      suggestedName: s.fileName,
    })
    if (res.ok && res.filePath && res.fileName) {
      useDocStore.getState().markSaved(res.filePath, res.fileName, s.content)
      return true
    }
    return false
  }, [])

  const confirmDiscardIfDirty = useCallback(async (): Promise<boolean> => {
    const s = useDocStore.getState()
    if (!s.dirty) return true
    return window.confirm(`${s.fileName} has unsaved changes. Discard?`)
  }, [])

  const doNew = useCallback(async () => {
    if (!(await confirmDiscardIfDirty())) return
    const fresh = await window.api.file.newFile()
    useDocStore.getState().reset(fresh)
  }, [confirmDiscardIfDirty])

  const doOpen = useCallback(async () => {
    if (!(await confirmDiscardIfDirty())) return
    const res = await window.api.file.openFile()
    if (!res.ok || res.cancelled) return
    useDocStore.getState().reset({
      filePath: res.filePath!,
      fileName: res.fileName!,
      content: res.content ?? '',
      savedContent: res.content ?? '',
      dirty: false,
      lastSavedAt: new Date().toISOString(),
      isHtmlPreview: res.isHtmlPreview ?? false,
    })
  }, [confirmDiscardIfDirty])

  const doOpenByPath = useCallback(
    async (filePath: string) => {
      if (!(await confirmDiscardIfDirty())) return
      const res = await window.api.file.openFileByPath(filePath)
      if (!res.ok) return
      useDocStore.getState().reset({
        filePath: res.filePath!,
        fileName: res.fileName!,
        content: res.content ?? '',
        savedContent: res.content ?? '',
        dirty: false,
        lastSavedAt: new Date().toISOString(),
        isHtmlPreview: res.isHtmlPreview ?? false,
      })
    },
    [confirmDiscardIfDirty],
  )

  const doExportPdf = useCallback(async () => {
    const s = useDocStore.getState()
    await window.api.file.exportPdf({ suggestedName: s.fileName })
  }, [])

  // Menu bindings
  useEffect(() => {
    const u = [
      window.api.on.menuNew(doNew),
      window.api.on.menuOpen(doOpen),
      window.api.on.menuSave(() => { void doSave() }),
      window.api.on.menuSaveAs(() => { void doSaveAs() }),
      window.api.on.menuExportPdf(() => { void doExportPdf() }),
      window.api.on.menuFind(() => setFindOpen(true)),
      window.api.on.menuToggleFileTree(() => setFileTreeOpen((v) => !v)),
      window.api.on.menuToggleOutline(() => setOutlineOpen((v) => !v)),
      window.api.on.menuToggleFocusMode(() => toggleFocusMode()),
      window.api.on.menuToggleTypewriter(() => toggleTypewriterMode()),
      window.api.on.menuTheme((t) => setTheme(t)),
    ]
    return () => u.forEach((fn) => fn())
  }, [doNew, doOpen, doSave, doSaveAs, doExportPdf, setFindOpen, toggleFocusMode, toggleTypewriterMode, setTheme])

  // Keyboard fallbacks (also handled by native menu, but here for in-renderer focus)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!e.metaKey && !e.ctrlKey) return
      if (e.key === '\\') {
        e.preventDefault()
        setFileTreeOpen((v) => !v)
      } else if (e.shiftKey && e.key === '!') {
        e.preventDefault()
        setOutlineOpen((v) => !v)
      } else if (e.key === 'f' && !e.shiftKey) {
        e.preventDefault()
        setFindOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setFindOpen])

  // Autosave on content change
  useEffect(() => {
    if (doc.dirty) scheduleAutosave()
  }, [doc.content, doc.dirty, scheduleAutosave])

  // Beforeunload warning
  useEffect(() => {
    function handler(e: BeforeUnloadEvent) {
      if (useDocStore.getState().dirty) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])

  const handleOutlineJump = useCallback((_slug: string, text: string) => {
    const scroller = editorScrollRef.current
    if (!scroller) return
    const headings = scroller.querySelectorAll<HTMLElement>('h1, h2, h3')
    for (const h of Array.from(headings)) {
      if (h.textContent?.trim() === text) {
        const top = h.offsetTop - 40
        scroller.scrollTo({ top, behavior: 'smooth' })
        h.classList.add('outline-flash')
        setTimeout(() => h.classList.remove('outline-flash'), 900)
        return
      }
    }
  }, [])

  return (
    <div className={`h-full flex flex-col ${focusMode ? 'is-focus' : ''} ${typewriterMode ? 'is-typewriter' : ''}`}>
      <TitleBar
        onOpenRecent={doOpenByPath}
        onNew={doNew}
        onOpen={doOpen}
        onToggleFileTree={() => setFileTreeOpen((v) => !v)}
        onToggleOutline={() => setOutlineOpen((v) => !v)}
        fileTreeOpen={fileTreeOpen}
        outlineOpen={outlineOpen}
        scrolled={scrolled}
      />
      <div className="flex-1 min-h-0 flex">
        {fileTreeOpen && <FileTree activeFilePath={doc.filePath} onSelect={doOpenByPath} />}
        <div className="flex-1 min-w-0 flex flex-col relative">
          {findOpen && (
            <FindBar scrollContainer={scrollerEl} onClose={() => setFindOpen(false)} />
          )}
          <div
            ref={(el) => {
              editorScrollRef.current = el
              setScrollerEl(el)
            }}
            data-editor-scroll
            className="flex-1 min-h-0 overflow-y-auto"
            onScroll={(e) => setScrolled((e.target as HTMLDivElement).scrollTop > 4)}
          >
            {doc.isHtmlPreview ? (
              <HtmlPreview content={doc.content} />
            ) : (
              <Editor
                key={doc.filePath ?? 'untitled'}
                value={doc.savedContent}
                onChange={(v) => useDocStore.getState().setContent(v)}
              />
            )}
          </div>
          <ScrollToTop scroller={scrollerEl} />
        </div>
        {outlineOpen && !doc.isHtmlPreview && (
          <Outline markdown={doc.content} onJump={handleOutlineJump} />
        )}
      </div>
    </div>
  )
}
