# 개발 가이드

K-워닝체크 프로젝트의 환경 설정, 빌드, 테스트, 프로젝트 규칙을 설명합니다.

---

## 사전 요구사항

| 도구 | 최소 버전 | 용도 |
|------|----------|------|
| Node.js | 20+ | 프론트엔드 빌드, 테스트 |
| npm | 10+ | 패키지 관리 |
| Rust | 1.80+ | Tauri 데스크톱 앱 백엔드 |
| Cargo | (Rust와 함께) | Rust 빌드 도구 |

### 선택 사항

| 도구 | 용도 |
|------|------|
| Codex CLI | Codex 브릿지 기능 사용 시 |
| Chrome | 확장프로그램 개발/테스트 |

---

## 환경 설정

### 1. 저장소 클론 및 의존성 설치

```bash
git clone https://github.com/habinsong/k-warning-check.git
cd k-warning-check
npm install
```

### 2. Rust 툴체인 설치 (데스크톱 앱 개발 시)

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

### 3. Tauri CLI 설치

```bash
cargo install tauri-cli
```

---

## 개발 서버

### Chrome 확장 (Watch 모드)

```bash
npm run dev:extension
```

- `main/src/` 변경 감지 → 자동 재빌드
- 빌드 산출물: `dist/`
- Chrome에서 `chrome://extensions` → "업데이트" 클릭으로 반영

### 데스크톱 앱

```bash
npm run dev:tauri
```

내부적으로 두 프로세스가 동시 실행됩니다:
1. **Vite 개발 서버** — `http://127.0.0.1:4173` (프론트엔드 HMR)
2. **Tauri 개발 빌드** — Rust 컴파일 + WebView 연결

프론트엔드 코드 변경: HMR로 즉시 반영
Rust 코드 변경: 자동 재컴파일 + 앱 재시작

---

## 빌드

### Chrome 확장 프로덕션 빌드

```bash
npm run build:extension
```

산출물: `dist/` (Chrome에서 로드 가능한 완전한 확장)

### 데스크톱 앱 프로덕션 빌드

```bash
npm run build:tauri
```

산출물:
- macOS: `tauri-app/target/release/bundle/dmg/*.dmg`
- Windows: `tauri-app/target/release/bundle/nsis/*.exe`

### 네이티브 호스트 설치

```bash
npm run native:install
```

Chrome 네이티브 메시징 호스트를 시스템에 등록합니다.

---

## 테스트

```bash
# 전체 테스트 실행
npm run test

# Watch 모드
npm run test -- --watch
```

### 테스트 구조

```
main/src/
├── modules/
│   ├── analyzer/
│   │   └── analyzeText.test.ts          # 텍스트 분석 파이프라인
│   ├── classifier/
│   │   └── classifySignals.test.ts      # 신호 분류
│   ├── scorer/
│   │   └── calculateWarningScore.test.ts # 스코어링
│   └── parser/
│       ├── normalizeText.test.ts        # 텍스트 정규화
│       └── detectTextLanguage.test.ts   # 언어 감지
└── shared/
    └── localization.test.ts             # 로컬라이제이션
```

### 테스트 도구

| 도구 | 용도 |
|------|------|
| Vitest | 테스트 러너 |
| @testing-library/react | React 컴포넌트 테스트 |
| @testing-library/jest-dom | DOM 매처 |
| jsdom | 브라우저 환경 시뮬레이션 |

---

## 린트

```bash
npm run lint
```

ESLint 9 + TypeScript ESLint + React Hooks 플러그인을 사용합니다.

---

## 프로젝트 규칙

### 워크스페이스 구조

```json
// package.json (루트)
{
  "workspaces": ["main"]
}
```

- `main/` — npm 워크스페이스 패키지
- `tauri-app/` — Cargo 프로젝트 (npm 워크스페이스 외부)

### 코드 공유 원칙

