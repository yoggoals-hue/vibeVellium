# VibeVellium

<p align="center">
  <img width="1439" height="854" alt="image" src="https://github.com/user-attachments/assets/b4f68d1a-1c12-4abc-b810-1280f3ef49cb" />
</p>
<p align="center"><strong>Desktop AI chat, RP, writing, RAG, agent, and plugin workbench.</strong></p>

Desktop app built with Electron, React, a local Express API, and SQLite.

<img width="1440" height="857" alt="image" src="https://github.com/user-attachments/assets/03e75de3-5b39-4012-98f8-4c959eb1fc80" />

## Current Release

> **👋 Note from the maintainer:** VibeVellium is a "vibe-coded" fork and update of the original Vellium. I forked it because the original repository is currently inactive, and I really just wanted to see more development on this cool app! I don't actually know much about coding and this was actually entirely vibe-coded with Zai's glm 5.2, but I have massive respect for the original creator and I absolutely love the opensource community for making things like this. 

### ✨ What's New in VibeVellium (v0.9.8)
- **Free Will & Body State:** Characters now have toggleable meters (hunger, fatigue, arousal) and a dice-roll system that injects unprompted actions (mood changes, biological needs) into the scene.
- **Advanced Memory System:** Added an Action Tree and Future Guides to track story paths and inject long-term goals into the system prompt.
- **Inspector Panel & Debugging:** A new right sidebar UI to manually edit memory, view the raw JSON payload, and force-roll the Free Will dice.
- **Mobile Overhaul:** Added a hamburger drawer, mobile bottom navigation, and mobile-friendly CSS.
- **"What-If" Simulator:** A new tool to generate alternate responses side-by-side before committing them to chat memory.

- Latest release: [`v0.9.8`]
- Desktop builds: Windows (`x64`).
- Release build(s) are unsigned. 
- The app is usable day to day, but still moving quickly. Expect active iteration around Agents, tool calling, and provider compatibility.

## User Documentation

- Detailed user guide: [`docs/vellium/README.md`](./docs/vellium/README.md)


## Important
- Use `npm run dev` for day-to-day development.
- Use `npm run dev:electron` when testing the real desktop shell.
- Use `npm run dist:mac`, `npm run dist:win`, or `npm run dist:linux` for platform bundles.
- CI publishes GitHub Release assets when a `v*` tag is pushed.
- Local data is stored in `data/` during development and in the Electron user-data directory in packaged builds.

## Stack
- Electron
- React + TypeScript + Vite
- Express
- SQLite + `better-sqlite3`
- Tailwind CSS

## Core Features

### Agents
- Dedicated `Agents` workspace with ask, build, and research modes.
- Workspace tools for listing, reading, searching, editing, moving, deleting, and diffing files.
- Optional command execution for tests/builds, with separate security gates for shell-like commands, network commands, destructive file operations, and git writes.
- OpenAI-compatible structured planning with JSON-schema responses when supported.
- Mid-run corrections, abort/resume/retry, event traces, reasoning traces, and partial-response recovery.
- Context management for long agent threads, including auto-compaction, continuation cues, duplicate read-only call guards, and stale-run cleanup after edits/deletes.

### Chat / RP
- Branching chat history.
- Edit, delete, resend, regenerate.
- Multi-character chats with auto-turns.
- RP controls: prompt stack, author note, scene state, presets, personas.
- LoreBook / World Info support, including SillyTavern-compatible world info import/export.
- Reasoning support, including streamed reasoning fields and `<think>...</think>` parsing.
- Vision attachments and chat attachments.
- MCP tool calling for OpenAI-compatible chat/completions providers, with text-tool-call fallback parsing for providers that do not emit native tool calls cleanly.

### Writing
- Projects, chapters, scenes, outlines.
- Summaries, rewrite/expand flows, consistency tools.
- Character-aware writing workflows.
- DOCX import and DOCX / Markdown export.
- Writing-side RAG support.

