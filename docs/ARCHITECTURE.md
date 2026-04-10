# 아키텍처

K-워닝체크의 시스템 구조, 데이터 흐름, 플랫폼 추상화 설계를 설명합니다.

---

## 전체 구조

```
┌──────────────────────────────────────────────────────────┐
│                     사용자 인터페이스                       │
│  ┌──────────────────┐     ┌──────────────────────────┐   │
│  │  Chrome 확장 UI   │     │    데스크톱 앱 UI          │   │
│  │  (Popup/Options)  │     │   (DesktopApp.tsx)        │   │
│  └───────┬──────────┘     └────────────┬─────────────┘   │
└──────────┼─────────────────────────────┼─────────────────┘
           │                             │
           │ Chrome Runtime              │ Tauri invoke()
           │ Message                     │
┌──────────▼──────────┐     ┌────────────▼─────────────┐
│  Background Worker   │     │   Tauri Rust Backend     │
│  (Service Worker)    │     │   (tauri-app/src/)       │
│                      │     │                          │
│  - 분석 서비스        │     │  - 히스토리 관리           │
│  - 히스토리 관리       │     │  - Provider Bridge       │
│  - Provider 라우팅    │     │  - 보안 저장소             │
│  - 네이티브 메시징     │     │  - 화면 캡처              │
└──────────┬──────────┘     └────────────┬─────────────┘
           │                             │
           ▼                             ▼
┌──────────────────────────────────────────────────────────┐
│                    공용 분석 엔진                           │
│  main/src/core/ + main/src/modules/ + main/src/data/      │
│                                                            │
│  analyzeInput() → analyzeText() → calculateWarningScore()  │
│                 → classifySignals() → generateExplanation() │
└──────────────────────────────────────────────────────────┘
           │
           ▼ (선택적)
┌──────────────────────────────────────────────────────────┐
│                    외부 AI 제공자                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐   │
│  │  Gemini   │  │  Groq    │  │  Codex Bridge(4317)  │   │
│  └──────────┘  └──────────┘  └──────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

---

## 핵심 계층

### 1. UI 계층

동일한 React 컴포넌트 세트가 두 플랫폼에서 실행됩니다.

| 컴포넌트 | Chrome 확장 | 데스크톱 앱 |
|----------|------------|------------|
| 분석 입력 | PopupApp.tsx | DesktopApp.tsx |
| 설정 | OptionsApp.tsx | DesktopApp.tsx (탭) |
| 결과 표시 | RecordCard / ScoreGauge | 동일 |
| 캡처 오버레이 | - | CaptureOverlayApp.tsx |

### 2. 서비스 계층

**분석 서비스** (`core/analysisService.ts`)가 플랫폼별 저장소를 주입받아 동작합니다.

```typescript
// 의존성 주입 구조
AnalysisService {
  historyRepository    // Chrome: chrome.storage / Desktop: Tauri invoke
  providerStateRepo    // Chrome: chrome.storage / Desktop: Tauri invoke
  secureStoreService   // Chrome: Native Host / Desktop: Tauri invoke
  clipboardReader      // Chrome: Offscreen / Desktop: Tauri invoke
  captureReader        // Chrome: - / Desktop: Tauri invoke
  notifier             // Chrome: Runtime Message / Desktop: callback
}
```

### 3. 분석 엔진 계층

플랫폼에 독립적인 순수 로직입니다.

```
analyzeInput()
  ├── 이미지 입력 → extractTextFromImage() (OCR 또는 AI Vision)
  ├── analyzeText()
  │     ├── normalizeText()          # 텍스트 정규화
  │     ├── detectTextLanguage()     # 언어 감지
  │     ├── extractEntities()        # URL/전화번호/계좌 추출
  │     ├── matchRules()             # 40개 규칙 매칭
  │     ├── matchCombos()            # 콤보 패턴 매칭
  │     ├── evaluateAiHookingChecklist()  # AI 품질 체크리스트
  │     ├── calculateWarningScore()  # 위험도 점수 산출
  │     ├── classifySignals()        # 분석 유형 분류
  │     └── generateExplanation()    # 설명 및 권장 조치 생성
  ├── verifyFreshness()              # (선택) 웹 최신성 검증
  └── refineExplanation()            # (선택) AI 설명 개선
