# 데스크톱 앱 (Tauri v2)

Tauri v2 기반 데스크톱 앱의 Rust 백엔드 구조, 커맨드, 빌드 방법을 설명합니다.

---

## 개요

| 항목 | 내용 |
|------|------|
| 프레임워크 | Tauri v2 |
| 백엔드 | Rust |
| 프론트엔드 | React (main/ 공유 코드) |
| 번들 사이즈 | ~30MB (DMG) / ~10MB (앱 단독) |
| 지원 플랫폼 | macOS (aarch64, x64), Windows, Linux |

Electron 대비 번들 사이즈가 **~150MB → ~30MB**로 약 80% 감소했습니다.

---

## 디렉토리 구조

```
tauri-app/
├── src/
│   ├── main.rs                 # 엔트리 포인트
│   ├── lib.rs                  # 앱 빌더, 플러그인, 커맨드 등록
│   ├── store.rs                # JSON 파일 I/O 유틸리티
│   ├── secure.rs               # OS 키체인 + AES-256-GCM 암호화 캐시
│   └── commands/
│       ├── mod.rs              # 커맨드 모듈 re-export
│       ├── history.rs          # 히스토리 CRUD
│       ├── provider_state.rs   # 설정 상태 관리
│       ├── secure_store.rs     # 보안 저장소 커맨드
│       ├── provider_bridge.rs  # Gemini/Groq HTTP 프록시
│       ├── codex.rs            # Codex CLI 브릿지/로그인
│       ├── system.rs           # 클립보드, URL, 권한
│       └── capture.rs          # 화면 영역 캡처
├── capabilities/
│   └── default.json            # Tauri ACL 권한 정의
├── icons/                      # 앱 아이콘 (모든 플랫폼)
├── Cargo.toml                  # Rust 의존성
├── Cargo.lock
├── build.rs                    # Tauri 빌드 스크립트
└── tauri.conf.json             # Tauri 앱 설정
```

---

## 앱 설정 (`tauri.conf.json`)

```json
{
  "productName": "K-WarningCheck Desktop",
  "identifier": "kr.kwarningcheck.desktop",
  "version": "0.1.0",
  "build": {
    "frontendDist": "../main/.desktop-renderer",
    "devUrl": "http://127.0.0.1:4173"
  },
  "app": {
    "macOSPrivateApi": true,
    "windows": [{
      "label": "main",
      "title": "K-워닝체크 Desktop",
      "width": 1360, "height": 920,
      "minWidth": 880, "minHeight": 620
    }]
  }
}
```

| 설정 | 설명 |
|------|------|
| `frontendDist` | 빌드된 React 렌더러 경로 |
| `devUrl` | 개발 모드 Vite 서버 |
| `macOSPrivateApi` | 투명 윈도우 지원 (캡처 오버레이) |

---

## Rust 커맨드

### 히스토리 (`commands/history.rs`)

`HistoryStore`는 `Mutex` 기반 동시성 안전 저장소입니다.

| 커맨드 | 설명 |
|--------|------|
| `kwc_history_get_bundle` | 히스토리 목록 + 최근 레코드 반환 |
| `kwc_history_save_record` | 레코드 저장 (중복 제거, 50개 제한) |
| `kwc_history_delete_record` | ID로 레코드 삭제 |
| `kwc_history_clear` | 전체 히스토리 삭제 |
| `kwc_history_get_record_by_id` | ID로 레코드 조회 |

저장 위치: `~/.k-warning-check/history.json`

### 설정 상태 (`commands/provider_state.rs`)

원본 JavaScript 197줄을 Rust로 완전 이식했습니다.

| 커맨드 | 설명 |
|--------|------|
| `kwc_provider_state_get` | 현재 설정 로드 (기본값 병합) |
| `kwc_provider_state_save` | 설정 저장 (민감 데이터 제거 후) |

주요 내부 함수:
- `merge_provider_state()` — 저장된 상태 + 보안 저장소 상태 + 기본값 병합
- `sanitize_persisted_state()` — API 키, 브릿지 토큰 등 민감 필드 제거
- `sync_provider_security_metadata()` — 보안 저장소 메타데이터 동기화

### 보안 저장소 (`commands/secure_store.rs` + `secure.rs`)

2계층 보안 저장소:
1. **OS 키체인** — `keyring` crate (macOS Keychain, Windows Credential Locker, Linux Secret Service)
2. **AES-256-GCM 암호화 캐시** — 런타임 빠른 접근용

| 커맨드 | 설명 |
|--------|------|
| `kwc_secure_store_get_status` | 전체 보안 저장소 상태 |
| `kwc_secure_store_set_secret` | API 키 저장 (키체인 + 캐시) |
| `kwc_secure_store_delete_secret` | API 키 삭제 |
| `kwc_secure_store_validate_secret` | API 키 유효성 확인 + 타임스탬프 갱신 |

캐시 키 파생:
```
SHA-256("K-WarningCheck:{platform}:{homedir}:{homedir}:{hostname}:{username}")
```

### Provider Bridge (`commands/provider_bridge.rs`)

프론트엔드에 API 키를 노출하지 않고 Rust에서 직접 외부 API를 호출합니다.

| 커맨드 | 설명 |
|--------|------|
| `kwc_provider_bridge_invoke` | 제공자별 API 호출 디스패치 |

지원 작업:

| operation | 설명 | Gemini | Groq |
|-----------|------|--------|------|
| `summarize` | 텍스트 요약 | O | O |
| `extractTextFromImage` | 이미지 텍스트 추출 | O (Vision) | O (Vision) |
| `verifyFreshness` | 웹 최신성 검증 | O | O (웹 검색 도구) |

