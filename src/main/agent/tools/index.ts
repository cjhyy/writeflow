/**
 * Tool factory for the AI assistant. Each `buildTools()` call produces a
 * fresh CustomTool[] bound to the current run's context + event emitter.
 *
 * The closures inside read DocContext via doc-context.ts (keyed by runId)
 * and call back into the agent service to surface propose_edit /
 * permission_request events on the IPC channel.
 */

import type { CustomTool } from '@cjhyy/code-shell-core'
import type {
  AiEvent,
  AiPermissionResponse,
  AiProposedEdit,
} from '../../../shared/ai-types.js'
import { getRunContext, sandboxRoot } from '../doc-context.js'
import { resolveSandboxed, readMarkdownFile, atomicWrite, listMarkdownInFolder, moveFile } from './fs-ops.js'

export interface ToolHostHooks {
  /** runId scopes all events. */
  runId: string
  /** Emit an event to the renderer. */
  emit: (event: AiEvent) => void
  /**
   * Request permission. Resolves when the renderer responds (or rejects if
   * the run is cancelled).
   */
  requestPermission: (req: {
    tool: string
    args: Record<string, unknown>
    description: string
    riskLevel: 'low' | 'medium' | 'high'
  }) => Promise<AiPermissionResponse>
}

const NO_DOC = 'No active document. Open or save a file first.'
const NO_SANDBOX = 'No workspace or saved doc; file-system tools are unavailable. Open a folder or save the active doc first.'

function buildGetDoc(host: ToolHostHooks): CustomTool {
  return {
    definition: {
      name: 'get_doc',
      description: 'Returns the full markdown content, file path, and selection bounds of the document the user is currently editing.',
      inputSchema: { type: 'object', properties: {} },
      source: 'builtin',
      permissionDefault: 'allow',
      isReadOnly: true,
      isConcurrencySafe: true,
    },
    execute: async () => {
      const ctx = getRunContext(host.runId)
      if (!ctx) return NO_DOC
      return JSON.stringify({
        filePath: ctx.filePath,
        contentLength: ctx.content.length,
        content: ctx.content,
        selection: ctx.selection,
        hasSelection: ctx.selectionText.length > 0,
      })
    },
  }
}

function buildGetSelection(host: ToolHostHooks): CustomTool {
  return {
    definition: {
      name: 'get_selection',
      description: 'Returns the text the user currently has selected in the editor. Empty string if no selection.',
      inputSchema: { type: 'object', properties: {} },
      source: 'builtin',
      permissionDefault: 'allow',
      isReadOnly: true,
      isConcurrencySafe: true,
    },
    execute: async () => {
      const ctx = getRunContext(host.runId)
      if (!ctx) return NO_DOC
      return JSON.stringify({ text: ctx.selectionText, range: ctx.selection })
    },
  }
}

function buildGetCursorContext(host: ToolHostHooks): CustomTool {
  return {
    definition: {
      name: 'get_cursor_context',
      description: 'Returns the N characters of markdown immediately before the cursor. Use this to ground a "continue writing" generation.',
      inputSchema: {
        type: 'object',
        properties: {
          chars_before: {
            type: 'number',
            description: 'How many characters before the cursor to return (default 800, max 4000).',
          },
        },
      },
      source: 'builtin',
      permissionDefault: 'allow',
      isReadOnly: true,
      isConcurrencySafe: true,
    },
    execute: async (args) => {
      const ctx = getRunContext(host.runId)
      if (!ctx) return NO_DOC
      const raw = typeof args.chars_before === 'number' ? args.chars_before : 800
      const n = Math.max(0, Math.min(4000, raw))
      const cursor = ctx.selection.from
      const start = Math.max(0, cursor - n)
      return ctx.content.slice(start, cursor)
    },
  }
}

function buildProposeOutline(host: ToolHostHooks): CustomTool {
  return {
    definition: {
      name: 'propose_outline',
      description:
        'Send a proposed document outline (title + sections) to the UI. The user will edit it and click "开始写", which fires a follow-up turn with outlineApproved=true. You should call this exactly once during write-doc Phase 2, then stop.',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Short document title.' },
          sections: {
            type: 'array',
            description: '3-7 sections.',
            items: {
              type: 'object',
              properties: {
                heading: { type: 'string', description: 'Section heading text (no # prefix).' },
                hint: { type: 'string', description: 'One-line description of what this section covers.' },
              },
              required: ['heading', 'hint'],
            },
          },
        },
        required: ['title', 'sections'],
      },
      source: 'builtin',
      permissionDefault: 'allow',
    },
    execute: async (args) => {
      const title = String(args.title ?? '')
      const sectionsRaw = Array.isArray(args.sections) ? args.sections : []
      const sections = sectionsRaw.map((s) => ({
        heading: String((s as { heading?: unknown }).heading ?? ''),
        hint: String((s as { hint?: unknown }).hint ?? ''),
      }))
      host.emit({ type: 'propose_outline', runId: host.runId, title, sections })
      return 'Outline shown to the user. They will accept (firing a new turn with outlineApproved=true) or edit it.'
    },
  }
}