### Knowledge / RAG
- Knowledge collections and ingestion.
- RAG bindings for chat and writing.
- Embedding and reranker model settings.
- Hybrid retrieval-oriented foundation.

### Providers
- OpenAI-compatible providers.
- KoboldCpp support.
- Custom endpoint adapters for non-OpenAI / non-Kobold backends.
- Presets for OpenAI, LM Studio, Ollama, KoboldCpp, OpenRouter, and custom OpenAI-compatible endpoints.
- Manual fallback models for providers whose `/models` endpoint is missing, empty, or provider-specific.
- Separate models for translate / compress / TTS / RAG.
- API parameter forwarding controls for providers that reject unsupported sampling fields.

### Plugins / Extensions
- Toolbar tabs from plugins.
- Plugin widgets in chat, writing, and settings slots.
- Plugin actions in toolbar, messages, composer, and writing.
- Plugin settings, permissions, plugin-local storage.
- `Pluginfile` install/export.
- Plugin themes.
- Custom inspector fields.
- Custom endpoint adapters.

<img width="1121" height="705" alt="image" src="https://github.com/user-attachments/assets/ec1b69b0-b8b0-4ca7-b3be-54a4c8f7ee03" />


## Requirements
- Node.js + npm. Node.js 20+ is recommended because CI builds with Node 20.
- Python 3 + Pillow for icon generation:

```bash
pip install pillow
```

Notes:
- `better-sqlite3` is native. Keep dev/build Node versions consistent.
- If native ABI breaks, run `npm run rebuild:native`.

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Start frontend + local API:

```bash
npm run dev
```

3. Open:

`http://localhost:1420`

## Electron Dev

```bash
npm run dev:electron
```

This builds Electron entrypoints, starts the local server, starts Vite, waits for health checks, then launches Electron.

## One-Click Bootstrap

macOS:

```bash
./setup-and-run-dev.sh
```

Windows:

```bat
setup-and-run-dev.bat
```

These scripts try to:
- install Node.js LTS,
- run `npm install`,
- start `npm run dev`.

## Build Desktop App

All desktop targets:

```bash
npm run dist
```

macOS only:

```bash
npm run dist:mac
```

Windows only:

```bash
npm run dist:win
```

Linux AppImage only:

```bash
npm run dist:linux
```

Build output goes to `release/`.

## GitHub Actions

Workflow:
- `.github/workflows/build-desktop.yml`

What it does:
- builds macOS (`x64`, `arm64`), Windows (`x64`), and Linux (`x64` AppImage) bundles,
- uploads workflow artifacts,
- publishes GitHub Release assets on `v*` tag pushes.

## Plugins

VibeVellium now has a real plugin system.

Plugin capabilities:
- toolbar tabs,
- slot widgets,
- modal and inline actions,
- plugin-local settings,
- permission-gated API access,
- plugin themes,
- `Pluginfile` import/export.

Useful docs:
- [`docs/plugins/README.md`](./docs/plugins/README.md)

Runtime plugin locations:
- user plugins: `data/plugins`
- bundled plugins: `data/bundled-plugins`

Important:
- plugins are local extensions, not a trusted public plugin marketplace model,
- plugin permissions should be reviewed before enabling write access,
- plugin settings and permissions are managed in `Settings -> Plugins`.

### Pluginfile

`Pluginfile` is the portable single-file plugin package format.

You can:
- install a plugin from `Settings -> Plugins -> Install Pluginfile`,
- export an existing plugin from `Settings -> Plugins -> Export Pluginfile`.

Bundled plugins can also be exported as `Pluginfile`.

## Themes

VibeVellium supports:
- built-in dark/light themes,
- plugin-provided themes.

Bundled theme pack:
- Catppuccin
  - Latte
  - Frappe
  - Macchiato
  - Mocha

Theme plugins also propagate into plugin UI kit styling.

