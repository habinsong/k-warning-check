# 변경 이력

---

## v0.1.0 (2026-04-10)

### Tauri v2 데스크톱 앱

Electron에서 Tauri v2로 전면 전환하여 데스크톱 앱 번들 사이즈를 ~150MB에서 ~30MB로 대폭 감소시켰습니다.

#### 추가

- **Tauri v2 Rust 백엔드** — 1,600줄 이상의 Rust 코드로 Electron Node.js 백엔드 전체 이식
  - 히스토리 CRUD (`history.rs`)
  - 설정 상태 관리 (`provider_state.rs`)
  - 보안 저장소: OS 키체인 + AES-256-GCM 캐시 (`secure.rs`)
  - Provider Bridge: Gemini/Groq HTTP 프록시 (`provider_bridge.rs`)
  - Codex CLI 통합: 브릿지 관리, 로그인 (`codex.rs`)
  - 시스템 기능: 클립보드, URL 열기, macOS 권한 (`system.rs`)
  - 화면 캡처: xcap + 투명 오버레이 윈도우 (`capture.rs`)
- **Tauri 브릿지 어댑터** (`tauri-bridge.ts`) — `window.kwcDesktop` 인터페이스를 Tauri `invoke()`로 구현
- **SVG 기반 앱 아이콘** — 모든 플랫폼 아이콘 자동 생성
- **Tauri ACL 권한 설정** (`capabilities/default.json`)

#### 변경

- `main/src/desktop/renderer/main.tsx` — Tauri 런타임 감지 후 조건부 브릿지 로드
- `main/src/desktop/renderer/captureOverlay.main.tsx` — 동일
- `main/vite.desktop.config.ts` — `envPrefix: ['VITE_', 'TAURI_']` 추가
- `main/package.json` — `@tauri-apps/api` 및 플러그인 의존성 추가, `keytar` 제거

#### 삭제

- `windows-app/` — Windows용 Electron 셸 (전체 디렉토리)
- `mac-app/` — macOS용 Electron 셸 (전체 디렉토리)
- `main/electron-shared/` — Electron 공용 런타임 (전체 디렉토리)
- `start-desktop-app.mjs` — 루트 Electron 진입점
- `main.mjs` — 루트 Electron 진입점
- `electron`, `electron-builder`, `cross-env` — 루트 devDependencies
- `keytar` — main dependencies (Rust `keyring` crate로 대체)

#### 이동

- `main/electron-shared/codex-services.mjs` → `main/native/codex-services.mjs` (Chrome 네이티브 호스트용)

---

## v0.0.0 (초기 릴리스)

### Chrome 확장프로그램 + Electron 데스크톱 앱

- 40개 이상의 탐지 규칙 기반 텍스트/URL/이미지 분석
- AI 후킹 체크리스트 (10개 카테고리 40개 항목)
- Gemini, Groq, Codex 3개 AI 제공자 지원
- 7가지 차원별 위험도 스코어링
- 13가지 분석 유형 자동 분류
- 한국어/영어 이중 언어 지원
- OS 키체인 기반 API 키 보안 저장
- Chrome Manifest V3 확장프로그램
- Electron 기반 데스크톱 앱 (macOS, Windows)
- Codex 브릿지 HTTP 서버
- Chrome 네이티브 메시징 호스트
