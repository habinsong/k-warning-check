# Chrome 확장프로그램

K-워닝체크 Chrome 확장프로그램의 구조, Manifest V3 설정, 메시지 프로토콜, 콘텐츠 스크립트를 설명합니다.

---

## 개요

| 항목 | 내용 |
|------|------|
| Manifest 버전 | V3 |
| 이름 | K-워닝체크 |
| 권한 | storage, scripting, contextMenus, commands, clipboardRead, nativeMessaging, offscreen |
| 호스트 권한 | googleapis.com, api.groq.com, localhost |

---

## 디렉토리 구조

```
main/
├── public/
│   ├── manifest.json              # Chrome 확장 매니페스트
│   ├── icons/                     # 확장 아이콘 (16, 48, 128px)
│   ├── favicon.svg                # SVG 파비콘
│   └── icons.svg                  # UI 아이콘 스프라이트
├── src/
│   ├── background/
│   │   └── index.ts               # 서비스 워커 (메인 로직)
│   ├── content/
│   │   └── index.ts               # 콘텐츠 스크립트
│   ├── popup/
│   │   ├── PopupApp.tsx           # 팝업 UI
│   │   └── components/
│   │       ├── RecordCard.tsx     # 분석 결과 카드
│   │       ├── ScoreGauge.tsx     # 점수 게이지
│   │       └── GradeBadge.tsx     # 등급 배지
│   ├── options/
│   │   └── OptionsApp.tsx         # 설정 페이지
│   ├── offscreen/
│   │   └── main.ts                # Offscreen Document
│   ├── core/                      # 분석 서비스 (공용)
│   ├── modules/                   # 분석 엔진 (공용)
│   ├── data/                      # 규칙 정의 (공용)
│   └── shared/                    # 타입/유틸리티 (공용)
├── popup.html                     # 팝업 entry
├── options.html                   # 설정 entry
├── offscreen.html                 # Offscreen entry
├── vite.config.ts                 # Chrome 확장 빌드 설정
└── package.json
```

빌드 산출물: `dist/` 디렉토리

---

## Manifest V3 설정

### 주요 설정

```json
{
  "manifest_version": 3,
  "name": "K-워닝체크",
  "permissions": [
    "storage",
    "scripting",
    "contextMenus",
    "commands",
    "clipboardRead",
    "nativeMessaging",
    "offscreen"
  ],
  "host_permissions": [
    "https://generativelanguage.googleapis.com/*",
    "https://api.groq.com/*",
    "http://127.0.0.1:4317/*"
  ]
}
```

### 키보드 단축키

| 단축키 | macOS | 기능 |
|--------|-------|------|
| `Ctrl+Shift+Y` | `Cmd+Shift+Y` | 팝업 열기 |
| `Ctrl+Shift+V` | `Cmd+Shift+V` | 클립보드 분석 |
| `Ctrl+Shift+S` | `Cmd+Shift+S` | 선택 텍스트 분석 |
| `Ctrl+Shift+X` | `Cmd+Shift+X` | 화면 영역 캡처 |

---

## 서비스 워커 (`background/index.ts`)

확장프로그램의 메인 로직이 실행되는 Background Service Worker입니다.

### 초기화

```typescript
// 의존성 주입으로 분석 서비스 구성
const analysisService = new AnalysisService({
  historyRepository: chromeHistoryRepository,
  providerStateRepository: chromeProviderStateRepository,
  secureStoreService: chromeSecureStoreService,
  clipboardReader: offscreenClipboardReader,
  notifier: runtimeMessageNotifier,
})
```

### 메시지 핸들러

Background Worker는 `chrome.runtime.onMessage`로 다음 메시지를 처리합니다:

#### 분석

| 메시지 타입 | 설명 | 페이로드 |
|------------|------|---------|
| `analyze-input` | 범용 분석 | `{ input: AnalysisInput }` |
| `analyze-active-selection` | 선택 텍스트 분석 | - |
| `capture-active-area` | 화면 영역 캡처 분석 | - |

#### 히스토리

| 메시지 타입 | 설명 |
|------------|------|
| `get-history` | 히스토리 목록 조회 |
| `get-record` | ID로 레코드 조회 |
| `delete-record` | 레코드 삭제 |
| `clear-history` | 전체 삭제 |

#### 설정

| 메시지 타입 | 설명 |
|------------|------|
| `get-provider-state` | 설정 상태 조회 |
| `save-provider-state` | 설정 저장 |
| `get-secure-store-status` | 보안 저장소 상태 |
| `set-provider-secret` | API 키 저장 |
| `delete-provider-secret` | API 키 삭제 |
| `validate-provider-secret` | API 키 검증 |

#### Codex

| 메시지 타입 | 설명 |
|------------|------|
| `codex-status` | Codex 상태 확인 |
| `start-codex-bridge` | 브릿지 시작 |
| `start-codex-login` | 로그인 시작 |

#### 시스템

| 메시지 타입 | 설명 |
|------------|------|
| `read-clipboard` | 클립보드 텍스트 읽기 |
| `open-external` | 외부 URL 열기 |

#### 알림

| 메시지 타입 | 방향 | 설명 |
|------------|------|------|
| `analysis-ready` | Worker → Popup | 분석 완료 알림 |

