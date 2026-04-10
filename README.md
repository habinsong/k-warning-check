# K-워닝체크 (K-WarningCheck)

텍스트, URL, 스크린샷을 분석해 **한국형 스캠 / 피싱 / 바이럴 / 과장 권유**와 **AI 생성 저품질 후킹글**을 점검하는 멀티플랫폼 도구입니다.

> Chrome 확장프로그램 + Tauri v2 데스크톱 앱으로 동일한 분석 엔진을 공유합니다.

---

## 주요 기능

| 기능 | 설명 |
|------|------|
| 텍스트 분석 | 40개 이상의 탐지 규칙 + 콤보 패턴으로 위험도 산출 |
| URL 분석 | 페이지 본문 추출 후 규칙 기반 + AI 보조 분석 |
| 이미지/스크린샷 분석 | OCR(Tesseract.js) 또는 AI Vision으로 텍스트 추출 후 분석 |
| 클립보드 분석 | 복사한 텍스트를 즉시 분석 |
| 화면 영역 캡처 | 데스크톱 앱에서 드래그로 영역 선택 후 분석 |
| AI 후킹 체크리스트 | AI가 생성한 저품질 콘텐츠 10개 카테고리 40개 항목 검사 |
| 웹 최신성 검증 | AI 제공자를 통한 정보 사실 확인 |
| 다중 AI 제공자 | Gemini, Groq, Codex 브릿지 지원 |
| 보안 저장소 | OS 키체인(macOS Keychain, Windows Credential Locker)으로 API 키 관리 |

---

## 프로젝트 구조

```
k-warning-check/
├── main/                          # 공용 소스 (Chrome 확장 + 데스크톱 렌더러)
│   ├── src/
│   │   ├── core/                  # 분석 서비스 인터페이스 & 오케스트레이션
│   │   ├── modules/               # 분석 엔진 (규칙, 스코어링, 분류, OCR, AI 제공자)
│   │   ├── data/                  # 탐지 규칙, AI 체크리스트, 공식 기준점 정의
│   │   ├── shared/                # 타입, 상수, 유틸리티, 로컬라이제이션
│   │   ├── platform/              # 플랫폼 추상화 (desktopApi.ts)
│   │   ├── background/            # Chrome 확장 백그라운드 서비스 워커
│   │   ├── content/               # Chrome 콘텐츠 스크립트
│   │   ├── popup/                 # Chrome 팝업 UI (React)
│   │   ├── options/               # Chrome 설정 페이지 (React)
│   │   ├── offscreen/             # Chrome Offscreen Document
│   │   └── desktop/renderer/      # 데스크톱 앱 React 렌더러
│   ├── native/                    # Chrome 네이티브 메시징 호스트
│   ├── scripts/                   # 빌드 · 설치 스크립트
│   ├── public/                    # 정적 에셋 & manifest.json
│   ├── docs/                      # 공식 기준점 문서
│   ├── vite.config.ts             # Chrome 확장 빌드 설정
│   └── vite.desktop.config.ts     # 데스크톱 렌더러 빌드 설정
├── tauri-app/                     # Tauri v2 데스크톱 앱 (Rust 백엔드)
│   ├── src/
│   │   ├── commands/              # IPC 커맨드 핸들러
│   │   ├── lib.rs                 # 앱 초기화 & 플러그인 등록
│   │   ├── store.rs               # JSON 파일 I/O
│   │   └── secure.rs              # OS 키체인 + AES-256-GCM 캐시
│   ├── capabilities/              # Tauri ACL 권한 정의
│   ├── icons/                     # 앱 아이콘 (모든 플랫폼)
│   ├── Cargo.toml                 # Rust 의존성
│   └── tauri.conf.json            # Tauri 앱 설정
├── dist/                          # Chrome 확장 빌드 산출물
├── docs/                          # 프로젝트 문서
└── package.json                   # 워크스페이스 루트
```

---

## 시작하기

### 사전 요구사항

- **Node.js** 20+
- **Rust** 1.80+ (데스크톱 앱 빌드 시)
- **npm** 10+

### 설치

```bash
npm install
```

### Chrome 확장프로그램

```bash
# 프로덕션 빌드
npm run build:extension

# 개발 모드 (watch)
npm run dev:extension
```