## Extensions API

VibeVellium includes an extensions layer beyond normal plugins:
- custom inspector fields,
- custom endpoint adapters,
- unified plugin-side backend access through `vellium.generate(...)` and related SDK namespaces.

This makes it possible to:
- add inspector controls,
- integrate non-OpenAI / non-Kobold backends,
- build workflow plugins against a stable host-side contract.

## TTS

VibeVellium supports OpenAI-compatible TTS:
- configurable endpoint,
- model selection,
- voice selection,
- per-message TTS actions.

## App Icons

Generate icons:

```bash
npm run build:icons
```

Generated files:
- `build/icon.png`
- `build/icon.icns`
- `build/icon.ico`

## Useful Scripts
- `npm run dev` — frontend + server.
- `npm run dev:frontend` — Vite only.
- `npm run dev:server` — Express API only.
- `npm run dev:electron` — Electron + frontend + server.
- `npm run build` — frontend production build.
- `npm run build:server` — bundled server build.
- `npm run build:desktop` — full desktop build pipeline without publishing.
- `npm run dist` — package all desktop targets supported by the current host/CI runner.
- `npm run dist:mac` / `npm run dist:win` / `npm run dist:linux` — package a specific desktop target.
- `npm run rebuild:native` — rebuild `better-sqlite3`.
- `npm run test` — Vitest.

## Data Storage
- In dev: local `data/`
- In packaged app: `SLV_DATA_DIR` maps to Electron `userData/data`

## Troubleshooting

### `ERR_DLOPEN_FAILED` / `NODE_MODULE_VERSION ...`
Cause: `better-sqlite3` was built against a different Node ABI.

Fix:

```bash
npm run rebuild:native
```

If needed, remove `node_modules` and reinstall.

### `EADDRINUSE: address already in use :::3001`
Cause: an old server process is still alive.

Fix:

```bash
lsof -nP -iTCP:3001 -sTCP:LISTEN
kill -TERM <pid>
```

### Blank window or long startup in packaged builds
Check:
- full desktop build was used,
- `server-bundle.mjs` is present,
- the bundled server reaches `/api/health`.

### Plugins do not load
Check:
- plugin is enabled in `Settings -> Plugins`,
- required permissions were granted,
- after changing plugin files, use `Reload Plugins`,
- after SDK/runtime changes, restart `npm run dev:electron`.

## Project Structure
- `src/` — React frontend
- `server/` — Express API
- `electron/` — Electron main + preload
- `scripts/` — build/dev helper scripts
- `docs/` — docs, plugin docs, assets
- `data/` — runtime data, user plugins, bundled plugins
- `build/` — electron-builder resources
- `release/` — packaged desktop output

---

## Known Limitations & Areas for Improvement

This section transparently documents current flaws, rough edges, and unimpressive aspects of VibeVellium as it stands today. The app is functional but still pre-1.0 (`v0.9.x`), and these limitations should be understood before adopting it for serious workflows.

### Stability & Maturity

- **Pre-1.0 status**: The app is still in active development with version `0.9.x`. Expect breaking changes and active iteration, especially around Agents, tool calling, and provider compatibility.
- **Unsigned builds**: All desktop releases are unsigned. macOS and Windows will require manual security confirmations on first launch (`Gatekeeper` / `SmartScreen`).
- **Configuration fragility**: A full "settings reset" exists in the Danger Zone, indicating that configuration state can become corrupted or inconsistent enough to warrant nuclear options.

### Technical Debt & Developer Experience

