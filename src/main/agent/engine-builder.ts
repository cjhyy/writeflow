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
    // Isolate from the host's code-shell CLI config: 'isolated' scope makes
    // the SDK skip ~/.code-shell/settings.json AND any project .code-shell —
    // so WriteFlow's agent doesn't inherit the user's CLI providers, hooks,
    // permission rules, or MCP servers. (rc.1+ feature.)
    settingsScope: 'isolated',
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
    // The default preset injects a large CLI-developer tool set (Skill, Bash,
    // Write, Edit, Agent, Cron, REPL, MCP, …). `enabledBuiltinTools` only ADDS
    // to the preset, so to get a clean surface we must DISABLE the rest
    // explicitly. We keep TodoWrite (drives the agent's progress checklist →
    // status dot) and WebSearch/WebFetch (let it look up facts while writing);
    // everything else is off so the agent uses our writing tools, not codeshell
    // CLI tools. The 8 custom tools (get_doc, stream_append, …) are registered
    // separately and aren't part of the builtin set.
    enabledBuiltinTools: ['TodoWrite', 'WebSearch', 'WebFetch'],
    disabledBuiltinTools: [
      'Read', 'Write', 'Edit', 'ApplyPatch', 'Glob', 'Grep', 'Bash',
      'AskUserQuestion', 'Agent', 'AgentCancel', 'EnterPlanMode', 'ExitPlanMode',
      'ToolSearch', 'Sleep', 'Config', 'CronCreate', 'CronDelete', 'CronList',
      'Skill', 'MCPTool', 'ListMcpResources', 'ReadMcpResource', 'RemoteTrigger',
      'REPL', 'PowerShell', 'EnterWorktree', 'ExitWorktree', 'NotebookEdit',
      'LSP', 'Brief', 'Arena',
    ],
    appendSystemPrompt: appendPrompt,
    headless: true,
    isSubAgent: false,
  })

  for (const tool of buildTools(toolHost)) {
    engine.registerCustomTool(tool.definition, tool.execute)
  }

  return engine
}