빌드 결과는 `dist/`에 생성됩니다. Chrome 확장 프로그램 관리 페이지(`chrome://extensions`)에서 **압축해제된 확장 프로그램을 로드**로 `dist/` 디렉토리를 선택하세요.

### 데스크톱 앱 (Tauri)

```bash
# 개발 모드
npm run dev:tauri

# 프로덕션 빌드 (Tauri 기본)
npm run build:tauri

# macOS 빌드 → mac-app/
npm run build:mac

# Windows 크로스 컴파일 → windows-app/ (macOS에서 cargo-xwin 필요)
npm run build:windows
```

빌드 산출물:
- macOS: `mac-app/K-WarningCheck Desktop.app` + `.dmg`
- Windows: `windows-app/k-warning-check-desktop.exe`

### 네이티브 호스트 설치 (Codex 브릿지)

```bash
npm run native:install
```

### 테스트

```bash
npm run test
```

### 린트

```bash
npm run lint
```

---

## 위험도 등급

| 점수 | 등급 | 의미 |
|------|------|------|
| 0~19 | 낮음 | 특별한 위험 신호 없음 |
| 20~39 | 주의 | 일부 주의가 필요한 표현 포함 |
| 40~59 | 위험 | 여러 위험 신호 감지 |
| 60~79 | 매우 위험 | 높은 수준의 위험 패턴 |
| 80~100 | 경고 | 즉시 주의 필요 |

---

## 분석 유형 (13가지)

| 유형 | 설명 |
|------|------|
| 피싱/기관사칭 | 정부·기업 사칭, 인증 요구 |
| 투자/코인/리딩방 | 투자 수익 보장, 리딩방 권유 |
| 도박/베팅 | 불법 도박, 배팅 사이트 유도 |
| 대출/금융사기 | 불법 대출, 선입금 요구 |
| 보이스피싱/전화사기 | 전화 기반 사기, 원격제어 유도 |
| 허위광고/과장 | 과장된 효능·성능 주장 |
| 바이럴/홍보성 | 은밀한 광고, 바이럴 마케팅 |
| 개인정보탈취 | 개인정보·계정 수집 시도 |
| 구인/알바사기 | 허위 구인, 수수료 선납 요구 |
| 악성코드/해킹 | 악성 링크, 앱 설치 유도 |
| 로맨스스캠 | 감정적 접근 후 금전 요구 |
| AI생성/저품질 | AI 생성 저품질 콘텐츠 |
| 기타 | 위 유형에 해당하지 않는 위험 |

---

## 문서 목차

| 문서 | 설명 |
|------|------|
| [아키텍처](docs/ARCHITECTURE.md) | 시스템 구조, 데이터 흐름, 플랫폼 추상화 |
| [분석 엔진](docs/ANALYSIS-ENGINE.md) | 규칙 기반 분석, 스코어링, 분류, AI 체크리스트 |
| [AI 제공자](docs/PROVIDERS.md) | Gemini, Groq, Codex 브릿지 연동 가이드 |
| [데스크톱 앱](docs/DESKTOP-APP.md) | Tauri v2 Rust 백엔드 구조 |
| [Chrome 확장](docs/CHROME-EXTENSION.md) | 확장 프로그램 구조, 메시지 프로토콜 |
| [보안](docs/SECURITY.md) | API 키 관리, 암호화, CSP, 보안 설계 |
| [개발 가이드](docs/DEVELOPMENT.md) | 환경 설정, 빌드, 테스트, 기여 방법 |

---

## 기술 스택

| 영역 | 기술 |
|------|------|
| 프론트엔드 | React 19, TypeScript 6, Tailwind CSS 4, Vite 8 |
| 데스크톱 백엔드 | Rust, Tauri v2, reqwest, keyring, xcap |
| Chrome 확장 | Manifest V3, Service Worker, Content Script |
| 분석 엔진 | 정규식 규칙 엔진 + 다중 AI 제공자 |
| AI 제공자 | Google Gemini, Groq, OpenAI Codex |
| OCR | Tesseract.js 7, AI Vision (Gemini/Groq) |
| 테스트 | Vitest, Testing Library |
| 보안 | OS Keychain, AES-256-GCM, SHA-256 |

---

## 라이선스

Private
