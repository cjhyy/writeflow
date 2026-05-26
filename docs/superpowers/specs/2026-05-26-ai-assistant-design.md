# WriteFlow AI Assistant — Design (v1)

**Date:** 2026-05-26
**Author:** maki
**Status:** Draft for review
**Scope:** Integrate `@cjhyy/code-shell-core@0.5.0-rc.0` into WriteFlow as a first-class AI writing assistant.

---

## 1. Goal

Give a Typora-style markdown editor the same AI capabilities that make Cursor/Notion/Lex feel productive — without losing the calm single-window editing experience that WriteFlow is built around.

**One agent. Many tools. Two entry points (inline + panel).**

The agent is identical across entry points; only the system prompt's "current intent" and the user message change. This is the key simplification — there is no `writeDoc` agent vs. `organize` agent. There is one agent with a tool belt, and the *user gesture* tells it what to do.

---

## 2. v1 Feature Set

Distilled from a survey of Notion AI / Cursor / Lex / Obsidian Copilot / Reflect. Five features ship in v1:

| # | Feature | Entry point | Description |
|---|---------|-------------|-------------|
| F1 | **Selection actions** | Floating bubble on selection | 6 fixed actions (Rewrite / Shorten / Expand / Fix grammar / Translate / Change tone) + free-form "Ask". Diff preview before accept. |
| F2 | **AI side panel** | Right sidebar, toggleable | Multi-turn chat. Sees the current doc. Can call tools to read other files, propose edits, etc. 4 preset prompts at the bottom. |
| F3 | **Continue writing** | `Tab` at end-of-line in empty position, or `/continue` | Streams 1–3 sentences forward from cursor context (~800 chars before). |
| F4 | **Slash menu** (`/ai …`) | Inside editor | Mirrors selection actions + custom user prompts. |
| F5 | **Organize folder** | Right-click in file sidebar → "AI: organize this folder" | Multi-turn agent task: reads all .md files in folder, proposes a new structure (rename/move/merge), shows plan, user approves before any write. |

**Out of v1 (explicitly):** semantic search / backlinks (needs embeddings infra), workspace-wide auto-tagging, image generation, voice.

---

## 3. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Renderer (React)                                            │
│  ┌──────────────┐  ┌─────────────┐  ┌────────────────────┐  │
│  │ SelectionBub │  │ AIPanel.tsx │  │ slash-menu/F3 hooks│  │
│  │ ble.tsx      │  │             │  │                    │  │
│  └──────┬───────┘  └──────┬──────┘  └─────────┬──────────┘  │
│         └──────────────────┴───────────────────┘            │
│                          │ window.api.ai.*                  │
└──────────────────────────┼──────────────────────────────────┘
                           │ IPC (contextBridge)
┌──────────────────────────┼──────────────────────────────────┐
│ Main (Node, Electron)    ▼                                  │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ agent-service.ts                                       │ │
│  │   • holds a single Engine instance (lazy-init)         │ │
│  │   • registers custom tools (§4)                        │ │
│  │   • streams tokens + tool calls back via               │ │
│  │     webContents.send('ai:event', …)                    │ │
│  │   • IPC handlers: ai:run, ai:cancel, ai:resetSession   │ │
│  └─────────────────┬──────────────────────────────────────┘ │
│                    │                                        │
│  ┌─────────────────┴─────────┐  ┌────────────────────────┐  │
│  │ @cjhyy/code-shell-core     │  │ existing services      │  │
│  │   Engine + LLM client      │  │ file-service.ts        │  │
│  │                            │  │ settings-service.ts    │  │
│  └────────────────────────────┘  └────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

Key choices:

