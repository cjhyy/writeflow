# Electron AI Markdown Editor 技术文档

## 1. 项目定位

目标是做一个 **Typora 风格的极简 Markdown 编辑器**，同时内置 AI 写作助手。产品核心不是知识库、不是复杂笔记系统，而是：

> 打开一个 Markdown 文件，像在 Typora 里一样安静地写作；需要时，用 AI 对当前文档或选中文本进行续写、润色、总结、翻译和重构。

第一版优先做桌面端，使用 Electron。后续可以与现有 MindMap Agent 的知识图谱、文档生成、节点探索能力打通。

## 2. 竞品与开源参考

### 2.1 MarkText

- GitHub: https://github.com/marktext/marktext
- 定位：开源 Typora 替代品，Electron Markdown 编辑器。
- 可参考：
  - 所见即所得编辑体验。
  - 极简布局。
  - 专注模式、打字机模式。
  - Markdown 文件作为真实数据源。
- 不直接照搬：
  - 项目较老，现代 AI 工作流不足。
  - UI 与工程栈需要按当前 React/TypeScript 体系重做。

### 2.2 Ritemark

- GitHub: https://github.com/ProductoryHQ/ritemark-native
- 定位：Markdown 编辑器 + AI assistant。
- 可参考：
  - AI 终端/侧栏。
  - 本地文件优先。
  - 编辑器与 AI 的协同方式。
- 风险：
  - 基于 VS Code OSS 分支，体量较大。
  - 不适合作为本项目 MVP 架构基础。

### 2.3 Milkdown

- GitHub: https://github.com/Milkdown/milkdown
- 定位：WYSIWYG Markdown editor framework。
- 可参考：
  - Markdown 是一等数据格式。
  - ProseMirror 生态成熟。
  - 适合做 Typora 风格编辑器。
- 建议：
  - MVP 优先使用 Milkdown/Crepe。
  - 当前仓库已有 `frontend/src/components/document/MilkdownEditor.tsx`，可作为验证基础。

### 2.4 MDXEditor

- 官网: https://mdxeditor.dev/editor/docs/overview
- 定位：React WYSIWYG Markdown 组件。
- 可参考：
  - React 集成简单。
  - Markdown 输入输出直接。
- 建议：
  - 作为备选，不作为首选。

### 2.5 Zettlr / Rocketnotes / Moraya

- Zettlr: https://github.com/Zettlr/Zettlr
- Rocketnotes: https://github.com/fynnfluegge/rocketnotes
- Moraya: https://github.com/zouwei/moraya
- 可参考：
  - 文件夹 workspace。
  - 文档搜索。
  - AI 文档问答。
  - 本地优先和多模型设计。
- MVP 不做：
  - 完整知识库。
  - 复杂标签系统。
  - 重型多文档管理。

## 3. MVP 范围

### 3.1 必须做

1. Electron 桌面应用骨架。
2. 打开、新建、保存 `.md` 文件。
3. Typora 风格单栏 WYSIWYG Markdown 编辑。
4. 自动保存。
5. 最近文件列表。
6. 暗色/亮色主题。
7. `Cmd/Ctrl + S` 保存。
8. `Cmd/Ctrl + K` 唤起 AI 命令。
9. 对选中文本执行 AI 操作：
   - 续写
   - 润色
   - 总结
   - 翻译
   - 改成更正式
   - 改成更口语
10. AI 结果先预览，用户确认后再写入编辑器。
11. 右侧可折叠 AI 面板，可以基于当前文档提问。

### 3.2 暂不做

1. 用户账号系统。
2. 云同步。
3. 插件市场。
4. 移动端。
5. 多人协作。
6. 完整知识库图谱。
7. 复杂 Agent 自动改全文。
8. AI 自动保存覆盖用户内容。

## 4. 技术选型

### 4.1 桌面端

- Electron
- electron-vite
- React 19
- TypeScript
- Tailwind CSS
- shadcn/ui
- Zustand

### 4.2 编辑器

首选：

- Milkdown / Crepe

备选：

- Tiptap + Markdown serializer
- MDXEditor

选择标准：

1. Markdown 往返损耗低。
2. 标题、列表、代码块、表格、图片、数学公式稳定。
3. 可获取和替换选区。
4. 可扩展 slash command、floating menu、AI command palette。
5. 大文档性能可接受。

### 4.3 AI

第一版使用 OpenAI-compatible API，优先支持：

- OpenRouter
- OpenAI

后续支持：

- Ollama
- LM Studio
- 自定义 base URL

### 4.4 本地安全

Electron renderer 不直接访问 Node API。

要求：

- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: true`，如果依赖允许
- 文件读写、系统对话框、AI 请求尽量放在 main process
- renderer 通过 preload 暴露受控 API
- API key 不写入普通明文配置文件；MVP 可先放本地配置，后续接 keytar 或 Electron safeStorage

## 5. 建议目录结构

在当前仓库新增 `desktop/`，避免影响现有 `frontend/` 与 `backend/`。

```text
mindMap/
├── desktop/
│   ├── package.json
│   ├── electron.vite.config.ts
│   ├── tsconfig.json
│   ├── src/
│   │   ├── main/
│   │   │   ├── index.ts
│   │   │   ├── menu.ts
│   │   │   ├── ipc.ts
│   │   │   ├── file-service.ts
│   │   │   ├── settings-service.ts
│   │   │   └── ai-service.ts
│   │   ├── preload/
│   │   │   └── index.ts
│   │   └── renderer/
│   │       ├── index.html
│   │       ├── src/
│   │       │   ├── main.tsx
│   │       │   ├── App.tsx
│   │       │   ├── styles.css
│   │       │   ├── api/
│   │       │   │   └── desktop-api.ts
│   │       │   ├── components/
│   │       │   │   ├── AppShell.tsx
│   │       │   │   ├── EditorSurface.tsx
│   │       │   │   ├── AiCommandMenu.tsx
│   │       │   │   ├── AiPanel.tsx
│   │       │   │   ├── PreviewDiff.tsx
│   │       │   │   ├── TitleBar.tsx
│   │       │   │   └── StatusBar.tsx
│   │       │   ├── editor/
│   │       │   │   ├── MarkdownEditor.tsx
│   │       │   │   ├── editor-commands.ts
│   │       │   │   └── markdown-utils.ts
│   │       │   ├── stores/
│   │       │   │   ├── document-store.ts
│   │       │   │   ├── ai-store.ts
│   │       │   │   └── settings-store.ts
│   │       │   └── types/
│   │       │       └── index.ts
│   └── README.md
├── frontend/
├── backend/
└── data/
```

## 6. 核心架构

### 6.1 进程职责

#### Main process

负责：

- 创建窗口。
- 应用菜单。
- 打开/保存系统文件对话框。
- 文件读写。
- 最近文件。
- 应用配置。
- AI API 请求。
- 安全边界。

#### Preload

只暴露白名单 API：

```ts
window.desktopApi = {
  file: {
    newFile(): Promise<DocumentState>
    openFile(): Promise<DocumentState | null>
    saveFile(input: SaveFileInput): Promise<SaveFileResult>
    saveFileAs(input: SaveFileInput): Promise<SaveFileResult>
    readRecentFiles(): Promise<RecentFile[]>
  },
  ai: {
    runCommand(input: AiCommandInput): Promise<AiCommandResult>
    streamChat(input: AiChatInput): AsyncIterable<AiStreamEvent>
  },
  settings: {
    get(): Promise<AppSettings>
    update(patch: Partial<AppSettings>): Promise<AppSettings>
  }
}
```

#### Renderer

负责：

- 编辑器 UI。
- 用户交互。
- AI 命令选择。
- AI 结果预览和应用。
- 本地状态管理。

### 6.2 数据流

```text
用户编辑
  -> MarkdownEditor onChange
  -> document-store 更新 dirty 状态
  -> debounce 自动保存
  -> preload IPC
  -> main process file-service
  -> 原子写入 .md 文件
```

```text
用户选择文本
  -> Cmd/Ctrl + K
  -> AiCommandMenu
  -> ai-store 创建请求
  -> preload IPC
  -> main process ai-service
  -> LLM streaming
  -> renderer 展示结果
  -> 用户确认
  -> 替换选区或插入内容
```

## 7. 数据模型

```ts
export interface DocumentState {
  id: string
  filePath: string | null
  fileName: string
  markdown: string
  savedMarkdown: string
  dirty: boolean
  lastSavedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface RecentFile {
  filePath: string
  fileName: string
  lastOpenedAt: string
}

export interface AppSettings {
  theme: 'light' | 'dark' | 'system'
  aiProvider: 'openrouter' | 'openai' | 'custom'
  aiBaseUrl: string
  aiModel: string
  autoSave: boolean
  autoSaveDelayMs: number
  editorFontSize: number
  editorLineHeight: number
}

export type AiCommand =
  | 'continue'
  | 'polish'
  | 'summarize'
  | 'translate-zh'
  | 'translate-en'
  | 'formal'
  | 'casual'

export interface AiCommandInput {
  command: AiCommand
  selectedText: string
  fullMarkdown: string
  language: 'zh' | 'en'
}

export interface AiCommandResult {
  command: AiCommand
  outputMarkdown: string
}

export interface AiChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface AiChatInput {
  messages: AiChatMessage[]
  currentMarkdown: string
}

export type AiStreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'done' }
  | { type: 'error'; message: string }
