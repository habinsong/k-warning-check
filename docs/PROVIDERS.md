# AI 제공자 가이드

K-워닝체크가 지원하는 AI 제공자(Gemini, Groq, Codex)의 연동 구조, 설정, API 호출 방식을 설명합니다.

---

## 개요

AI 제공자는 **선택적** 기능입니다. 제공자 없이도 규칙 기반 분석은 완전히 동작하며, 제공자를 설정하면 다음 기능이 추가됩니다:

| 기능 | 설명 | 사용 제공자 |
|------|------|------------|
| 이미지 텍스트 추출 | AI Vision으로 이미지에서 텍스트 추출 | Gemini, Groq |
| 웹 최신성 검증 | 분석된 내용의 사실 여부 확인 | Groq (웹 검색 도구) |
| 설명 개선 | AI가 분석 요약을 더 자연스럽게 재작성 | Gemini, Groq, Codex |
| 요약 | 긴 텍스트를 핵심 내용으로 요약 | Gemini, Groq, Codex |

---

## 제공자 아키텍처

### 어댑터 패턴

모든 제공자는 `AIProviderAdapter` 인터페이스를 구현합니다:

```typescript
interface AIProviderAdapter {
  readonly name: string
  readonly providerType: 'gemini' | 'groq' | 'codex'

  summarize(text: string, options?): Promise<string>
  refineExplanation(analysis, options?): Promise<string>
  assistOcr?(imageDataUrl: string): Promise<string>
  extractTextFromImage?(imageDataUrl: string): Promise<string>
  verifyFreshness?(claims: string[]): Promise<WebFreshnessVerification>
  supportsWebFreshnessCheck(): boolean
}
```

### 제공자 팩토리

`createConfiguredProviders()`가 설정에 따라 제공자 목록을 생성합니다:

```
preferredProvider 확인
  → 해당 제공자 우선 생성
  → 나머지 설정된 제공자 추가 (중복 제거)
  → 순서대로 시도, 실패 시 다음으로 폴백
```

---

## Google Gemini

### 설정

```typescript
interface GeminiSettings {
  apiKey: string              // API 키 (보안 저장소)
  model: string               // 기본: 'gemini-2.5-flash'
  webSearchEnabled: boolean   // 웹 검색 활성화
  apiKeyRetention: string     // 보관 기간 ('7d', '30d', 'hourly')
}
```

### API 엔드포인트

```
POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent
```

### 지원 기능

| 기능 | API 호출 | 타임아웃 |
|------|---------|---------|
| `summarize` | generateContent | 8초 |
| `extractTextFromImage` | generateContent (Vision) | 20초 |
| `verifyFreshness` | generateContent | 15초 |
| `refineExplanation` | generateContent | 8초 |

### Vision 호출 (이미지 텍스트 추출)

```json
{
  "contents": [{
    "parts": [
      { "text": "이 이미지에서 텍스트를 추출해주세요..." },
      { "inlineData": { "mimeType": "image/png", "data": "base64..." } }
    ]
  }],
  "generationConfig": { "temperature": 0.1 }
}
```

### 모델 옵션

| 모델 ID | 설명 |
|---------|------|
| `gemini-2.5-flash` | 기본, 빠른 응답 |
| `gemini-2.5-pro` | 고품질 분석 |
| `gemini-2.0-flash` | 경량 |

---

## Groq

### 설정

```typescript
interface GroqSettings {
  apiKey: string              // API 키 (보안 저장소)
  model: string               // 기본: 'groq/compound'
  webSearchEnabled: boolean   // 웹 검색 도구 활성화
  apiKeyRetention: string     // 보관 기간
}
```

### API 엔드포인트

```
POST https://api.groq.com/openai/v1/chat/completions
```

### 모델 유형

| 유형 | 모델 예시 | 특징 |
|------|----------|------|
| Compound | `groq/compound` | Groq 자체 라우팅, 도구 자동 사용 |
| OSS | `llama-4-scout-17b-16e-instruct` | 오픈소스 모델 직접 호출 |
| Vision | `llama-4-scout-17b-16e-instruct` | 이미지 입력 지원 |

### 도구 (Tools)

Groq compound 모델에서 사용 가능한 도구:

```json
[
  { "type": "web_search", "function": { ... } },
  { "type": "code_interpreter", "function": { ... } }
]
```

웹 검색이 활성화되면 `verifyFreshness` 기능이 지원됩니다.