- **Use `Engine` directly, not `defineProduct`/`RunManager`.** WriteFlow is interactive (the user is in the loop every turn). `RunManager` is for queued background runs and adds complexity we don't need. `defineProduct` is convenient but assumes a CLI-style submit/resume model. The bare `Engine` matches our needs: stream a single conversation turn, with custom tools, sending events to the renderer.
- **Two session shapes, same Engine class.**
  - *Chat session* (F2 panel): one persistent Engine per opened panel. `sessionId` identifies it. Transcript accumulates across turns. Closing the panel or switching docs disposes it.
  - *Inline session* (F1/F3/F4/F5): ephemeral Engine per shot. No `sessionId`. One turn, one tool call expected (`propose_edit`), then dispose. F5 organize is also inline but allowed multiple tool calls within that single turn.
- **All tool execution happens in main.** Renderer never touches the filesystem directly via the agent path; tools that "edit the current doc" send IPC events back to the renderer (`ai:applyEdit`) which the editor component handles. This preserves the single-source-of-truth pattern WriteFlow already uses for `document-store`.

---

## 4. Custom Tools (the agent's hands)

Eight tools total. Three categories:

**Doc-aware tools (operate on the file the user is currently editing):**

| Tool | Args | Purpose |
|------|------|---------|
| `get_doc` | — | Returns full content + filePath + dirty flag of the active doc. |
| `get_selection` | — | Returns the current selection (text + range). Empty string if no selection. |
| `get_cursor_context` | `{ chars_before: number }` | Returns N chars before the cursor. For F3 continue-writing. |
| `propose_edit` | `{ kind: 'replace_selection' \| 'insert_at_cursor' \| 'replace_range', text, range? }` | **Does not write.** Sends a diff-preview event to renderer. Renderer applies on accept. |

**Workspace tools (read-only file system):**

| Tool | Args | Purpose |
|------|------|---------|
| `read_file` | `{ path }` | Reads any .md/.markdown file. Constrained to the workspace root if one is open, else any path. |
| `list_folder` | `{ path? }` | Wraps existing `listMarkdownInFolder`. Returns the same `DirEntry[]` the sidebar uses. |

**Write tools (used by F5 organize):**

| Tool | Args | Purpose |
|------|------|---------|
| `write_file` | `{ path, content }` | Atomic write (reuses `atomicWrite`). Always requires user approval — see §6. |
| `move_file` | `{ from, to }` | Rename/move. User approval required. |

All custom tools live in `src/main/agent/tools/`. Each file is one tool, ~30-60 lines, with the same shape as `examples/prd-agent/src/tools.ts`.

Implementation note: doc-aware tools need to know "what is the current doc?" — the renderer passes `docContext = { filePath, content, selection, cursorOffset }` with every `ai:run` IPC call. Agent-service stores it on the Engine's request scope so tools can read it via a closure.

---

## 5. System Prompt

Single base prompt plus one of four "intent" appendices selected per turn:

```
{base}                       ← writer-persona, markdown rules, tool list
+
{intent-fragment}            ← varies by entry point:
  - inline-rewrite           (F1: "the user selected text; apply X transformation; call propose_edit once")
  - inline-continue          (F3: "continue from cursor context; 1-3 sentences; call propose_edit once")
  - chat                     (F2: "multi-turn conversation; ask before editing; use tools as needed")
  - organize                 (F5: "read all files in folder, propose a plan, ASK before any write/move")
```

The base prompt enforces:
- Output is markdown.
- Don't fabricate facts. If asked to expand, stay close to the user's voice and existing content.
- Match the document's language (if the doc is in Chinese, respond in Chinese).
- For inline actions: call `propose_edit` exactly once and stop. No commentary.
- For chat: be terse. Don't apologize. Don't restate the user's question.

Prompt files live at `src/main/agent/prompts/{base,inline-rewrite,inline-continue,chat,organize}.md` so they can be edited without a rebuild during dev (read at engine-build time).

---

## 6. Permissions & Safety

The agent SDK has a permission system. We wire it as:

| Tool | Permission |
|------|------------|
| `get_doc`, `get_selection`, `get_cursor_context`, `read_file`, `list_folder` | **allow** (read-only) |
| `propose_edit` | **allow** — it's a proposal, the user still accepts/rejects in the diff UI |
| `write_file`, `move_file` | **ask** — surfaces an approval dialog in the renderer before executing |

