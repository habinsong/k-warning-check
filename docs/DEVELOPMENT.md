# 개발 가이드

이 문서는 현재 저장소 기준 설치, 빌드, 검증, 정리 규칙을 설명합니다.

---

## 요구 사항

- Node.js 20+
- npm 10+
- Rust 1.80+
- macOS에서 Windows 크로스 빌드를 할 경우 `cargo-xwin`

---

## 설치

```bash
npm install
```

Chrome 확장의 로컬 host 연동이 필요하면 추가로 실행합니다.

```bash
npm run native:install
```

이 명령은 secure store 연동을 위한 로컬 host를 설치합니다. 비윈도우 Chrome에서는 Codex 관련 흐름도 함께 활성화됩니다.

---

## 주요 명령

```bash
npm run test
npm run lint
npm run build:extension
npm run build:mac
npm run build:windows
cargo check --manifest-path tauri-app/Cargo.toml
```

---

## Windows Codex 정책

개발 시 반드시 아래를 전제로 작업합니다.

- Windows 데스크톱: Codex UI 비노출
- Windows Chrome 확장: Codex UI 비노출
- Windows 런타임: Codex stale 호출 즉시 차단
- macOS 및 비윈도우 Chrome: 기존 Codex 흐름 유지

새 UI를 추가할 때는 단순 문자열 조건이 아니라 capability 기반 분기를 우선 사용해야 합니다.

---

## 문서 규칙

- 루트 `README.md`는 영문 메인 문서입니다.
- 루트 `README.ko.md`는 한국어 안내 문서입니다.
- 운영 문서는 현재 플랫폼 정책과 빌드 정책에 맞게 유지합니다.

---

## 저장소 위생

다음 항목은 Git에 올리지 않습니다.

- `.env*`
- 원본 빌드 출력인 `dist/`, `mac-app/`, `windows-app/`
- `.claude/`
- `.DS_Store`
- 개인 경로, 인증서, 키 파일, 실제 비밀값

배포용으로 선별한 산출물은 루트 `build/`에 복사해 관리할 수 있습니다.

커밋 전에는 최소한 아래 검색을 다시 확인합니다.

```bash
rg -n "개인 절대경로 또는 실제 비밀값 패턴을 다시 확인할 검색식" .
```

---

## 검증 순서

1. `npm run lint`
2. `npm run test`
3. `cargo check --manifest-path tauri-app/Cargo.toml`
4. `npm run build:extension`
5. `npm run build:windows`
6. `npm run build:mac`

문서 변경이 있으면 README 링크, `build/` 경로, 명령어까지 함께 다시 확인합니다.
