# 보안 설계

K-워닝체크의 API 키 관리, 암호화, CSP, 네트워크 보안 설계를 설명합니다.

---

## 보안 원칙

1. **API 키는 OS 키체인에만 저장** — 평문으로 디스크에 저장하지 않음
2. **데스크톱 앱에서 API 키는 Rust 프로세스 내부에서만 사용** — WebView(프론트엔드)에 노출되지 않음
3. **외부 URL은 HTTPS 전용** — `shell.openExternal()`은 HTTPS만 허용
4. **Codex 브릿지는 루프백 전용** — 127.0.0.1에서만 접근 가능
5. **만료 기반 자동 삭제** — 보관 기간이 지난 API 키는 자동 제거

---

## API 키 보안 저장소

### 2계층 구조

```
┌─────────────────────────┐
│   1계층: OS 키체인       │  ← 영구 저장 (앱 재시작 후에도 유지)
│   (keyring crate)       │
├─────────────────────────┤
│   2계층: AES-256-GCM    │  ← 런타임 캐시 (빠른 접근)
│   암호화 파일 캐시       │
└─────────────────────────┘
```

### OS 키체인 백엔드

| 플랫폼 | 백엔드 | 서비스 이름 |
|--------|--------|------------|
| macOS | Keychain | `K-WarningCheck` |
| Windows | Credential Locker | `K-WarningCheck` |
| Linux | Secret Service (GNOME Keyring) | `K-WarningCheck` |

### AES-256-GCM 암호화 캐시

런타임 성능을 위해 암호화된 로컬 캐시를 유지합니다.

#### 캐시 키 파생

```
key = SHA-256("K-WarningCheck:{platform}:{homedir}:{homedir}:{hostname}:{username}")
```

- 머신 고유 값으로 키 파생
- 다른 머신에서는 복호화 불가

#### 캐시 레코드 구조

```json
{
  "iv": "base64-encoded-12-bytes",
  "cipherText": "base64-encoded",
  "authTag": "base64-encoded-16-bytes"
}
```

- **IV**: 12바이트 랜덤 (매 암호화마다 새로 생성)
- **인증 태그**: 16바이트 (무결성 검증)
- **알고리즘**: AES-256-GCM (AEAD)

#### 저장 파일

| 파일 | 내용 |
|------|------|
| `~/.k-warning-check/secure-store-cache.json` | 암호화된 API 키 캐시 |
| `~/.k-warning-check/secure-store-metadata.json` | 메타데이터 (만료일, 검증일) |

### 메타데이터 추적

```typescript
interface SecretMetadata {
  provider: string              // 'gemini' | 'groq'
  retention: string             // '7d', '30d', 'hourly'
  createdAt: number             // 생성 시각 (ms)
  expiresAt: number | null      // 만료 시각 (ms)
  lastValidationAt: number | null  // 마지막 검증 시각
}
```

### 만료 처리

1. API 키 조회 시 `expiresAt` 확인
2. 만료된 경우:
   - OS 키체인에서 삭제
   - 메타데이터 삭제
   - 암호화 캐시 삭제
   - 오류 반환: "API 키 보관 기간이 만료되었습니다."
3. 사용자가 다시 저장해야 함

---

## 네트워크 보안

### CSP (Content Security Policy)

데스크톱 앱 (`tauri.conf.json`):

```
default-src 'self';
connect-src 'self'
  https://generativelanguage.googleapis.com
  https://api.groq.com
  http://127.0.0.1:4317;
script-src 'self' 'unsafe-inline';
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:
```

| 지시어 | 허용 대상 |
|--------|----------|
| `connect-src` | Gemini API, Groq API, 로컬 Codex 브릿지 |
| `script-src` | 자체 스크립트 + 인라인 (Vite HMR용) |
| `img-src` | 자체 + data URL (캡처 이미지) + blob |

### 외부 URL 검증

`kwc_system_open_external` 커맨드는 HTTPS URL만 허용합니다:

```rust
fn parse_safe_external_url(raw: &str) -> Result<String, String> {
    let parsed = Url::parse(raw)?;
    if parsed.scheme() != "https" {
        return Err("HTTPS만 허용됩니다.");
    }
    Ok(parsed.to_string())
}
```

### Codex 브릿지 보안

| 보안 계층 | 설명 |
|----------|------|
| 루프백 바인딩 | `127.0.0.1:4317`에서만 수신 |
| 토큰 인증 | `X-KWC-Bridge-Token` 헤더 필수 |
| CORS 화이트리스트 | 허용된 origin만 접근 가능 |
| IP 검증 | 루프백 주소만 허용 |

---

## 데스크톱 앱 API 키 격리

데스크톱 앱에서는 프론트엔드(WebView)에 API 키가 전달되지 않습니다.

```
                              ┌─────────────────────┐
  React UI                    │   Rust Backend       │
  (WebView)                   │                      │
  ┌──────────────┐           │  ┌────────────────┐  │
  │ "Gemini로    │ invoke()  │  │ provider_bridge │  │
  │  분석해줘"   │ ────────► │  │                 │  │
  │              │           │  │ 1. 보안저장소    │  │
  │ API 키 없음  │           │  │    에서 키 읽기  │  │
  └──────────────┘           │  │ 2. reqwest로    │  │
         ▲                   │  │    API 호출     │  │
         │                   │  │ 3. 결과만 반환   │  │
  결과만  │                   │  └────────────────┘  │
  전달    │ ◄──────────────── │                      │
         │                   └─────────────────────┘
```

Chrome 확장에서는 Background Service Worker에서 직접 API를 호출하며, API 키는 네이티브 호스트를 통해 OS 키체인에서 관리됩니다.

---

## 입력 검증

### 사용자 입력

| 입력 | 검증 |
|------|------|
| 분석 텍스트 | `normalizeText()`로 위험 문자 제거 |
| URL | `URL()` 파서로 유효성 확인 |
| 이미지 | data URL 형식 검증 |
| API 키 | 빈 문자열 거부, trim 처리 |
| 외부 URL 열기 | HTTPS 스킴 강제 |

### Provider 검증

| 검증 | 방법 |
|------|------|
| Provider 이름 | `gemini` 또는 `groq`만 허용 (`assert_provider`) |
| API 응답 | HTTP 상태 코드 + JSON 구조 검증 |
| 타임아웃 | 작업별 개별 타임아웃 (8~20초) |

---

## 권한 관리 (macOS)

### 화면 캡처 권한

macOS에서 화면 캡처를 위해 "화면 및 시스템 오디오 녹화" 권한이 필요합니다.

```rust
// CoreGraphics FFI
extern "C" {
    fn CGPreflightScreenCaptureAccess() -> bool;
    fn CGRequestScreenCaptureAccess() -> bool;
}
```

1. `CGPreflightScreenCaptureAccess()` — 권한 사전 확인
2. 권한 없으면 시스템 설정으로 안내
3. 사용자가 권한 허용 후 앱 재시작 필요

---

## 위협 모델 및 대응

| 위협 | 대응 |
|------|------|
| API 키 디스크 노출 | OS 키체인 + AES-256-GCM 암호화 캐시 |
| API 키 메모리 노출 | 데스크톱: Rust 프로세스 내부에서만 사용 |
| 중간자 공격 | HTTPS 전용 통신 |
| XSS | CSP로 외부 스크립트 차단 |
| 브릿지 무단 접근 | 루프백 + 토큰 인증 + CORS |
| 만료 키 재사용 | 자동 만료 + 메타데이터 기반 삭제 |
| 다른 머신에서 캐시 사용 | 머신 고유 키 파생 (hostname, username, homedir) |