```
Chrome 확장과 데스크톱 앱은 동일한 분석 엔진을 공유합니다.

  main/src/core/      → 서비스 인터페이스 (공용)
  main/src/modules/   → 분석 엔진 (공용)
  main/src/data/      → 규칙 정의 (공용)
  main/src/shared/    → 타입/유틸리티 (공용)

  main/src/background/ → Chrome 확장 전용
  main/src/popup/      → Chrome 확장 전용
  main/src/options/    → Chrome 확장 전용
  main/src/content/    → Chrome 확장 전용
  main/src/offscreen/  → Chrome 확장 전용

  main/src/desktop/    → 데스크톱 앱 전용
  tauri-app/src/       → 데스크톱 앱 전용 (Rust)
```

### Vite 빌드 설정

| 설정 파일 | 용도 | 산출물 |
|----------|------|--------|
| `vite.config.ts` | Chrome 확장 | `dist/` |
| `vite.desktop.config.ts` | 데스크톱 렌더러 | `main/.desktop-renderer/` |

### 플랫폼 추상화

데스크톱 앱은 `window.kwcDesktop` 인터페이스로 Rust 백엔드와 통신합니다.

새로운 IPC 커맨드를 추가하려면:

1. **Rust 커맨드 작성** (`tauri-app/src/commands/`)
2. **lib.rs에 등록** (`generate_handler![]`)
3. **tauri-bridge.ts에 매핑** (`invoke('command_name')`)
4. **DesktopApi 인터페이스 확장** (`platform/desktopApi.ts`)

### 탐지 규칙 추가

새 탐지 규칙을 추가하려면:

1. `main/src/data/rules.ts`에 `RuleDefinition` 추가
2. (선택) `main/src/data/englishRulePatterns.ts`에 영어 패턴 추가
3. (선택) 콤보 규칙이 필요하면 `ComboDefinition` 추가
4. `analyzeText.test.ts`에 테스트 케이스 추가

### AI 체크리스트 항목 추가

1. `main/src/data/aiHookingChecklist.ts`에 항목 추가
2. (선택) `main/src/data/englishAiHookingPatterns.ts`에 영어 패턴 추가

---

## 디렉토리별 책임

| 경로 | 책임 | 주요 파일 |
|------|------|----------|
| `main/src/core/` | 서비스 계약, 오케스트레이션 | `contracts.ts`, `analysisService.ts` |
| `main/src/modules/analyzer/` | 분석 파이프라인 | `analyzeInput.ts`, `analyzeText.ts` |
| `main/src/modules/scorer/` | 위험도 점수 산출 | `calculateWarningScore.ts` |
| `main/src/modules/classifier/` | 분석 유형 분류 | `classifySignals.ts` |
| `main/src/modules/parser/` | 텍스트 파싱 | `normalizeText.ts`, `extractEntities.ts` |
| `main/src/modules/providers/` | AI 제공자 어댑터 | `geminiProvider.ts`, `groqProvider.ts` |
| `main/src/modules/explanation/` | 설명 생성 | `generateExplanation.ts` |
| `main/src/data/` | 규칙/패턴 정의 | `rules.ts`, `aiHookingChecklist.ts` |
| `main/src/shared/` | 공용 타입/유틸리티 | `types.ts`, `constants.ts` |
| `tauri-app/src/commands/` | Tauri IPC 커맨드 | `history.rs`, `provider_bridge.rs` |
| `tauri-app/src/secure.rs` | 보안 저장소 | 키체인 + AES-GCM |

---

## 트러블슈팅

### `cargo tauri dev` 실행 시 프론트엔드가 비어있음

Vite 개발 서버가 `4173` 포트에서 실행 중인지 확인하세요. `npm run dev:tauri`는 자동으로 두 프로세스를 실행하지만, 수동으로 할 경우:

```bash
# 터미널 1
cd main && npm run dev:desktop-renderer

# 터미널 2
cd tauri-app && cargo tauri dev
```

### macOS 화면 캡처가 작동하지 않음

시스템 설정 → 개인정보 보호 및 보안 → 화면 및 시스템 오디오 녹화에서 앱 권한을 허용한 뒤 앱을 재시작하세요.

### 네이티브 호스트가 Chrome에서 인식되지 않음

```bash
npm run native:install
```

실행 후 Chrome을 완전히 재시작하세요 (모든 창 닫기).

### Rust 컴파일 오류

```bash
rustup update
cargo clean
cargo tauri build
```