### 메시지 프로토콜

```typescript
// 요청
interface RuntimeMessage {
  type: string
  [key: string]: any
}

// 응답
interface RuntimeResponse {
  ok: boolean
  data?: any
  error?: string
}
```

---

## 팝업 UI (`popup/PopupApp.tsx`)

### 탭 구조

| 탭 | 설명 |
|----|------|
| 텍스트 | 직접 텍스트 입력 후 분석 |
| URL | URL 입력 후 분석 |
| 이미지 | 이미지 업로드 후 OCR → 분석 |

### 주요 기능

1. **분석 실행** — 입력 데이터로 분석 시작
2. **최근 결과** — 가장 최근 분석 결과 표시 (RecordCard)
3. **히스토리** — 최근 5개 레코드 미리보기
4. **설정 이동** — 옵션 페이지 열기

### UI 컴포넌트

| 컴포넌트 | 설명 |
|----------|------|
| `RecordCard` | 분석 결과 카드 (등급 배지, 점수, 요약, 체크리스트) |
| `ScoreGauge` | 원형 점수 게이지 (0~100) |
| `GradeBadge` | 위험 등급 색상 배지 |

---

## 설정 페이지 (`options/OptionsApp.tsx`)

### 설정 항목

#### 일반

- UI 언어 (한국어/영어)
- 테마 (밝게/어둡게/시스템)
- 자동 제공자 사용
- 원격 설명 개선 활성화
- 원격 OCR 활성화

#### Gemini 설정

- API 키 입력 및 보관 기간
- 모델 선택
- 웹 검색 활성화

#### Groq 설정

- API 키 입력 및 보관 기간
- 모델 선택
- 웹 검색 활성화

#### Codex 설정

- 브릿지 상태 표시
- 브릿지 시작/정지
- 로그인 상태 및 로그인 버튼
- 모델 및 추론 노력 수준

---

## Offscreen Document (`offscreen/main.ts`)

Manifest V3에서는 DOM 접근이 제한되므로, Offscreen Document를 통해 다음 기능을 수행합니다:

| 기능 | 설명 |
|------|------|
| 클립보드 읽기 | `document.execCommand('paste')` |
| OCR 실행 | Tesseract.js Worker |

---

## 콘텐츠 스크립트 (`content/index.ts`)

웹 페이지에 주입되어 다음 기능을 제공합니다:

| 기능 | 설명 |
|------|------|
| 선택 텍스트 수집 | `window.getSelection()` |
| 페이지 URL/제목 전달 | 분석 메타데이터용 |

---

## 저장소

Chrome 확장은 `chrome.storage.local`을 사용합니다:

| 키 | 내용 |
|----|------|
| `kwc:history` | 분석 히스토리 (최대 50개) |
| `kwc:latestRecord` | 최근 분석 결과 |
| `kwc:providerState` | 설정 상태 |

보안 저장소(API 키)는 네이티브 메시징 호스트를 통해 OS 키체인에 저장됩니다.

---

## 네이티브 메시징

### 네이티브 호스트

Chrome 확장은 `kr.k_warning_check.codex` 네이티브 호스트와 통신합니다.

| 파일 | 설명 |
|------|------|
| `main/native/kr.k_warning_check.codex.json` | 네이티브 호스트 매니페스트 |
| `main/native/codex-native-host.mjs` | 메시지 핸들러 |
| `main/native/codex-services.mjs` | Codex/보안 저장소 서비스 |

### 설치

```bash
npm run native:install
```

이 명령은 `main/scripts/install-native-host.mjs`를 실행하여:
1. 플랫폼별 네이티브 호스트 매니페스트 디렉토리에 JSON 파일 복사
2. 실행 가능한 래퍼 스크립트 생성 (shell/batch)

### 메시지 프로토콜

네이티브 호스트는 표준 Chrome 네이티브 메시징 프로토콜(4바이트 길이 헤더 + JSON)을 사용합니다.

| 메시지 타입 | 설명 |
|------------|------|
| `secure-store-status` | 보안 저장소 상태 조회 |
| `secure-store-set-secret` | API 키 저장 |
| `secure-store-get-secret` | API 키 조회 |
| `secure-store-delete-secret` | API 키 삭제 |
| `secure-store-validate` | API 키 검증 |
| `codex-status` | Codex 상태 |
| `get-host-info` | 브릿지 연결 정보 |
| `start-codex-bridge` | 브릿지 시작 |
| `start-codex-login` | 로그인 시작 |

---

## 빌드

### Vite 설정 (`vite.config.ts`)

5개 엔트리 포인트를 번들링합니다:

```typescript
build: {
  rollupOptions: {
    input: {
      popup: 'popup.html',
      options: 'options.html',
      offscreen: 'offscreen.html',
      background: 'src/background/index.ts',
      content: 'src/content/index.ts',
    }
  }
}
```

### 빌드 명령

```bash
# 프로덕션 빌드
npm run build:extension

# 개발 모드 (watch)
npm run dev:extension
```

### 설치 방법

1. `npm run build:extension` 실행
2. Chrome → `chrome://extensions` 이동
3. "개발자 모드" 활성화
4. "압축해제된 확장 프로그램을 로드" → `dist/` 선택