### Vision 호출 (이미지 텍스트 추출)

```json
{
  "model": "llama-4-scout-17b-16e-instruct",
  "messages": [{
    "role": "user",
    "content": [
      { "type": "text", "text": "이 이미지에서 텍스트를 추출..." },
      { "type": "image_url", "image_url": { "url": "data:image/png;base64,..." } }
    ]
  }]
}
```

---

## Codex 브릿지

### 개요

Codex(OpenAI CLI)를 로컬 HTTP 서버로 래핑하여 K-워닝체크에서 사용합니다.

### 설정

```typescript
interface CodexBridgeSettings {
  bridgeUrl: string           // 기본: 'http://127.0.0.1:4317'
  bridgeToken: string         // 인증 토큰
  workspaceRoot: string       // 작업 디렉토리
  model: string               // 기본: 'gpt-5.4-mini'
  reasoningEffort: string     // 'low' | 'medium' | 'high'
}
```

### 브릿지 서버 (`main/scripts/codex-bridge.mjs`)

로컬에서 실행되는 HTTP 서버로, Codex CLI를 프록시합니다.

#### 엔드포인트

| 경로 | 메서드 | 설명 |
|------|--------|------|
| `/health` | GET | Codex 상태 및 버전 확인 |
| `/summarize` | POST | 텍스트 요약/분석 |
| `/ocr-image` | POST | 이미지 OCR (파일 기반) |

#### 인증

```
X-KWC-Bridge-Token: {bridgeToken}
```

토큰은 `~/.k-warning-check/codex-bridge.json`에 저장되며, 데스크톱 앱이 자동 생성합니다.

#### 보안

- 루프백 전용 (127.0.0.1)
- CORS origin 화이트리스트
- 토큰 기반 인증

### 브릿지 시작 방법

**데스크톱 앱:** 설정 → Codex 탭 → "브릿지 시작" 버튼

**수동 시작:**
```bash
CODEX_BRIDGE_PORT=4317 \
CODEX_BRIDGE_TOKEN=your-token \
node main/scripts/codex-bridge.mjs
```

### Codex 로그인

Codex CLI 사용을 위해 OpenAI 계정 인증이 필요합니다:

```bash
codex login
```

데스크톱 앱에서는 설정 화면의 "로그인" 버튼으로 OAuth 흐름을 시작할 수 있습니다.

---

## 제공자 우선순위 & 폴백

```
사용자 설정의 preferredProvider
  │
  ├── codex  → Codex 브릿지 시도
  │            실패 → groq 시도 → gemini 시도
  │
  ├── groq   → Groq API 시도
  │            실패 → gemini 시도 → codex 시도
  │
  └── gemini → Gemini API 시도
               실패 → groq 시도 → codex 시도
```

### 폴백 조건

- API 키 미설정
- 네트워크 오류
- API 응답 오류 (4xx, 5xx)
- 타임아웃 초과

---

## 플랫폼별 API 호출 경로

### Chrome 확장

```
React UI → Background Worker → Provider Adapter → 직접 HTTPS 요청
                                                   (API 키를 프론트엔드에서 관리)
```

### 데스크톱 앱

```
React UI → desktopRemoteProvider
  → window.kwcDesktop.providerBridge.invoke(provider, operation, payload)
  → Tauri invoke('kwc_provider_bridge_invoke')
  → Rust reqwest HTTP 클라이언트 → 외부 API
    (API 키를 Rust 프로세스 내부에서만 사용 — 프론트엔드 노출 없음)
```

---

## API 키 관리

### 저장 위치

| 플랫폼 | 1차 저장소 | 2차 캐시 |
|--------|-----------|---------|
| macOS | Keychain | AES-256-GCM 암호화 파일 |
| Windows | Credential Locker | AES-256-GCM 암호화 파일 |
| Linux | Secret Service | AES-256-GCM 암호화 파일 |
| Chrome 확장 | 네이티브 호스트 → keytar | - |

### 보관 기간 (Retention)

| 옵션 | 기간 |
|------|------|
| `hourly` | 1시간 |
| `1d` | 1일 |
| `7d` | 7일 (기본) |
| `30d` | 30일 |

만료된 키는 자동 삭제됩니다.

### 검증

`validateSecret` 명령으로 저장된 키의 유효성을 확인하고 `lastValidationAt` 타임스탬프를 갱신합니다.