Permission UI: a modal in the renderer ("AI wants to write `notes/draft.md` (1,240 chars). Allow once / Allow for this task / Reject."). Implemented as another `ai:event` variant.

Path sandboxing in tools: paths must resolve inside the **sandbox root**, defined as:
1. The workspace folder if one is open.
2. Else, the directory of the active doc.
3. Else (untitled buffer, no workspace), only `get_doc` / `get_selection` / `get_cursor_context` / `propose_edit` are available — file-system tools refuse with `"No workspace or saved doc; open or save a file first."` Returned as a tool result (not thrown), so the LLM can recover by telling the user.

---

## 7. Streaming & Events

The renderer drives one IPC call per user action:

```ts
window.api.ai.run({
  intent: 'inline-rewrite' | 'inline-continue' | 'chat' | 'organize',
  docContext: { filePath, content, selection, cursorOffset, workspace? },
  message: string,            // user prompt or "Rewrite", etc.
  sessionId?: string,         // chat panel passes the same id across turns
}) → Promise<{ runId: string }>
```

Main streams events back via `webContents.send('ai:event', e)`:

```ts
type AiEvent =
  | { type: 'token', runId, text }
  | { type: 'tool_call', runId, name, args }
  | { type: 'tool_result', runId, name, ok, summary }
  | { type: 'propose_edit', runId, kind, text, range? }
  | { type: 'permission_request', runId, tool, args, reqId }
  | { type: 'done', runId, terminalReason }
  | { type: 'error', runId, message }
```

The renderer keeps a `Map<runId, listeners>` so multiple in-flight runs (inline + panel) don't interfere.

Cancel: `window.api.ai.cancel(runId)` → main calls `Engine.abort()` for that turn.

---

## 8. UI Components

Three new React components, one modified:

| File | Status | Purpose |
|------|--------|---------|
| `src/renderer/src/components/AIPanel.tsx` | new | Right-side panel. Toggleable from titlebar + Cmd+J. Renders message list, streaming tokens, tool-call cards, input box, 4 preset prompts. |
| `src/renderer/src/components/SelectionBubble.tsx` | new | Floats above selection. Buttons for 6 actions + "Ask…". Mounts via portal anchored to selection rect. |
| `src/renderer/src/components/AIDiffPreview.tsx` | new | Inline overlay: red strikethrough old + green new + Accept/Reject. Used by `propose_edit` events. |
| `src/renderer/src/components/Editor.tsx` | modified | Hook up selection bubble, slash menu (`/ai`), Tab-at-EOL continue. Expose an imperative API (`applyProposedEdit`, `getCursorContext`) called from AIPanel. |
| `src/renderer/src/components/PreferencesModal.tsx` | modified | Add an "AI" tab: provider/baseUrl/model/API key fields. (Provider list comes from `aiProvider` enum already present.) |

State management: one new Zustand store `ai-store.ts` for chat session (messages, runId-in-flight, pending edits, permission requests). Inline actions don't need the store — they use local component state, since they're modal/transient.

---

## 9. Settings & API Key

Already in place:
- `AppSettings.aiProvider | aiBaseUrl | aiModel` ✅
- Encrypted `apiKey.bin` via `safeStorage` ✅
- IPC handlers `settings:get/update/getApiKey/setApiKey` ✅

**One new field** (`aiPanelWidth: number`, default 360) added to `AppSettings`. Otherwise no new settings infrastructure needed. Add UI for a new "AI" section inside `PreferencesModal.tsx` with these fields:

- Provider: dropdown (OpenRouter / OpenAI / Custom)
- Base URL: text (defaults populated per provider)
- Model: text with a quick-pick of common models
- API Key: password input, shows `••••` when set, "Test connection" button

When the user changes any of these, agent-service tears down its cached Engine so the next run picks up the new config.

---

## 10. Module Layout (new files)

