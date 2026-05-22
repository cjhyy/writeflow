import { app, BrowserWindow, Menu, type MenuItemConstructorOptions } from 'electron'

export function buildMenu(getWindow: () => BrowserWindow | null) {
  const isMac = process.platform === 'darwin'

  const send = (channel: string) => () => {
    const win = getWindow()
    if (win && !win.isDestroyed()) win.webContents.send(channel)
  }

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              { role: 'services' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const },
            ],
          },
        ]
      : []),
    {
      label: 'File',
      submenu: [
        { label: 'New', accelerator: 'CmdOrCtrl+N', click: send('menu:new') },
        { label: 'Open…', accelerator: 'CmdOrCtrl+O', click: send('menu:open') },
        { type: 'separator' },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: send('menu:save') },
        { label: 'Save As…', accelerator: 'CmdOrCtrl+Shift+S', click: send('menu:saveAs') },
        { type: 'separator' },
        { label: 'Export as PDF…', click: send('menu:exportPdf') },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
        { type: 'separator' },
        { label: 'Find', accelerator: 'CmdOrCtrl+F', click: send('menu:find') },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Toggle File Tree', accelerator: 'CmdOrCtrl+\\', click: send('menu:toggleFileTree') },
        { label: 'Toggle Outline', accelerator: 'CmdOrCtrl+Shift+1', click: send('menu:toggleOutline') },
        { type: 'separator' },
        { label: 'Focus Mode', accelerator: 'CmdOrCtrl+Shift+F', click: send('menu:toggleFocusMode') },
        { label: 'Typewriter Mode', accelerator: 'CmdOrCtrl+Shift+T', click: send('menu:toggleTypewriter') },
        { type: 'separator' },
        {
          label: 'Theme',
          submenu: [
            { label: 'Light', click: send('menu:themeLight') },
            { label: 'Dark', click: send('menu:themeDark') },
            { label: 'Sepia', click: send('menu:themeSepia') },
          ],
        },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'toggleDevTools' },
      ],
    },
    {
      role: 'window',
      submenu: [{ role: 'minimize' }, { role: 'zoom' }, ...(isMac ? [{ role: 'front' as const }] : [{ role: 'close' as const }])],
    },
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
