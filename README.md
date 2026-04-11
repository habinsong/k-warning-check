# K-WarningCheck

> Read the message, not the hype.
>
> K-WarningCheck is a multi-platform warning checker for suspicious text, URLs, screenshots, and AI-heavy promotional copy. It combines a shared rule engine, OCR, provider-assisted critique, and a focused UI for quick triage.

[한국어 README](README.ko.md) · [Architecture](docs/ARCHITECTURE.md) · [Providers](docs/PROVIDERS.md) · [Development](docs/DEVELOPMENT.md)

---

## Why This Exists

K-WarningCheck is built for a very specific problem space:

- scam and phishing copy that looks routine at first glance
- over-polished viral copy designed to push clicks, installs, or purchases
- AI-generated low-quality hooking text that sounds authoritative but is weak on facts
- screenshots or clipped text that need OCR before analysis

The product ships a shared analysis engine across:

- a Chrome extension for page-adjacent checks
- a Tauri desktop app for manual analysis, clipboard checks, and screen capture workflows

---

## Platform Matrix

| Surface | Status | Codex availability |
|---|---|---|
| Chrome on macOS / Linux / non-Windows | Supported | Available |
| Chrome on Windows | Supported | Hidden and disabled |
| Desktop on macOS | Supported | Available |
| Desktop on Windows | Supported | Hidden and disabled |

Windows builds intentionally do not expose Codex UI or connection flows.

---

## Highlights

- Shared analysis engine for text, URL, image, selection, capture, and clipboard inputs
- Rule-based scoring for phishing, scam, viral marketing, AI slop, and outdated-claim patterns
- OCR-first screenshot handling with provider-assisted image text extraction when configured
- Optional provider support for Gemini, Groq, and Codex where supported
- Web freshness verification for model/version claims
- OS-backed secret storage for API keys
- macOS menu bar launcher for the desktop app

---

## Quick Start

### Requirements

- Node.js 20+
- npm 10+
- Rust 1.80+ for desktop builds

### Install

```bash
npm install
```

### Run Tests

```bash
npm run test
npm run lint
```

### Build Chrome Extension

```bash
npm run build:extension
```

The unpacked extension build is written to `dist/`.

### Build Desktop

```bash
npm run build:mac
npm run build:windows
```

Desktop build outputs are generated locally and intentionally ignored from Git.

---

## Optional Local Host

```bash
npm run native:install
```

This installs the local native host used by the Chrome extension for secure storage integration. On non-Windows Chrome it also enables Codex-related flows. On Windows, Codex UI stays disabled even if the local host is installed.

---

## Project Shape

```text
k-warning-check/
├── main/        # Shared frontend, extension runtime, desktop renderer, native host scripts
├── tauri-app/   # Tauri v2 desktop backend in Rust
├── docs/        # Project documentation
├── README.md
├── README.ko.md
└── package.json
```

---

## Documentation

| Document | Description |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Shared runtime structure, platform capability model, data flow |
| [docs/ANALYSIS-ENGINE.md](docs/ANALYSIS-ENGINE.md) | Rule engine, scoring, classification, AI-hooking checklist |
| [docs/CHROME-EXTENSION.md](docs/CHROME-EXTENSION.md) | Chrome extension structure, background flow, local host integration |
| [docs/DESKTOP-APP.md](docs/DESKTOP-APP.md) | Tauri desktop architecture and platform behavior |
| [docs/PROVIDERS.md](docs/PROVIDERS.md) | Gemini, Groq, Codex support matrix and behavior |
| [docs/SECURITY.md](docs/SECURITY.md) | Secure storage, bridge token handling, repo hygiene |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | Setup, build commands, verification workflow |

---

## FAQ

### Why is Codex missing on Windows?

Windows deliberately does not expose Codex UI or connection flows in either the desktop app or the Chrome extension. The repo still keeps compatibility-level state fields for existing data, but the runtime disables those paths on Windows.

### Are build artifacts committed?

No. `dist/`, `mac-app/`, `windows-app/`, and other generated outputs are ignored and kept out of Git.

### Where are secrets stored?

API keys are stored through OS-backed secure storage. The repository should not contain checked-in credentials, personal paths, or local build artifacts.

---

## License

Private