- **Native module ABI hell**: `better-sqlite3` is a native dependency that breaks when Node versions mismatch. Developers must run `npm run rebuild:native` or reinstall dependencies when switching Node versions.
- **Zombie processes**: The dev server can leave orphaned processes occupying port `3001`, requiring manual cleanup via `lsof` and `kill`.
- **Python dependency for icons**: Building app icons requires installing Python 3 + Pillow just to run `npm run build:icons`—an unnecessary friction point for a JavaScript project.
- **Complex multi-process orchestration**: Running Electron dev mode requires health checks, `wait-on` scripts, and coordinating three separate processes (server, Vite, Electron). This adds fragility to the dev workflow.
- **No visible test coverage**: While Vitest is configured, there's no indication of test coverage reporting, CI test runs, or quality gates in the public workflow.

### Security & Trust Model

- **Plugin trust is entirely manual**: Plugins are described as "local extensions, not a trusted public plugin marketplace." Users must personally review plugin permissions before enabling write access—there's no sandboxing, code signing, or automated security audit.
- **Explicit security toggles required**: Settings include switches for "Markdown HTML sanitization," "external link policy," "remote image policy," and "unsafe upload policy"—suggesting these are not secure by default.
- **Local-only mode as a feature**: The app needs a `local-only` toggle to prevent accidental requests to public APIs, implying the default behavior could leak data to unintended endpoints if misconfigured.

### Feature Limitations

- **Tool calling is provider-locked**: Tool calling and MCP integration only work with OpenAI-compatible providers. KoboldCpp users (popular in the RP community) cannot use these features at all.
- **Manual fallback models required**: Some providers don't expose a working `/models` endpoint, forcing users to manually specify fallback model names—a sign of incomplete provider integration.
- **Desktop-only (Electron)**: No web, mobile, or tablet support. The app cannot be self-hosted as a web service accessible from multiple devices.
- **Single-user, local-first**: All data is stored locally (`data/` or Electron `userData`). There's no cloud sync, collaboration, or multi-user support. Switching machines means manually migrating data.
- **No offline-first guarantee**: Despite supporting local backends, the app doesn't clearly document offline behavior or graceful degradation when network-dependent features fail.

### User Experience Friction

- **Overwhelming configuration surface**: Settings are split across 7+ categories (`Connection`, `Backends`, `Interface`, `Generation`, `Context`, `Prompts`, `Tools & MCP`). New users must understand provider types, active model routing, prompt stacks, and permission systems before achieving a stable workflow.
- **Prompt stack complexity**: Users need to understand blocks like `system`, `jailbreak`, `author_note`, `lore`, `scene` to customize behavior. This is powerful but steep for casual users.
- **Active model requirement**: Chat and core features simply don't work without an explicitly assigned "active model." The app won't auto-select sensible defaults.
- **RAG is opt-in and complex**: Retrieval requires creating collections, ingesting documents, configuring embedding/reranker models, and tuning retrieval parameters. It's not a simple "turn it on" feature.
- **Long conversation instability**: Documentation explicitly warns that "long histories" can cause issues, requiring manual tuning of context windows, compression models, and prompt stacks.

### Architecture Concerns

- **Tightly coupled frontend/backend**: The dev workflow requires running both `dev:server` and `dev:frontend` together. They're not independently deployable or testable in isolation.
- **Build artifacts scattered**: Output goes to `dist/`, `dist-electron/`, `server-bundle.mjs`, and `release/`—making it unclear which artifacts are canonical for deployment.
- **No mention of telemetry or error reporting**: There's no documentation about crash reporting, analytics, or how the team tracks production issues—raising questions about post-release support.

### Missing Standard Features

- **No theming API documentation**: While plugin themes exist, there's no clear spec for theme authors beyond "plugin-provided themes."
- **No accessibility statement**: No mention of screen reader support, keyboard navigation, WCAG compliance, or accessibility testing.
- **No i18n roadmap**: Interface language is configurable, but there's no mention of community translation efforts, localization files, or supported languages beyond English defaults.
- **No performance benchmarks**: No mention of startup time, memory usage, or how the app scales with large knowledge bases, long chats, or many plugins.

---

*Last updated: Based on v0.9.7/v0.9.8 release state. These limitations may evolve as the project matures toward v1.0.*
