import { app, BrowserWindow, Menu, shell, type MenuItemConstructorOptions } from 'electron'

/**
 * Typora-parity menubar. 8 top-level menus:
 *   WriteFlow • 文件 • 编辑 • 段落 • 格式 • 显示 • 主题 • 窗口 • 帮助
 *
 * Many items are wired to renderer via `menu:*` IPC channels. Items that
 * require infrastructure we haven't built yet (e.g. tabs, quick-open) are
 * present but disabled, so the menu shape matches Typora and users discover
 * what's possible.
 */
export function buildMenu(getWindow: () => BrowserWindow | null) {
  const isMac = process.platform === 'darwin'

  const send = (channel: string) => () => {
    const win = getWindow()
    if (win && !win.isDestroyed()) win.webContents.send(channel)
  }

  const template: MenuItemConstructorOptions[] = [
    // ─────────────── App ───────────────
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              { label: '偏好设置…', accelerator: 'CmdOrCtrl+,', click: send('menu:preferences') },
              { type: 'separator' as const },
              { role: 'services' as const },
              { type: 'separator' as const },
              { role: 'hide' as const, label: '隐藏 WriteFlow' },
              { role: 'hideOthers' as const, label: '隐藏其他' },
              { role: 'unhide' as const, label: '全部显示' },
              { type: 'separator' as const },
              { role: 'quit' as const, label: '退出 WriteFlow' },
            ],
          },
        ]
      : []),

    // ─────────────── 文件 ───────────────
    {
      label: '文件',
      submenu: [
        { label: '新建', accelerator: 'CmdOrCtrl+N', click: send('menu:new') },
        { label: '新建窗口', accelerator: 'CmdOrCtrl+Shift+N', enabled: false },
        { type: 'separator' },
        { label: '打开…', accelerator: 'CmdOrCtrl+O', click: send('menu:open') },
        { label: '打开文件夹…', click: send('menu:openFolder') },
        { label: '快速打开…', accelerator: 'CmdOrCtrl+P', enabled: false },
        { type: 'separator' },
        { label: '在 Finder 中显示', click: send('menu:revealInFinder') },
        { type: 'separator' },
        { label: '关闭', accelerator: 'CmdOrCtrl+W', role: isMac ? 'close' : 'quit' },
        { label: '存储', accelerator: 'CmdOrCtrl+S', click: send('menu:save') },
        { label: '另存为…', accelerator: 'CmdOrCtrl+Shift+S', click: send('menu:saveAs') },
        { type: 'separator' },
        { label: '导出为 PDF…', click: send('menu:exportPdf') },
        { label: '导出为 HTML…', click: send('menu:exportHtml') },
        { type: 'separator' },
        { label: '打印…', accelerator: 'CmdOrCtrl+P', enabled: false },
      ],
    },

    // ─────────────── 编辑 ───────────────
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' },
        { type: 'separator' },
        { label: '查找', accelerator: 'CmdOrCtrl+F', click: send('menu:find') },
        { label: '替换', accelerator: 'CmdOrCtrl+H', click: send('menu:replace') },
      ],
    },

    // ─────────────── 段落 ───────────────
    {
      label: '段落',
      submenu: [
        { label: '标题 1', accelerator: 'CmdOrCtrl+1', click: send('menu:fmtH1') },
        { label: '标题 2', accelerator: 'CmdOrCtrl+2', click: send('menu:fmtH2') },
        { label: '标题 3', accelerator: 'CmdOrCtrl+3', click: send('menu:fmtH3') },
        { label: '标题 4', accelerator: 'CmdOrCtrl+4', click: send('menu:fmtH4') },
        { type: 'separator' },
        { label: '段落', accelerator: 'CmdOrCtrl+0', click: send('menu:fmtParagraph') },
        { label: '引用块', accelerator: 'CmdOrCtrl+Shift+Q', click: send('menu:fmtBlockquote') },
        { type: 'separator' },
        { label: '有序列表', accelerator: 'CmdOrCtrl+Shift+[', click: send('menu:fmtOL') },
        { label: '无序列表', accelerator: 'CmdOrCtrl+Shift+]', click: send('menu:fmtUL') },
        { label: '任务列表', accelerator: 'CmdOrCtrl+Shift+X', click: send('menu:fmtTask') },
        { type: 'separator' },
        { label: '代码块', accelerator: 'CmdOrCtrl+Alt+C', click: send('menu:fmtCodeBlock') },
        { label: '表格', accelerator: 'CmdOrCtrl+Alt+T', click: send('menu:fmtTable') },
        { label: '水平分割线', accelerator: 'CmdOrCtrl+Alt+-', click: send('menu:fmtHr') },
      ],
    },

    // ─────────────── 格式 ───────────────
    {
      label: '格式',
      submenu: [
        { label: '加粗', accelerator: 'CmdOrCtrl+B', click: send('menu:fmtBold') },
        { label: '斜体', accelerator: 'CmdOrCtrl+I', click: send('menu:fmtItalic') },
        { label: '删除线', accelerator: 'CmdOrCtrl+Shift+~', click: send('menu:fmtStrike') },
        { type: 'separator' },
        { label: '行内代码', accelerator: 'CmdOrCtrl+Shift+`', click: send('menu:fmtInlineCode') },
        { label: '链接', accelerator: 'CmdOrCtrl+K', click: send('menu:fmtLink') },
        { label: '图片', accelerator: 'CmdOrCtrl+Shift+I', click: send('menu:fmtImage') },
        { type: 'separator' },
        { label: '清除格式', accelerator: 'CmdOrCtrl+\\', click: send('menu:fmtClear') },
      ],
    },

    // ─────────────── 显示 ───────────────
    {
      label: '显示',
      submenu: [
        { label: '切换文件树面板', accelerator: 'CmdOrCtrl+Shift+L', click: send('menu:toggleFileTree') },
        { label: '切换大纲面板', accelerator: 'CmdOrCtrl+Shift+1', click: send('menu:toggleOutline') },
        { type: 'separator' },
        { label: '专注模式', accelerator: 'CmdOrCtrl+Shift+F', click: send('menu:toggleFocusMode') },
        { label: '打字机模式', accelerator: 'CmdOrCtrl+Shift+T', click: send('menu:toggleTypewriter') },
        { type: 'separator' },
        { role: 'resetZoom', label: '实际大小' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '进入/退出全屏' },
        { type: 'separator' },
        { role: 'reload', label: '重新载入' },
        { role: 'toggleDevTools', label: '开发者工具' },
      ],
    },

    // ─────────────── 主题 ───────────────
    {
      label: '主题',
      submenu: [
        { label: 'Light', type: 'radio', click: send('menu:themeLight') },
        { label: 'Dark', type: 'radio', click: send('menu:themeDark') },
        { label: 'Sepia', type: 'radio', click: send('menu:themeSepia') },
      ],
    },

    // ─────────────── 窗口 ───────────────
    {
      role: 'window',
      label: '窗口',
      submenu: [
        { role: 'minimize', label: '最小化' },
        { role: 'zoom', label: '缩放' },
        ...(isMac
          ? [{ type: 'separator' as const }, { role: 'front' as const, label: '前置全部窗口' }]
          : [{ role: 'close' as const, label: '关闭' }]),
      ],
    },

    // ─────────────── 帮助 ───────────────
    {
      role: 'help',
      label: '帮助',
      submenu: [
        {
          label: '查看 GitHub 仓库',
          click: () => shell.openExternal('https://github.com/cjhyy/writeflow'),
        },
        { type: 'separator' },
        {
          label: '反馈问题…',
          click: () => shell.openExternal('https://github.com/cjhyy/writeflow/issues'),
        },
      ],
    },
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
