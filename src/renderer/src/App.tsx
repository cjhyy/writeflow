import { useCallback, useEffect, useRef, useState } from 'react'
import { Editor, getEditorSelectionText } from './components/Editor'
import { FindBar } from './components/FindBar'
import { HtmlPreview } from './components/HtmlPreview'
import { PreferencesModal } from './components/PreferencesModal'
import { ScrollToTop } from './components/ScrollToTop'
import { Sidebar } from './components/Sidebar'
import { TitleBar } from './components/TitleBar'
import { AIPanel } from './components/AIPanel'
import { SelectionBubble } from './components/SelectionBubble'
import { useDocStore } from './stores/document-store'
import { useUiStore } from './stores/ui-store'
import { useAiStore } from './stores/ai-store'
import type { AiEvent } from '@shared/ai-types'

const AUTOSAVE_DELAY_MS = 1500
const SIDEBAR_KEY = 'writeflow.sidebar.open'

export function App() {
  const doc = useDocStore()
  const { theme, focusMode, typewriterMode, findOpen, setTheme, toggleFocusMode, toggleTypewriterMode, setFindOpen } = useUiStore()
  const [scrolled, setScrolled] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(() => localStorage.getItem(SIDEBAR_KEY) === '1')
  const [findMode, setFindMode] = useState<'find' | 'replace'>('find')
  const [prefsOpen, setPrefsOpen] = useState(false)
  const [scrollerEl, setScrollerEl] = useState<HTMLDivElement | null>(null)
  const editorScrollRef = useRef<HTMLDivElement | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [aiEpoch, setAiEpoch] = useState(0)
  const [aiPanelWidth, setAiPanelWidth] = useState(360)
  const [workspaceRoot] = useState<string | null>(null)
  const aiPanelOpen = useAiStore((s) => s.panelOpen)
  const toggleAiPanel = useAiStore((s) => s.togglePanel)

  useEffect(() => {
    localStorage.setItem(SIDEBAR_KEY, sidebarOpen ? '1' : '0')
  }, [sidebarOpen])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  useEffect(() => {
    window.api.settings.get().then((s) => {
      setTheme(s.theme)
      const root = document.documentElement
      root.style.setProperty('--editor-font-size', `${s.editorFontSize}px`)
      root.style.setProperty('--editor-line-height', String(s.editorLineHeight))
      if (s.aiPanelWidth) setAiPanelWidth(s.aiPanelWidth)
    })
    const unsub = window.api.on.menuPreferences(() => setPrefsOpen(true))
    return unsub
  }, [setTheme])

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

  // OS-level open: macOS Finder / dock, or CLI arg on boot
  useEffect(() => {
    window.api.file.takePendingOpen().then((p) => {
      if (p) doOpenByPath(p)
    })
    const unsub = window.api.on.appOpenFromOS((p) => doOpenByPath(p))
    return unsub
  }, [doOpenByPath])

  // Menu bindings
  useEffect(() => {
    const u = [
      window.api.on.menuNew(doNew),
      window.api.on.menuOpen(doOpen),
      window.api.on.menuSave(() => { void doSave() }),
      window.api.on.menuSaveAs(() => { void doSaveAs() }),
      window.api.on.menuExportPdf(() => { void doExportPdf() }),
      window.api.on.menuFind(() => { setFindMode('find'); setFindOpen(true) }),
      window.api.on.menuReplace(() => { setFindMode('replace'); setFindOpen(true) }),
      window.api.on.menuToggleFileTree(() => setSidebarOpen((v) => !v)),
      window.api.on.menuToggleOutline(() => setSidebarOpen((v) => !v)),
      window.api.on.menuToggleFocusMode(() => toggleFocusMode()),
      window.api.on.menuToggleTypewriter(() => toggleTypewriterMode()),
      window.api.on.menuTheme((t) => setTheme(t)),
    ]
    return () => u.forEach((fn) => fn())
  }, [doNew, doOpen, doSave, doSaveAs, doExportPdf, setFindOpen, toggleFocusMode, toggleTypewriterMode, setTheme])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!e.metaKey && !e.ctrlKey) return
      if (e.key === '\\') {
        e.preventDefault()
        setSidebarOpen((v) => !v)
      } else if (e.key === 'f' && !e.shiftKey) {
        e.preventDefault()
        setFindMode('find')
        setFindOpen(true)
      } else if (e.key === 'h' && !e.shiftKey) {
        e.preventDefault()
        setFindMode('replace')
        setFindOpen(true)
      } else if (e.key === 'j') {
        // ⌘J inside the editor is handled by Editor (continue-write).
        // ⌘J elsewhere toggles the AI panel.
        const inEditor = (e.target as HTMLElement)?.closest?.('.ProseMirror')
        if (!inEditor) {
          e.preventDefault()
          toggleAiPanel()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setFindOpen, toggleAiPanel])

  useEffect(() => {
    if (doc.dirty) scheduleAutosave()
  }, [doc.content, doc.dirty, scheduleAutosave])

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

  // AI edits: bump epoch to remount the editor with the new markdown source.
  const applyAiEdit = useCallback((newContent: string) => {
    useDocStore.getState().setContent(newContent)
    setAiEpoch((e) => e + 1)
  }, [])

  // Streamed append from write-doc workflow.
  const appendToDoc = useCallback((text: string) => {
    const cur = useDocStore.getState().content
    const next = (cur && !cur.endsWith('\n') ? cur + '\n' : cur) + text
    useDocStore.getState().setContent(next)
    setAiEpoch((e) => e + 1)
  }, [])

  // Replace a section by heading. Heading is matched case-sensitively against
  // any markdown ATX heading line (# / ## / ### / ...). The section spans
  // from the matched heading up to the next heading of the same OR higher
  // level, exclusive of that next heading.
  const replaceSection = useCallback((heading: string, newContent: string) => {
    const cur = useDocStore.getState().content
    const lines = cur.split('\n')
    const headingRegex = /^(#{1,6})\s+(.+?)\s*$/
    let startIdx = -1
    let startLevel = 0
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(headingRegex)
      if (m && m[2].trim() === heading.trim()) {
        startIdx = i
        startLevel = m[1].length
        break
      }
    }
    if (startIdx === -1) {
      // Section not found — append as new section instead of silently dropping.
      appendToDoc('\n\n' + newContent)
      return
    }
    let endIdx = lines.length
    for (let i = startIdx + 1; i < lines.length; i++) {
      const m = lines[i].match(headingRegex)
      if (m && m[1].length <= startLevel) {
        endIdx = i
        break
      }
    }
    const before = lines.slice(0, startIdx).join('\n')
    const after = lines.slice(endIdx).join('\n')
    const next = [before, newContent, after].filter((s) => s.length > 0).join('\n')
    useDocStore.getState().setContent(next)
    setAiEpoch((e) => e + 1)
  }, [appendToDoc])

  const onContinueWrite = useCallback(async (contextBefore: string) => {
    const s = useDocStore.getState()
    const { runId } = await window.api.ai.run({
      intent: 'inline-continue',
      message: '',
      docContext: {
        filePath: s.filePath,
        content: s.content,
        selectionText: '',
        selection: { from: s.content.length, to: s.content.length },
        workspaceRoot,
      },
    })
    // Listen for the single propose_edit from this run, append to doc, dispose.
    void contextBefore
    const off = window.api.ai.onEvent((e: AiEvent) => {
      if (e.runId !== runId) return
      if (e.type === 'propose_edit') {
        const cur = useDocStore.getState().content
        const next = cur + (cur.endsWith('\n') ? '' : '\n') + e.edit.text
        applyAiEdit(next)
      }
      if (e.type === 'done' || e.type === 'error') off()
    })
  }, [workspaceRoot, applyAiEdit])

  const handleOutlineJump = useCallback((text: string) => {
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
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
        sidebarOpen={sidebarOpen}
        scrolled={scrolled}
        aiPanelOpen={aiPanelOpen}
        onToggleAiPanel={toggleAiPanel}
        onOpenPreferences={() => setPrefsOpen(true)}
      />
      <div className="flex-1 min-h-0 flex">
        {sidebarOpen && (
          <Sidebar
            activeFilePath={doc.filePath}
            markdown={doc.content}
            onSelectFile={doOpenByPath}
            onJumpHeading={handleOutlineJump}
          />
        )}
        <div className="flex-1 min-w-0 flex flex-col relative">
          {findOpen && (
            <FindBar
              scrollContainer={scrollerEl}
              onClose={() => setFindOpen(false)}
              initialMode={findMode}
            />
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
                key={`${doc.filePath ?? 'untitled'}-${aiEpoch}`}
                value={doc.content}
                onChange={(v) => useDocStore.getState().setContent(v)}
                onContinueWrite={onContinueWrite}
              />
            )}
          </div>
          <ScrollToTop scroller={scrollerEl} />
        </div>
        {aiPanelOpen && (
          <div style={{ width: aiPanelWidth, flexShrink: 0 }}>
            <AIPanel
              onApplyEdit={applyAiEdit}
              onAppendToDoc={appendToDoc}
              onReplaceSection={replaceSection}
              workspaceRoot={workspaceRoot}
              getSelection={() => {
                const text = getEditorSelectionText()
                return { text, from: 0, to: text.length }
              }}
            />
          </div>
        )}
      </div>
      <SelectionBubble
        workspaceRoot={workspaceRoot}
        onApplyEdit={applyAiEdit}
        getRange={() => {
          const text = getEditorSelectionText()
          if (!text) return null
          return { text, from: 0, to: text.length }
        }}
      />
      {prefsOpen && <PreferencesModal onClose={() => setPrefsOpen(false)} />}
    </div>
  )
}
