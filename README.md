# WriteFlow

A focused desktop Markdown editor — Typora-style writing experience with AI assistance (coming).

> **Status**: early MVP. Phase 1 (Electron skeleton) and Phase 2 (file IO) work. Phase 3 (Milkdown Crepe editor) and Phase 5 (AI features) in progress.

## What it is

WriteFlow runs as an Electron desktop app. It opens `.md` files in a clean single-column editor and renders Markdown inline as you type. `.html` files open in a sandboxed read-only preview. There is no backend, no account, no cloud sync — your files stay on your disk.

See [`docs/design.md`](docs/design.md) for the current design.

## Development

```bash
npm install
npm run dev      # launches Electron with HMR
npm run build    # builds main / preload / renderer bundles
npm run package:mac  # builds a .dmg
```

## Project layout

```
src/
├── main/          # Electron main process: window, file IO, menu
├── preload/       # contextBridge — whitelisted API exposed to renderer
├── renderer/      # React UI
└── shared/        # types shared across processes
```

## Origin

Started 2026-05 as the successor to [cjhyy/mindMap](https://github.com/cjhyy/mindMap) after that project's direction was archived.