function buildStreamAppend(host: ToolHostHooks): CustomTool {
  return {
    definition: {
      name: 'stream_append',
      description:
        'Append a chunk of markdown to the active document. Use during write-doc Phase 3 to stream content into the editor block-by-block. Pre-approved for the duration of a write-doc run after the user accepts the outline. Each call should be one paragraph or block (~150-300 chars).',
      inputSchema: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Markdown to append. Include leading/trailing newlines to control spacing.' },
        },
        required: ['text'],
      },
      source: 'builtin',
      permissionDefault: 'allow',
    },
    execute: async (args) => {
      const text = String(args.text ?? '')
      host.emit({ type: 'doc_append', runId: host.runId, text })
      return `Appended ${text.length} chars to the doc.`
    },
  }
}

function buildStreamReplaceSection(host: ToolHostHooks): CustomTool {
  return {
    definition: {
      name: 'stream_replace_section',
      description:
        'Replace a single section of the document, identified by its heading text. The section spans from the matching heading up to the next heading of the same or higher level, exclusive. Use during write-doc Phase 4 (refine).',
      inputSchema: {
        type: 'object',
        properties: {
          heading: { type: 'string', description: 'The exact heading text (no # markers). Must match an existing heading in the doc.' },
          newContent: { type: 'string', description: 'The new section body, INCLUDING its own heading line (e.g. "## New title\\n\\nbody…").' },
        },
        required: ['heading', 'newContent'],
      },
      source: 'builtin',
      permissionDefault: 'allow',
    },
    execute: async (args) => {
      const heading = String(args.heading ?? '')
      const newContent = String(args.newContent ?? '')
      host.emit({ type: 'doc_replace_section', runId: host.runId, heading, newContent })
      return `Section "${heading}" replaced.`
    },
  }
}

function buildProposeEdit(host: ToolHostHooks): CustomTool {
  return {
    definition: {
      name: 'propose_edit',
      description: 'Show a diff preview of a proposed edit. The user will accept or reject — this does NOT write to disk. Use this for every editor-modifying action.',
      inputSchema: {
        type: 'object',
        properties: {
          kind: {
            type: 'string',
            enum: ['replace_selection', 'insert_at_cursor', 'replace_range', 'replace_doc'],
          },
          text: { type: 'string', description: 'New text.' },
          range: {
            type: 'object',
            description: 'Required for kind === "replace_range". Character offsets in the markdown source.',
            properties: {
              from: { type: 'number' },
              to: { type: 'number' },
            },
            required: ['from', 'to'],
          },
        },
        required: ['kind', 'text'],
      },
      source: 'builtin',
      permissionDefault: 'allow',
    },
    execute: async (args) => {
      const kind = args.kind as AiProposedEdit['kind']
      const text = String(args.text ?? '')
      const range = args.range as AiProposedEdit['range']
      if (kind === 'replace_range' && (!range || typeof range.from !== 'number' || typeof range.to !== 'number')) {
        return 'Error: replace_range requires range.from and range.to.'
      }
      host.emit({
        type: 'propose_edit',
        runId: host.runId,
        edit: { kind, text, range },
      })
      return 'Proposed edit shown to the user. They will accept or reject in the UI.'
    },
  }
}

function buildReadFile(host: ToolHostHooks): CustomTool {
  return {
    definition: {
      name: 'read_file',
      description: 'Read a markdown file from the workspace. Paths are sandboxed to the workspace folder (or the active doc\'s directory).',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Absolute or relative path. Relative paths resolve against the sandbox root.' },
        },
        required: ['path'],
      },
      source: 'builtin',
      permissionDefault: 'allow',
      isReadOnly: true,
      isConcurrencySafe: true,
    },
    execute: async (args) => {
      const ctx = getRunContext(host.runId)
      if (!ctx) return NO_DOC
      const root = sandboxRoot(ctx)
      if (!root) return NO_SANDBOX
      const resolved = resolveSandboxed(root, String(args.path ?? ''))
      if (!resolved.ok) return `Error: ${resolved.error}`
      return readMarkdownFile(resolved.path)
    },
  }
}

