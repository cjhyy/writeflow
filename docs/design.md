# WriteFlow Design Doc

> Single-user Markdown desktop editor with Typora-style writing experience and AI assistance.

## 1. What this is

WriteFlow is a desktop application for writing Markdown documents. It targets the same experience as Typora — a clean single-column editor where Markdown renders inline as you type — and layers a focused set of AI writing tools on top.

It runs locally as an Electron application. There is no backend server, no account system, no cloud sync. Your `.md` files live on your disk and stay yours.

## 2. Who it is for

Currently: the author, as a daily writing tool. The product direction will be validated by personal use before any wider distribution.

## 3. Why not just use Typora / MarkText / Obsidian

- **Typora** is closed-source and has no AI integration. We want to embed AI commands directly into the writing flow.
- **MarkText** is excellent but unmaintained and lacks AI.
- **Obsidian / Logseq** are knowledge-management tools whose UI complexity gets in the way of the "open file, write, save" loop.
- **Cursor / Windsurf** are code editors retrofitted with AI; they do not feel right for prose.

The bet: a small, focused desktop app combining Typora's writing feel with a thoughtful AI integration is a meaningful product, even just for one user.

## 4. Scope

### 4.1 In scope (MVP)

1. Electron desktop application, runs on macOS first.
2. Open / new / save / save-as for `.md` files.
3. Typora-style single-column WYSIWYG Markdown editor.
4. Auto-save with debounced atomic write.
5. Recent-files list.
6. Standard editor shortcuts (`Cmd+S`, `Cmd+O`, `Cmd+N`, `Cmd+B`, `Cmd+I`).
7. AI command palette (`Cmd+K`) for selected text: polish, summarize, continue, translate, formalize, casualize.
8. AI side panel for asking questions about the current document.
9. AI results always preview first; user must apply before editing buffer is mutated.
10. HTML rendering for content **inside** Markdown (raw HTML tags render as expected).
11. Opening a standalone `.html` file shows a **read-only sandboxed preview** (no script execution).
12. AI-returned HTML content renders in the AI preview panel (no script execution).

### 4.2 Explicitly out of scope

