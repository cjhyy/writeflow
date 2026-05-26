/**
 * Per-run holder for the renderer's doc snapshot.
 *
 * The renderer sends a fresh DocContext with every `ai:run` IPC call. Custom
 * tools (`get_doc`, `get_selection`, `get_cursor_context`) read from this
 * holder via a runId-keyed Map. We use runId rather than sessionId so chat
 * sessions that overlap with inline shots don't shadow each other.
 */

import type { DocContext } from '../../shared/ai-types.js'

const contexts = new Map<string, DocContext>()

export function setRunContext(runId: string, ctx: DocContext): void {
  contexts.set(runId, ctx)
}

export function getRunContext(runId: string): DocContext | undefined {
  return contexts.get(runId)
}

export function clearRunContext(runId: string): void {
  contexts.delete(runId)
}

/**
 * Resolve the path sandbox root: the workspace folder if open, else the
 * directory of the active doc, else null (no fs tools allowed).
 */
export function sandboxRoot(ctx: DocContext): string | null {
  if (ctx.workspaceRoot) return ctx.workspaceRoot
  if (ctx.filePath) {
    const lastSep = Math.max(ctx.filePath.lastIndexOf('/'), ctx.filePath.lastIndexOf('\\'))
    return lastSep > 0 ? ctx.filePath.slice(0, lastSep) : null
  }
  return null
}