function buildListFolder(host: ToolHostHooks): CustomTool {
  return {
    definition: {
      name: 'list_folder',
      description: 'List markdown files in a folder (recursive, depth-limited). Paths are sandboxed.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Folder path (absolute or relative to sandbox root). Omit to use the sandbox root.' },
        },
      },
      source: 'builtin',
      permissionDefault: 'allow',
      isReadOnly: true,
      isConcurrencySafe: true,
    },
    execute: async (args) => {
      const ctx = getRunContext(host.runId)
      if (!ctx) return NO_DOC
      const root = sandboxRoot(ctx)
      if (!root) return NO_SANDBOX
      const rel = typeof args.path === 'string' ? args.path : '.'
      const resolved = resolveSandboxed(root, rel)
      if (!resolved.ok) return `Error: ${resolved.error}`
      const entries = await listMarkdownInFolder(resolved.path)
      return JSON.stringify(entries.map((e) => ({ path: e.filePath, name: e.fileName })))
    },
  }
}

function buildWriteFile(host: ToolHostHooks): CustomTool {
  return {
    definition: {
      name: 'write_file',
      description: 'Atomically write a markdown file. Requires user approval each call. Paths are sandboxed.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          content: { type: 'string' },
        },
        required: ['path', 'content'],
      },
      source: 'builtin',
      permissionDefault: 'ask',
    },
    execute: async (args) => {
      const ctx = getRunContext(host.runId)
      if (!ctx) return NO_DOC
      const root = sandboxRoot(ctx)
      if (!root) return NO_SANDBOX
      const path = String(args.path ?? '')
      const content = String(args.content ?? '')
      const resolved = resolveSandboxed(root, path)
      if (!resolved.ok) return `Error: ${resolved.error}`
      const decision = await host.requestPermission({
        tool: 'write_file',
        args: { path: resolved.path, bytes: content.length },
        description: `Write ${resolved.path} (${content.length} chars)`,
        riskLevel: 'medium',
      })
      if (!decision.approved) return 'User denied write.'
      try {
        await atomicWrite(resolved.path, content)
        return `Wrote ${resolved.path} (${content.length} chars).`
      } catch (err) {
        return `Error: ${(err as Error).message}`
      }
    },
  }
}

function buildMoveFile(host: ToolHostHooks): CustomTool {
  return {
    definition: {
      name: 'move_file',
      description: 'Rename or move a file inside the sandbox. Requires user approval. Source and destination must both be inside the sandbox root.',
      inputSchema: {
        type: 'object',
        properties: {
          from: { type: 'string' },
          to: { type: 'string' },
        },
        required: ['from', 'to'],
      },
      source: 'builtin',
      permissionDefault: 'ask',
    },
    execute: async (args) => {
      const ctx = getRunContext(host.runId)
      if (!ctx) return NO_DOC
      const root = sandboxRoot(ctx)
      if (!root) return NO_SANDBOX
      const fromR = resolveSandboxed(root, String(args.from ?? ''))
      const toR = resolveSandboxed(root, String(args.to ?? ''))
      if (!fromR.ok) return `Error: from path: ${fromR.error}`
      if (!toR.ok) return `Error: to path: ${toR.error}`
      const decision = await host.requestPermission({
        tool: 'move_file',
        args: { from: fromR.path, to: toR.path },
        description: `Move ${fromR.path} → ${toR.path}`,
        riskLevel: 'medium',
      })
      if (!decision.approved) return 'User denied move.'
      try {
        await moveFile(fromR.path, toR.path)
        return `Moved ${fromR.path} → ${toR.path}.`
      } catch (err) {
        return `Error: ${(err as Error).message}`
      }
    },
  }
}

export function buildTools(host: ToolHostHooks): CustomTool[] {
  return [
    buildGetDoc(host),
    buildGetSelection(host),
    buildGetCursorContext(host),
    buildProposeEdit(host),
    buildProposeOutline(host),
    buildStreamAppend(host),
    buildStreamReplaceSection(host),
    buildReadFile(host),
    buildListFolder(host),
    buildWriteFile(host),
    buildMoveFile(host),
  ]
}