```

## 8. 文件系统设计

### 8.1 Markdown 文件

`.md` 文件就是用户数据源，不引入私有格式。

要求：

- 读取时保持 UTF-8。
- 保存时写回 UTF-8。
- 不强制格式化用户 Markdown。
- 不在文件中插入应用私有 metadata。

### 8.2 图片资源

MVP 可先不做复杂资源管理。第二阶段支持图片粘贴：

```text
note.md
assets/
  note-20260522-153000.png
```

Markdown 写入：

```md
![image](./assets/note-20260522-153000.png)
```

### 8.3 原子保存

保存流程：

1. 写入临时文件：`.filename.md.tmp`
2. fsync 或确保写入完成
3. rename 覆盖原文件
4. 更新 `savedMarkdown`

## 9. 编辑器体验要求

### 9.1 视觉

页面要接近 Typora：

- 单栏为主。
- 最大正文宽度约 `760px`。
- 页面背景干净。
- 无默认三栏布局。
- 工具按钮默认隐藏或弱化。
- AI 面板默认折叠。
- 状态栏低存在感。

### 9.2 必须支持的 Markdown 能力

第一版：

- 标题 H1-H6
- 段落
- 加粗/斜体/删除线
- 有序列表/无序列表
- 任务列表
- 引用
- 行内代码
- 代码块
- 分割线
- 链接
- 图片基础渲染

第二版：

- 表格
- Mermaid
- KaTeX
- frontmatter
- 脚注
- 目录大纲

### 9.3 快捷键

| 快捷键 | 行为 |
|---|---|
| `Cmd/Ctrl + N` | 新建 |
| `Cmd/Ctrl + O` | 打开 |
| `Cmd/Ctrl + S` | 保存 |
| `Cmd/Ctrl + Shift + S` | 另存为 |
| `Cmd/Ctrl + K` | AI 命令 |
| `Cmd/Ctrl + B` | 加粗 |
| `Cmd/Ctrl + I` | 斜体 |
| `Cmd/Ctrl + /` | 源码模式切换，第二版 |

## 10. AI 设计

### 10.1 原则

1. AI 不自动覆盖用户原文。
2. AI 结果必须可预览。
3. 用户点击应用后才写入编辑器。
4. AI 请求要带当前文档上下文，但避免超长上下文。
5. 选中文本优先；没有选中文本时基于当前位置或全文执行。

### 10.2 命令模式

用户选中文本后按 `Cmd/Ctrl + K`：

```text
润色当前选区
总结当前选区
续写一段
翻译成中文
翻译成英文
改得更正式
改得更口语
```

AI prompt 约束：

```text
你是一个 Markdown 写作助手。
只返回可直接插入文档的 Markdown。
不要解释你的修改。
保留原文含义。
不要添加不存在的事实。
```

### 10.3 文档聊天模式

右侧 AI 面板：

- 用户输入问题。
- 系统把当前 Markdown 作为上下文。
- AI 根据当前文档回答。
- 回答可以一键插入到光标位置。

### 10.4 Streaming

MVP 可以先用普通 Promise 返回完整结果。

第二步再做 streaming：

- main process 使用 fetch stream。
- IPC 事件推送 delta。
- renderer 增量展示。

## 11. UI 结构

```text
┌──────────────────────────────────────────────┐
│ TitleBar: 文件名 / dirty 状态 / 主题 / AI 按钮 │
├──────────────────────────────────────────────┤
│                                              │
│             EditorSurface                    │
│          max-width: 760px                    │
│                                              │
│                                              │
├──────────────────────────────────────────────┤
│ StatusBar: 字数 / 保存状态 / 模型             │
└──────────────────────────────────────────────┘