```

### 4. 저장소 계층

| 저장소 | Chrome 확장 | 데스크톱 앱 |
|--------|------------|------------|
| 히스토리 | `chrome.storage.local` | `~/.k-warning-check/history.json` |
| 설정 | `chrome.storage.local` | `~/.k-warning-check/provider-state.json` |
| API 키 | 네이티브 호스트 → keytar | Rust keyring + AES-256-GCM 캐시 |
| 메타데이터 | `chrome.storage.local` | `~/.k-warning-check/secure-store-metadata.json` |

---

## 플랫폼 추상화

### DesktopApi 인터페이스

`main/src/platform/desktopApi.ts`에 정의된 인터페이스가 플랫폼 간 계약을 맺습니다.

```typescript
interface DesktopApi {
  history: {
    getBundle(): Promise<HistoryBundle>
    saveRecord(record): Promise<StoredAnalysisRecord[]>
    deleteRecord(id): Promise<StoredAnalysisRecord[]>
    clear(): Promise<void>
    getRecordById(id): Promise<StoredAnalysisRecord | null>
  }
  providerState: {
    get(): Promise<ProviderState>
    save(state): Promise<ProviderState>
  }
  secureStore: {
    getStatus(): Promise<SecureStoreStatus>
    setSecret(provider, secret, retention): Promise<SecureStoreProviderStatus>
    deleteSecret(provider): Promise<SecureStoreProviderStatus>
    validateSecret(provider): Promise<SecureStoreProviderStatus>
  }
  providerBridge: {
    invoke(provider, operation, payload): Promise<any>
  }
  codex: {
    getStatus(): Promise<CodexStatusResult>
    startBridge(force?): Promise<CodexBridgeResult>
    startLogin(): Promise<CodexLoginResult>
  }
  system: {
    readClipboardText(): Promise<string>
    openExternal(url): Promise<void>
    captureScreenRegion(): Promise<CaptureResult>
  }
}
```

### Tauri 브릿지 어댑터

`main/src/desktop/renderer/tauri-bridge.ts`가 `DesktopApi`를 Tauri `invoke()` 호출로 구현합니다.

```typescript
// window.kwcDesktop에 할당
const tauriDesktopApi: DesktopApi = {
  history: {
    getBundle: () => invoke('kwc_history_get_bundle'),
    saveRecord: (record) => invoke('kwc_history_save_record', { record }),
    // ...
  },
  // ...
}
```

런타임 감지로 Tauri 환경에서만 로드됩니다:

```typescript
if ('__TAURI_INTERNALS__' in window) {
  await import('./tauri-bridge')
}
```

---

## 데이터 흐름

### Chrome 확장 분석 흐름

```
사용자 액션
  → Chrome Runtime Message ('analyze-input')
  → Background Service Worker
  → analysisService.analyzeAndPersist(input)
  → analyzeInput() [공용 분석 엔진]
  → chrome.storage.local에 결과 저장
  → Runtime Message ('analysis-ready') 브로드캐스트
  → Popup UI 갱신
```

### 데스크톱 앱 분석 흐름

```
사용자 액션 (DesktopApp.tsx)
  → desktopAnalysisService.analyzeAndPersist(input)
  → analyzeInput() [공용 분석 엔진]
  → window.kwcDesktop.history.saveRecord()
  → Tauri invoke('kwc_history_save_record')
  → Rust: ~/.k-warning-check/history.json에 저장
  → React state 갱신 → UI 리렌더
```

### AI 제공자 라우팅

```
분석 엔진이 AI 기능 요청
  ├── preferredProvider 확인
  ├── Codex: HTTP POST → localhost:4317 (브릿지)
  ├── Gemini:
  │     Chrome: 직접 HTTPS API 호출
  │     Desktop: Tauri invoke → Rust reqwest 호출
  ├── Groq:
  │     Chrome: 직접 HTTPS API 호출
  │     Desktop: Tauri invoke → Rust reqwest 호출
  └── 실패 시 다음 제공자로 폴백
```

### 보안 저장소 흐름

```
API 키 저장 요청
  Chrome: → 네이티브 메시지 → codex-native-host.mjs → keytar
  Desktop: → Tauri invoke → Rust keyring crate → OS Keychain
                                               → AES-256-GCM 암호화 캐시

API 키 읽기 요청
  Chrome: → 네이티브 메시지 → codex-native-host.mjs → keytar
  Desktop: → Rust 메모리 캐시 확인 → 복호화 후 반환
           → 캐시 미스 시 "설정에서 다시 저장" 오류
```

---

## 모듈 의존성 그래프

```
core/analysisService
  ├── core/contracts (인터페이스)
  ├── modules/analyzer/analyzeInput
  │     ├── modules/analyzer/analyzeText
  │     │     ├── modules/parser/* (정규화, 언어감지, 엔티티추출)
  │     │     ├── modules/scorer/calculateWarningScore
  │     │     ├── modules/classifier/classifySignals
  │     │     ├── modules/analyzer/evaluateAiHookingChecklist
  │     │     ├── modules/explanation/generateExplanation
  │     │     └── data/* (규칙, 체크리스트, 기준점)
  │     ├── modules/providers/* (AI 제공자)
  │     └── modules/ocr/extractTextFromImage
  └── shared/* (타입, 상수, 유틸리티)
```

---

## 빌드 파이프라인

### Chrome 확장

```
vite.config.ts
  → 5개 entry point 빌드:
    popup.html, options.html, offscreen.html,
    background/index.ts, content/index.ts
  → dist/ 산출
  → manifest.json 포함
```

### 데스크톱 앱

```
vite.desktop.config.ts
  → 2개 entry point 빌드:
    desktop.html, capture-overlay.html
  → main/.desktop-renderer/ 산출

cargo tauri build
  → Rust 컴파일 (tauri-app/)
  → .desktop-renderer를 WebView 리소스로 번들
  → 플랫폼별 인스톨러 생성 (.dmg, .exe, .AppImage)
```
