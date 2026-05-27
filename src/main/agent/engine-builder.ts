/**
 * Build a code-shell Engine wired with our custom tools and prompts.
 *
 * One factory per run (inline turns) or per session (chat panel). The
 * `toolHost` carries the runId-scoped event emitter that tools call into.
 */

import { Engine } from '@cjhyy/code-shell-core'
import { app } from 'electron'
import path from 'node:path'
import type { AppSettings } from '../../shared/types.js'
import type { AiIntent } from '../../shared/ai-types.js'
import { BASE_PROMPT } from './prompts/index.js'
import { buildTools, type ToolHostHooks } from './tools/index.js'

export interface EngineSetup {
  settings: AppSettings
  apiKey: string
  /** Intent used only to size maxTurns; the per-turn intent prompt is prepended to each user message instead of the system prompt. */
  intent: AiIntent
  toolHost: ToolHostHooks
}

/**
 * Map AppSettings.aiProvider → code-shell LLMConfig.provider. The SDK
 * understands "openai" and "anthropic" as protocol families; OpenRouter is
 * OpenAI-compatible.
 */
function providerFromSettings(s: AppSettings): { provider: string; providerKind?: string } {
  if (s.aiProvider === 'openrouter') return { provider: 'openai', providerKind: 'openrouter' }
  if (s.aiProvider === 'openai') return { provider: 'openai', providerKind: 'openai' }
  return { provider: 'openai', providerKind: 'openai' }
}

function sessionDir(): string {
  return path.join(app.getPath('userData'), 'ai-sessions')
}

export function buildEngine(setup: EngineSetup): Engine {
  const { settings, apiKey, intent, toolHost } = setup
  const { provider, providerKind } = providerFromSettings(settings)
  const appendPrompt = BASE_PROMPT

  const engine = new Engine({
    llm: {
      provider,
      providerKind,
      model: settings.aiModel,
      apiKey,
      baseUrl: settings.aiBaseUrl,
      enableStreaming: true,
    },
    cwd: app.getPath('userData'),
    // bypassPermissions makes the SDK classifier allow every tool without an
    // interactive backend (which we don't wire — this is a desktop UI, not a
    // CLI). Safety for the only destructive tools (write_file / move_file)
    // lives INSIDE those tools: they call host.requestPermission, which
    // surfaces an in-panel approval card. So "bypass" here means "don't
    // double-gate at the classifier"; it does not mean "no approval ever".
    permissionMode: 'bypassPermissions',
    maxTurns:
      intent === 'organize'
        ? 30
        : intent === 'write-doc' || intent === 'auto'
          ? 40
          : intent.startsWith('inline-')
            ? 3
            : 15,
    sessionStorageDir: sessionDir(),
    // Disable everything the SDK ships by default; we want a clean tool surface.
    enabledBuiltinTools: [],
    appendSystemPrompt: appendPrompt,
    headless: true,
    isSubAgent: false,
  })

  for (const tool of buildTools(toolHost)) {
    engine.registerCustomTool(tool.definition, tool.execute)
  }

  return engine
}