- Editing HTML files (preview only).
- Executing JavaScript inside any rendered HTML / AI artifact.
- User accounts, cloud sync, multi-device.
- Collaboration, comments, suggestions.
- Plugin marketplace.
- File-tree / workspace / multi-document tabs.
- Knowledge graph / mindmap features (deferred to the archived [mindMap project](https://github.com/cjhyy/mindMap)).
- Tag systems, full-text search across folders.
- Mobile, web build, browser extension.
- Backend / Agent framework / persistent server-side state.

## 5. Architecture

### 5.1 Processes

```
┌──────────────────────────────────────────┐
│  Main process (Node)                     │
│  ────────────────────                    │
│  - Window lifecycle                      │
│  - File IO (atomic writes)               │
│  - System dialogs (open / save)          │
│  - App settings (JSON file)              │
│  - LLM HTTP calls (when AI is added)     │
│  - API key access (safeStorage)          │
└──────────────────────────────────────────┘
                  ↕  IPC
┌──────────────────────────────────────────┐
│  Preload (sandboxed bridge)              │
│  ────────────────────                    │
│  Exposes window.api as a whitelist.      │
│  Nothing else leaks into renderer.       │
└──────────────────────────────────────────┘
                  ↕
┌──────────────────────────────────────────┐
│  Renderer (React)                        │
│  ────────────────────                    │
│  - Editor surface (Milkdown Crepe)       │
│  - HTML preview panel                    │
│  - AI command UI                         │
│  - Local Zustand store                   │
└──────────────────────────────────────────┘
```

Security: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. API keys never enter the renderer process.

### 5.2 Tech stack

| Layer | Choice | Reason |
|---|---|---|
| Shell | Electron | Mature, cross-platform |
| Build | electron-vite | Fast HMR, sensible defaults |
| UI | React 19 + TypeScript | Familiar from prior project |
| Style | Tailwind CSS | Utility-first, low overhead |
| State | Zustand | Simple, no boilerplate |
| Editor | Milkdown Crepe | ProseMirror-based, Markdown-first, closest to Typora out of the box |
| Markdown | Milkdown's bundled marked / remark | Default parser pipeline |
| HTML preview | iframe with `sandbox=""` | Static rendering, no JS execution |
| LLM | OpenRouter (deferred to Phase 4) | One key, many models |

### 5.3 Data model

```ts
interface DocumentState {
  filePath: string | null
  fileName: string
  markdown: string         // current buffer
  savedMarkdown: string    // last persisted to disk
  dirty: boolean
  lastSavedAt: string | null
}

interface RecentFile {
  filePath: string
  fileName: string
  lastOpenedAt: string
}

interface AppSettings {
  theme: 'light' | 'dark' | 'system'
  autoSave: boolean
  autoSaveDelayMs: number   // default 1500
  editorFontSize: number    // default 16
  editorLineHeight: number  // default 1.7
  aiProvider?: 'openrouter' // deferred
  aiModel?: string          // deferred
}
```

### 5.4 File IO contract

- **Read**: UTF-8 only. Reject binary files.
- **Write**: atomic. Write to `.{name}.md.tmp` → fsync → rename → original. Never leave a partial file.
- **Recent files**: stored in `~/Library/Application Support/writeflow/recent.json` (macOS), max 20 entries.
- **Settings**: stored in `~/Library/Application Support/writeflow/settings.json`.
- **No frontmatter injection**: we never modify user Markdown by adding our own metadata.

## 6. Editor experience requirements

### 6.1 Visual

- Single column, content `max-width: 760px`, horizontally centered.
- Default font: Inter (UI) + LXGW WenKai (中文正文).
- Line-height 1.7, paragraph margin `0.8em 0`.
- `text-rendering: optimizeLegibility`.
- No persistent sidebar. No file tree. No status bar (initially).
- Title bar shows filename and dirty marker only.

### 6.2 Markdown elements supported in v1

- Headings H1-H6
- Paragraphs
- Bold / italic / strikethrough
- Ordered / unordered / task lists
- Blockquote
- Inline code, fenced code blocks (with syntax highlighting)
- Horizontal rule
- Links and images (basic rendering)
- Tables (Milkdown Crepe default)
- Raw HTML tags inside Markdown (rendered, not executed)

### 6.3 Deferred

- Mermaid diagrams
- KaTeX math
- Frontmatter editing UI
- Footnotes
- Document outline / TOC

### 6.4 Keyboard

| Shortcut | Action |
|---|---|
| `Cmd+N` | New |
| `Cmd+O` | Open |
| `Cmd+S` | Save |
| `Cmd+Shift+S` | Save as |
| `Cmd+B` | Bold |
| `Cmd+I` | Italic |
| `Cmd+K` | AI command palette (Phase 4) |
| `Cmd+/` | Toggle source mode (deferred) |

## 7. HTML rendering

### 7.1 Inline HTML in Markdown

Default Milkdown / remark behavior. `<div>`, `<svg>`, `<table>`, `<details>` etc render normally. No script execution because Milkdown does not evaluate scripts.

### 7.2 Opening a `.html` file

- Detected by file extension at open time.
- Opens in **preview mode** instead of editor mode.
- Renders the HTML inside `<iframe sandbox="" srcdoc={...}>`.
- `sandbox=""` (empty) disables: scripts, forms, popups, top-level navigation, same-origin access.
- User can read styled content; cannot interact, edit, or execute anything.

### 7.3 AI-returned HTML

When AI returns content that contains HTML, the preview panel (Phase 4) renders it in the same sandboxed iframe pattern. User sees the styled output before applying.

## 8. Phased delivery

### Phase 1 — Electron skeleton

Window opens. Menu shows File / Edit / View. Empty editor area. Builds for macOS.

Acceptance: `npm run dev` opens a window; `npm run build` produces a `.dmg`.

### Phase 2 — File IO

New / open / save / save-as. Recent files. Dirty tracking. Quit-with-unsaved prompt. Editor is still just a `textarea`.

Acceptance: full edit-save-reopen loop works on real `.md` files. Atomic writes verified by killing process mid-write.

### Phase 3 — Milkdown Crepe + Typora polish

Replace textarea with Milkdown Crepe. Apply the typography choices in §6.1. Verify the Markdown roundtrip on the existing `legacy-spec.md` does not corrupt structure.

Acceptance: open `docs/legacy-spec.md`, edit, save, diff — only intended changes appear.

### Phase 4 — HTML preview

Detect `.html` on open, route to `HtmlPreview` component instead of editor. Sandboxed iframe. No editor controls visible.

Acceptance: opening an HTML file with `<script>alert(1)</script>` does not execute.

### Phase 5 — AI features (deferred)

`Cmd+K` palette, right-side AI chat panel, OpenRouter integration. All AI output passes through a confirmation preview before mutating the buffer.

### Phase 6 — Polish

Dark mode. Print / export PDF via Electron's `webContents.printToPDF`. Drag-and-drop file open.

## 9. Risks

| Risk | Mitigation |
|---|---|
| Milkdown Crepe roundtrip corrupts user Markdown | Phase 3 acceptance test on legacy-spec.md. If unacceptable, fall back to Tiptap + tiptap-markdown. |
| AI overwrites user content without consent | All AI mutations go through PreviewDiff component; explicit apply button. |
| Renderer leaks API key | API key lives in main process only; AI requests proxied through IPC. |
| Scope creeps back toward knowledge graph | This doc is the contract. New features need explicit scope discussion. |
| Self-built editor feature creep | Use Milkdown Crepe as-is for at least 6 months of real use before considering custom work. |

## 10. Success criteria

You open WriteFlow at least 5 days a week to write something, without thinking about it. Other Markdown editors stop being installed.