```
src/main/
  agent/
    index.ts                   ← exports registerAgentHandlers()
    agent-service.ts           ← Engine factory + IPC handlers + event streaming
    engine-builder.ts          ← composes Engine config from settings + intent
    doc-context.ts             ← per-turn DocContext shape + storage
    prompts/
      base.md
      inline-rewrite.md
      inline-continue.md
      chat.md
      organize.md
    tools/
      get-doc.ts
      get-selection.ts
      get-cursor-context.ts
      propose-edit.ts
      read-file.ts
      list-folder.ts
      write-file.ts
      move-file.ts
      index.ts                 ← collects all tools

src/preload/
  index.ts                     ← MODIFIED: add window.api.ai.*

src/shared/
  ai-types.ts                  ← AiEvent, AiRunInput, AiIntent, DocContext

src/renderer/src/
  stores/
    ai-store.ts                ← new (chat session state)
  components/
    AIPanel.tsx                ← new
    SelectionBubble.tsx        ← new
    AIDiffPreview.tsx          ← new
    Editor.tsx                 ← MODIFIED (slash menu, selection hook, applyEdit API)
    PreferencesModal.tsx       ← MODIFIED (AI tab)
    TitleBar.tsx               ← MODIFIED (panel toggle button)
```

`src/main/index.ts` adds one line in `app.whenReady`: `registerAgentHandlers()`.

---

## 11. Error Handling

The LLM provider can fail in several ways. Each maps to a user-visible state:

| Cause | Surface |
|-------|---------|
| Missing API key | The AI panel and selection bubble show "Set up API key in Preferences →". Click opens preferences AI tab. |
| Network error / 5xx | Inline error in message list ("Connection failed. Retry?"). No crash. |
| Rate limit (429) | Same as above, but message mentions rate limit. Disable input for 5s. |
| Tool error (bad path, etc.) | Returned to the LLM as the tool result — it can recover. Not surfaced to user unless terminal. |
| Permission denied by user | Returned to LLM with `"User denied write."`. Agent typically apologizes and stops. |

The Engine's `EngineResult.terminalReason` ends each turn; we map known reasons to UI states. Unknown reasons just close the run with a generic "Done."

---

## 12. What we are deliberately NOT doing

- **No embeddings / semantic search in v1.** Architected so `read_file`/`list_folder` can be joined later by a `search_semantic` tool, but no index built yet.
- **No agent-driven multi-file edits without confirmation.** `organize` plans, then asks. There is no "agent auto-merges 12 notes" path.
- **No background agents / queued runs.** Everything is foreground, current-window only. `RunManager` is not used.
- **No MCP servers in v1.** The codeshell SDK supports them, but exposing MCP config is its own UX problem. Defer.
- **No conversation history persistence.** Closing the panel = forgetting. Persistence is a v2 concern (where to store, how to attach to a doc, conflict with autosave, etc.).
- **No streaming into the document itself for chat.** F3 (continue writing) streams directly into the editor; F2 chat streams into the panel and only mutates the doc via `propose_edit` (user-accepted).

---

## 13. Resolved design decisions (avoiding ambiguity at implementation time)

1. **F5 organize entry point:** Right-click context menu on a folder in the file sidebar. Also exposed as "AI → Organize folder…" in the menubar for discoverability. (Both — no extra implementation cost since they call the same IPC.)
2. **Selection bubble vs. slash menu:** Ship both. They share the same six actions and call the same agent intent; only the trigger differs. Slash menu also exposes user-defined custom prompts (deferred to a small follow-up — the API surface includes it but the prefs UI for editing prompts is v1.1).
3. **F3 continue-writing trigger:** `Cmd+J` (mac) / `Ctrl+J` (win/linux). Not `Tab` (collides with Milkdown list indent). Not `+++` (parser ambiguity). The same shortcut also toggles the AI panel — single press inserts continuation if there's no selection and the panel is closed; opens panel otherwise. Single binding, dual purpose, deterministic by state.
4. **AI panel default width:** 360px. Toggleable. Remembered in `AppSettings.aiPanelWidth` (new field, default 360).
5. **Diff preview lifetime:** 30 seconds idle → auto-reject. Prevents stale proposals from cluttering the editor if the user walks away.
