import { useEffect, useState } from 'react'
import type { AppSettings } from '@shared/types'
import { useUiStore } from '../stores/ui-store'

interface PreferencesModalProps {
  onClose: () => void
}

type Tab = 'general' | 'editor' | 'ai' | 'about'

/**
 * Settings dialog modeled after Typora's preferences pane but rendered as
 * an in-app modal (no second BrowserWindow). Reads from main on mount,
 * writes patches back via api.settings.update — changes take effect
 * immediately because the rest of the app subscribes to the settings store.
 *
 * API key is handled separately: never round-tripped through AppSettings
 * (which lives in plain settings.json). It travels through dedicated
 * IPC backed by Electron safeStorage.
 */
export function PreferencesModal({ onClose }: PreferencesModalProps) {
  const [tab, setTab] = useState<Tab>('general')
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [apiKeyDirty, setApiKeyDirty] = useState(false)
  const [showKey, setShowKey] = useState(false)
  const [savingKey, setSavingKey] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)

  useEffect(() => {
    window.api.settings.get().then(setSettings)
    window.api.settings.getApiKey().then((k) => setApiKey(k ?? ''))
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  async function patch<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    if (!settings) return
    const next = await window.api.settings.update({ [key]: value })
    setSettings(next)
    // Apply visual side-effects immediately so the user sees the change
    if (key === 'theme') useUiStore.getState().setTheme(value as AppSettings['theme'])
    if (key === 'editorFontSize') {
      document.documentElement.style.setProperty('--editor-font-size', `${value}px`)
    }
    if (key === 'editorLineHeight') {
      document.documentElement.style.setProperty('--editor-line-height', String(value))
    }
    if (key === 'aiProvider' || key === 'aiBaseUrl' || key === 'aiModel') {
      // Force the next AI run to rebuild its Engine with the new settings.
      void window.api.ai.flush()
    }
  }

  async function saveApiKey() {
    setSavingKey(true)
    try {
      await window.api.settings.setApiKey(apiKey)
      setApiKeyDirty(false)
      void window.api.ai.flush()
    } finally {
      setSavingKey(false)
    }
  }

  async function testConnection() {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await window.api.ai.testConnection()
      if (res.ok) setTestResult(`✓ 连接成功 · ${res.latencyMs} ms`)
      else setTestResult(`✗ ${res.error ?? '失败'}`)
    } finally {
      setTesting(false)
    }
  }

  if (!settings) return null

  return (
    <div className="prefs-backdrop" onMouseDown={onClose}>
      <div className="prefs-card" onMouseDown={(e) => e.stopPropagation()}>
        <header className="prefs-header">
          <h2>偏好设置</h2>
          <button className="prefs-close" onClick={onClose} title="关闭 (Esc)">✕</button>
        </header>

        <div className="prefs-body">
          <nav className="prefs-tabs">
            <TabBtn id="general" current={tab} onClick={setTab}>通用</TabBtn>
            <TabBtn id="editor" current={tab} onClick={setTab}>编辑器</TabBtn>
            <TabBtn id="ai" current={tab} onClick={setTab}>AI</TabBtn>
            <TabBtn id="about" current={tab} onClick={setTab}>关于</TabBtn>
          </nav>

          <section className="prefs-form">
            {tab === 'general' && (
              <>
                <Row label="主题">
                  <select
                    value={settings.theme}
                    onChange={(e) => patch('theme', e.target.value as AppSettings['theme'])}
                  >
                    <option value="light">Light（明亮）</option>
                    <option value="dark">Dark（暗色）</option>
                    <option value="sepia">Sepia（米黄）</option>
                  </select>
                </Row>

                <Row label="字号" hint={`${settings.editorFontSize} px`}>
                  <input
                    type="range" min={13} max={22} step={1}
                    value={settings.editorFontSize}
                    onChange={(e) => patch('editorFontSize', Number(e.target.value))}
                  />
                </Row>

                <Row label="行距" hint={settings.editorLineHeight.toFixed(2)}>
                  <input
                    type="range" min={1.3} max={2.2} step={0.05}
                    value={settings.editorLineHeight}
                    onChange={(e) => patch('editorLineHeight', Number(e.target.value))}
                  />
                </Row>

                <Row label="字体">
                  <select
                    value={settings.editorFontFamily}
                    onChange={(e) => patch('editorFontFamily', e.target.value)}
                  >
                    <option value="system">系统默认（PingFang / SF）</option>
                    <option value="serif">衬线（Source Han / Georgia）</option>
                    <option value="mono">等宽（JetBrains Mono）</option>
                  </select>
                </Row>
              </>
            )}

            {tab === 'editor' && (
              <>
                <Row label="自动保存">
                  <input
                    type="checkbox"
                    checked={settings.autoSave}
                    onChange={(e) => patch('autoSave', e.target.checked)}
                  />
                </Row>

                <Row label="自动保存间隔" hint={`${settings.autoSaveDelayMs} 毫秒`}>
                  <input
                    type="range" min={500} max={5000} step={100}
                    value={settings.autoSaveDelayMs}
                    onChange={(e) => patch('autoSaveDelayMs', Number(e.target.value))}
                    disabled={!settings.autoSave}
                  />
                </Row>

                <Row label="默认开启专注模式">
                  <input
                    type="checkbox"
                    checked={settings.focusModeDefault}
                    onChange={(e) => patch('focusModeDefault', e.target.checked)}
                  />
                </Row>

                <Row label="默认开启打字机模式">
                  <input
                    type="checkbox"
                    checked={settings.typewriterDefault}
                    onChange={(e) => patch('typewriterDefault', e.target.checked)}
                  />
                </Row>
              </>
            )}

            {tab === 'ai' && (
              <>
                <Row label="服务提供商">
                  <select
                    value={settings.aiProvider}
                    onChange={(e) => {
                      const v = e.target.value as AppSettings['aiProvider']
                      patch('aiProvider', v)
                      if (v === 'openrouter') patch('aiBaseUrl', 'https://openrouter.ai/api/v1')
                      else if (v === 'openai') patch('aiBaseUrl', 'https://api.openai.com/v1')
                    }}
                  >
                    <option value="openrouter">OpenRouter</option>
                    <option value="openai">OpenAI</option>
                    <option value="custom">自定义</option>
                  </select>
                </Row>

                <Row label="Base URL">
                  <input
                    type="text"
                    value={settings.aiBaseUrl}
                    onChange={(e) => patch('aiBaseUrl', e.target.value)}
                    placeholder="https://openrouter.ai/api/v1"
                  />
                </Row>

                <Row label="模型">
                  <input
                    type="text"
                    value={settings.aiModel}
                    onChange={(e) => patch('aiModel', e.target.value)}
                    placeholder="anthropic/claude-sonnet-4"
                  />
                </Row>

                <Row label="API Key" hint="本地加密存储，不会进入 settings.json">
                  <div className="prefs-key-row">
                    <input
                      type={showKey ? 'text' : 'password'}
                      value={apiKey}
                      onChange={(e) => { setApiKey(e.target.value); setApiKeyDirty(true) }}
                      placeholder="sk-..."
                    />
                    <button
                      className="prefs-btn ghost"
                      onClick={() => setShowKey((v) => !v)}
                      type="button"
                    >
                      {showKey ? '隐藏' : '显示'}
                    </button>
                    <button
                      className="prefs-btn primary"
                      onClick={saveApiKey}
                      disabled={!apiKeyDirty || savingKey}
                      type="button"
                    >
                      {savingKey ? '保存中…' : '保存'}
                    </button>
                  </div>
                </Row>

                <Row label="连接测试" hint={testResult ?? '验证 API Key 是否生效'}>
                  <button
                    className="prefs-btn ghost"
                    type="button"
                    onClick={testConnection}
                    disabled={testing || !apiKey || apiKeyDirty}
                  >
                    {testing ? '测试中…' : '测试'}
                  </button>
                </Row>

                <p className="prefs-note">
                  支持的入口：选区浮动菜单（改写/扩写/翻译）、⌘J 续写、右侧 AI 对话面板。
                </p>
              </>
            )}

            {tab === 'about' && (
              <div className="prefs-about">
                <h3>WriteFlow</h3>
                <p className="prefs-version">v0.1.0</p>
                <p>专注的 Markdown 桌面编辑器</p>
                <p>
                  <a href="#" onClick={(e) => { e.preventDefault(); window.open('https://github.com/cjhyy/writeflow', '_blank') }}>
                    GitHub 仓库 ↗
                  </a>
                </p>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

function TabBtn({ id, current, onClick, children }: { id: Tab; current: Tab; onClick: (t: Tab) => void; children: React.ReactNode }) {
  return (
    <button
      className={`prefs-tab ${current === id ? 'active' : ''}`}
      onClick={() => onClick(id)}
    >
      {children}
    </button>
  )
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="prefs-row">
      <div className="prefs-row-label">
        <span>{label}</span>
        {hint && <span className="prefs-row-hint">{hint}</span>}
      </div>
      <div className="prefs-row-control">{children}</div>
    </div>
  )
}