AI Panel 折叠时隐藏在右侧；展开时占 340px 左右。
```

## 12. 第一阶段实施计划

### Phase 1: Electron 骨架

目标：跑起来一个桌面应用。

任务：

1. 新增 `desktop/`。
2. 安装 Electron、electron-vite、React、TypeScript、Tailwind。
3. 配置 main/preload/renderer。
4. 创建主窗口。
5. 配置基础菜单。
6. renderer 展示空编辑器页面。

验收：

- `cd desktop && npm run dev` 可以打开桌面窗口。
- renderer 不直接访问 Node。
- DevTools 无明显报错。

### Phase 2: 文件读写

目标：能作为普通 Markdown 编辑器使用。

任务：

1. 实现 `file-service.ts`。
2. 实现新建、打开、保存、另存为。
3. 实现最近文件。
4. 实现 dirty 状态。
5. 实现自动保存。
6. 实现应用关闭前未保存提醒。

验收：

- 可以打开现有 `.md`。
- 编辑后 `Cmd/Ctrl + S` 写回原文件。
- 新文件保存时弹出另存为。
- 最近文件重启后仍存在。

### Phase 3: Markdown 编辑器

目标：达到 Typora 风格基础体验。

任务：

1. 接入 Milkdown/Crepe。
2. 实现 Markdown value/onChange。
3. 实现选区读取。
4. 实现替换选区。
5. 调整编辑器样式为极简正文。
6. 增加字数统计。

验收：

- 标题、列表、代码块、引用、链接、图片基础渲染正常。
- Markdown 保存后再次打开内容一致。
- 页面视觉接近 Typora：干净、单栏、低干扰。

### Phase 4: AI 命令

目标：AI 可以处理选中文本。

任务：

1. 实现 `settings-service.ts` 保存 API 配置。
2. 实现 `ai-service.ts`。
3. 实现 `AiCommandMenu`。
4. 实现 `PreviewDiff`。
5. 实现选区替换。
6. 增加错误提示和 loading 状态。

验收：

- 选中文本后按 `Cmd/Ctrl + K` 能弹出 AI 命令。
- AI 返回结果后先展示预览。
- 点击应用后才修改文档。
- 请求失败不会破坏当前文档。

### Phase 5: AI 面板

目标：能围绕当前文档对话。

任务：

1. 实现右侧可折叠 `AiPanel`。
2. 支持问当前文档。
3. 支持把回答插入光标位置。
4. 支持清空会话。
5. 后续支持 streaming。

验收：

- AI 能回答关于当前文档的问题。
- 面板收起后不影响编辑器宽度和写作体验。

## 13. 推荐给 cc 的第一批任务

让 cc 从这里开始，不要一口气做 AI 全部功能。

```text
请根据 docs/electron-ai-markdown-editor-tech-spec.md 开始实现 Phase 1 和 Phase 2。

要求：
1. 在仓库根目录新增 desktop/ Electron 应用。
2. 使用 electron-vite + React + TypeScript。
3. 实现安全的 main/preload/renderer 分层。
4. 实现新建、打开、保存、另存为 Markdown 文件。
5. 实现最近文件和 dirty 状态。
6. 暂时使用一个 textarea 作为编辑区即可，不要先接 AI。
7. 完成后运行构建或类型检查，并说明启动命令。

不要修改现有 backend/、frontend/、mobile/ 的业务代码，除非必须。
```

第二批任务：

```text
在 Phase 1 和 Phase 2 完成后，继续实现 Phase 3。

要求：
1. 用 Milkdown/Crepe 替换 textarea。
2. 保持 Markdown 字符串作为唯一文档状态。
3. 实现选区读取和选区替换，为 AI 命令做准备。
4. 做出 Typora 风格的极简编辑页面。
5. 保证保存到磁盘的内容仍然是标准 Markdown。
```

第三批任务：

```text
实现 Phase 4 的 AI 命令。

要求：
1. API 请求在 main process 执行。
2. renderer 不持有 API key。
3. 支持 OpenAI-compatible base URL、model、apiKey 配置。
4. 实现选中文本的润色、总结、续写、翻译。
5. AI 结果必须先预览，确认后才写入编辑器。
```

## 14. 风险与处理

### 14.1 Markdown 往返损耗

风险：WYSIWYG 编辑器可能改变原始 Markdown 格式。

处理：

- 第一阶段接受轻微格式变化。
- 重点保证语义不丢失。
- 大文档、复杂表格、HTML 块后续专项处理。

### 14.2 AI 覆盖用户内容

风险：AI 直接替换导致用户内容丢失。

处理：

- 所有 AI 修改必须进入预览态。
- 提供取消、应用、复制结果。
- 应用前记录 undo checkpoint。

### 14.3 Electron 安全

风险：renderer 直接访问文件系统或 API key 泄露。

处理：

- 禁用 `nodeIntegration`。
- 使用 preload 白名单。
- API key 不进入 renderer store。

### 14.4 产品变重

风险：做成 Obsidian/Joplin 式复杂知识库，偏离 Typora 简洁体验。

处理：

- MVP 只围绕单文件写作体验。
- 文件夹 workspace 和多文档问答放到后续。
- UI 默认保持干净，AI 默认隐藏。

## 15. 未来扩展

1. 文件夹 workspace。
2. 全文搜索。
3. 多文档问答。
4. 文档大纲。
5. Mermaid、KaTeX、表格增强。
6. Ollama 本地模型。
7. MCP 工具调用。
8. 与 MindMap Agent 图谱节点互通。
9. 从一个 Markdown 文档生成知识图谱。
10. 从知识图谱节点打开为本地 Markdown 编辑窗口。

## 16. 成功标准

第一版成功标准：

1. 打开速度快。
2. 页面极简，不像后台系统。
3. 写 Markdown 时没有明显干扰。
4. 文件保存可靠。
5. AI 好用但不打扰。
6. 用户随时知道 AI 会改哪里。
7. 任何时候 `.md` 文件仍然属于用户，而不是属于应用。
