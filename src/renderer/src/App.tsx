import { useCallback, useEffect, useRef, useState } from 'react'
import { Editor } from './components/Editor'
import { FileTree } from './components/FileTree'
import { HtmlPreview } from './components/HtmlPreview'
import { Outline } from './components/Outline'
import { TitleBar } from './components/TitleBar'
import { useDocStore } from './stores/document-store'

const AUTOSAVE_DELAY_MS = 1500

export function App() {
  const doc = useDocStore()
  const [scrolled, setScrolled] = useState(false)
  const [fileTreeOpen, setFileTreeOpen] = useState(false)
  const [outlineOpen, setOutlineOpen] = useState(false)
  const editorScrollRef = useRef<HTMLDivElement>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
    if (!s.filePath) {
      return doSaveAs()
    }
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

  // Menu bindings (File menu in native menubar)
  useEffect(() => {
    const u1 = window.api.on.menuNew(doNew)
    const u2 = window.api.on.menuOpen(doOpen)
    const u3 = window.api.on.menuSave(() => { void doSave() })
    const u4 = window.api.on.menuSaveAs(() => { void doSaveAs() })
    return () => { u1(); u2(); u3(); u4() }
  }, [doNew, doOpen, doSave, doSaveAs])

  // Sidebar shortcuts: Cmd+\ for file tree, Cmd+Shift+1 for outline
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!e.metaKey && !e.ctrlKey) return
      if (e.key === '\\') {
        e.preventDefault()
        setFileTreeOpen((v) => !v)
      } else if (e.shiftKey && e.key === '!') {
        // Cmd+Shift+1 → "!" on US layout
        e.preventDefault()
        setOutlineOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

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

  // Scroll to a heading by visible text. We re-scan the rendered ProseMirror
  // headings rather than rely on id attributes, because Crepe doesn't always
  // emit slugs that match remark's.
  const handleOutlineJump = useCallback((_slug: string, text: string) => {
    const scroller = editorScrollRef.current
    if (!scroller) return
    const headings = scroller.querySelectorAll<HTMLElement>('h1, h2, h3')
    for (const h of Array.from(headings)) {
      if (h.textContent?.trim() === text) {
        const top = h.offsetTop - 40
        scroller.scrollTo({ top, behavior: 'smooth' })
        return
      }
    }
  }, [])

  return (
    <div className="h-full flex flex-col">
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
        {fileTreeOpen && (
          <FileTree activeFilePath={doc.filePath} onSelect={doOpenByPath} />
        )}
        <div
          ref={editorScrollRef}
          className="flex-1 min-w-0 overflow-y-auto"
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
        {outlineOpen && !doc.isHtmlPreview && (
          <Outline markdown={doc.content} onJump={handleOutlineJump} />
        )}
      </div>
    </div>
  )
}