내부 동작:
1. 보안 저장소에서 API 키 읽기
2. `reqwest::Client`로 외부 API 호출
3. 응답 파싱 후 프론트엔드에 반환

### Codex 통합 (`commands/codex.rs`)

| 커맨드 | 설명 |
|--------|------|
| `kwc_codex_get_status` | `codex login status` 실행 결과 |
| `kwc_codex_start_bridge` | Node.js 브릿지 프로세스 스폰 |
| `kwc_codex_start_login` | `codex login` OAuth 흐름 시작 |

주요 내부 함수:
- `find_codex_bin()` — `~/.npm-global/bin/codex`, `/usr/local/bin/codex` 등 탐색
- `is_bridge_open()` — TCP 연결로 브릿지 포트(4317) 확인
- `kill_bridge_on_port()` — 기존 브릿지 프로세스 종료 (macOS: `lsof`, Windows: `netstat`)

### 시스템 (`commands/system.rs`)

| 커맨드 | 설명 |
|--------|------|
| `kwc_system_read_clipboard_text` | 클립보드 텍스트 읽기 |
| `kwc_system_open_external` | 외부 URL 열기 (HTTPS 전용) |
| `kwc_system_get_screen_capture_permission_status` | macOS 화면 녹화 권한 확인 |
| `kwc_system_request_screen_capture_permission` | macOS 권한 요청 다이얼로그 |

### 화면 캡처 (`commands/capture.rs`)

| 커맨드 | 설명 |
|--------|------|
| `kwc_system_capture_screen_region` | 캡처 오버레이 윈도우 열기 |
| `kwc_capture_overlay_complete` | 선택 영역 캡처 완료 |
| `kwc_capture_overlay_cancel` | 캡처 취소 |

캡처 흐름:
```
1. kwc_system_capture_screen_region 호출
2. 투명 풀스크린 WebviewWindow 생성 (capture-overlay.html)
3. CaptureOverlayApp.tsx에서 사용자가 드래그로 영역 선택
4. kwc_capture_overlay_complete(rect) 호출
5. xcap::Monitor::capture_image()로 스크린샷
6. image crate로 선택 영역 크롭
7. PNG → base64 data URL로 인코딩
8. oneshot 채널로 결과 반환
```

---

## Rust 의존성

| Crate | 용도 |
|-------|------|
| `tauri` v2 | 앱 프레임워크 |
| `tauri-plugin-shell` | 외부 프로세스 실행 |
| `tauri-plugin-clipboard-manager` | 클립보드 접근 |
| `tauri-plugin-opener` | URL/파일 열기 |
| `reqwest` | HTTP 클라이언트 (AI API 호출) |
| `keyring` | OS 키체인 (API 키 보관) |
| `aes-gcm` | AES-256-GCM 암호화 |
| `sha2` | SHA-256 해시 (캐시 키 파생) |
| `xcap` | 크로스플랫폼 화면 캡처 |
| `image` | 이미지 처리 (크롭, PNG 인코딩) |
| `serde` / `serde_json` | JSON 직렬화 |
| `tokio` | 비동기 런타임 |
| `rand` | 난수 생성 (토큰, IV) |
| `base64` | Base64 인코딩/디코딩 |
| `dirs` | 사용자 디렉토리 경로 |
| `chrono` | 날짜/시간 |
| `url` | URL 파싱 및 검증 |

---

## Tauri 플러그인 & 권한

### 등록된 플러그인

```rust
tauri::Builder::default()
    .plugin(tauri_plugin_shell::init())
    .plugin(tauri_plugin_clipboard_manager::init())
    .plugin(tauri_plugin_opener::init())
```

### ACL 권한 (`capabilities/default.json`)

```json
{
  "permissions": [
    "core:default",
    "core:window:allow-create",
    "core:window:allow-close",
    "core:window:allow-set-always-on-top",
    "shell:allow-open",
    "clipboard-manager:allow-read-text",
    "opener:default"
  ]
}
```

---

## 빌드

### 개발 모드

```bash
npm run dev:tauri
```

내부 동작:
1. `vite --host 127.0.0.1 --port 4173` — 프론트엔드 개발 서버
2. `cargo tauri dev` — Rust 백엔드 컴파일 + WebView 연결

### 프로덕션 빌드

```bash
# Tauri 기본 빌드 (현재 OS)
npm run build:tauri

# macOS 빌드 → mac-app/ (ad-hoc 서명 포함)
npm run build:mac

# Windows 크로스 컴파일 → windows-app/ (macOS에서 cargo-xwin 필요)
npm run build:windows
```

### 산출물

| 플랫폼 | 명령 | 산출 경로 | 포맷 |
|--------|------|----------|------|
| macOS | `build:mac` | `mac-app/*.app` + `*.dmg` | 앱 번들 + DMG |
| Windows | `build:windows` | `windows-app/*.exe` | 포터블 EXE |

macOS 빌드 시 `xattr -cr` (격리 속성 제거) + `codesign --force --deep --sign -` (ad-hoc 서명)이 자동 수행됩니다.

---

## 데이터 저장 경로

모든 앱 데이터는 `~/.k-warning-check/`에 저장됩니다:

```
~/.k-warning-check/
├── history.json                 # 분석 히스토리 (최대 50개)
├── provider-state.json          # 설정 상태 (API 키 제외)
├── secure-store-metadata.json   # 보안 저장소 메타데이터
├── secure-store-cache.json      # AES-256-GCM 암호화 캐시
├── codex-bridge.json            # Codex 브릿지 토큰
└── runtime/                     # 런타임 파일
```
