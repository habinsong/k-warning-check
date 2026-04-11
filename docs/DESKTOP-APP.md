# 데스크톱 앱

데스크톱 앱은 Tauri v2 기반이며, React 렌더러와 Rust command 계층으로 나뉩니다. 수동 분석, 클립보드 분석, 화면 캡처, 기록 탐색, 글로벌 단축키가 핵심 기능입니다.

---

## 구성

```text
tauri-app/
├── src/commands/
│   ├── history.rs
│   ├── provider_state.rs
│   ├── provider_bridge.rs
│   ├── secure_store.rs
│   ├── system.rs
│   ├── capture.rs
│   └── codex.rs
└── src/lib.rs

main/src/desktop/renderer/
├── DesktopApp.tsx
├── services.ts
└── tauri-bridge.ts
```

---

## Rust 쪽 역할

- 기록 CRUD
- provider state 정규화
- OS 보안 저장소 접근
- Gemini / Groq bridge 호출
- 시스템 기능
- 화면 캡처
- macOS 메뉴 막대 및 런처

Windows에서는 `codex.rs`가 stale 호출을 즉시 거절합니다.

---

## Capability 처리

데스크톱은 `kwc_system_get_runtime_capabilities` command로 capability를 제공합니다.

| OS | `supportsCodex` |
|---|---|
| macOS | `true` |
| Windows | `false` |

React 렌더러는 이 값을 기준으로:

- 온보딩 Codex 카드 렌더링 여부
- provider 선택지
- 설정 패널의 Codex 입력란
- Codex 연결 카드

를 함께 결정합니다.

---

## Windows 정책

Windows 데스크톱에서는 다음을 렌더링하지 않습니다.

- Codex provider 선택지
- Codex workspace path 입력
- Codex reasoning effort 설정
- Codex 연결 상태 및 로그인 버튼

기존 상태 파일에 `codex` 필드가 있어도 런타임은 이를 사용하지 않습니다.

---

## macOS 정책

macOS 데스크톱에서는 기존 Codex 흐름을 유지합니다.

- 상태 확인
- bridge 시작
- device-auth 로그인
- 메뉴 막대 런처

즉, 이번 정리는 Windows 비노출이 목적이며 macOS 기능 제거가 아닙니다.

---

## 빌드

```bash
npm run build:mac
npm run build:windows
```

원본 산출물 디렉터리:

- `mac-app/`
- `windows-app/`

배포용 복사본은 루트 `build/mac/`, `build/windows/`로 정리합니다.

---

## 검증 포인트

- Windows 빌드에서 Codex 관련 설정이 전혀 렌더링되지 않는지
- macOS 빌드에서 Codex 로그인과 bridge 흐름이 유지되는지
- provider state가 Windows에서 `gemini -> groq` 우선으로 정규화되는지
