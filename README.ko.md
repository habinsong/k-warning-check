# K-WarningCheck

> 그럴듯할수록 먼저 의심하십시오.
>
> K-WarningCheck는 수상한 문구, URL, 스크린샷, AI 과장 문체를 빠르게 점검하기 위한 멀티플랫폼 워닝 체커입니다. 공용 분석 엔진, OCR, 제공자 보조 분석, 빠른 입력 UI를 하나로 묶었습니다.

[English README](README.md) · [아키텍처](docs/ARCHITECTURE.md) · [제공자](docs/PROVIDERS.md) · [개발 가이드](docs/DEVELOPMENT.md)

---

## 무엇을 해결하나

K-WarningCheck는 다음 같은 입력을 빠르게 거릅니다.

- 처음엔 정상처럼 보이는 피싱·사기 문구
- 클릭, 설치, 구매를 유도하는 과장형 바이럴 문장
- 말은 번듯하지만 사실성이 약한 AI 생성 후킹 글
- OCR이 먼저 필요한 스크린샷, 캡처, 이미지 텍스트

제품은 같은 분석 엔진을 아래 두 표면에서 공유합니다.

- Chrome 확장프로그램
- Tauri 데스크톱 앱

---

## 플랫폼 지원

| 표면 | 지원 상태 | Codex |
|---|---|---|
| macOS / Linux / 비윈도우 Chrome | 지원 | 사용 가능 |
| Windows Chrome | 지원 | 숨김 및 비활성화 |
| macOS 데스크톱 | 지원 | 사용 가능 |
| Windows 데스크톱 | 지원 | 숨김 및 비활성화 |

Windows에서는 Codex UI와 연결 흐름을 의도적으로 노출하지 않습니다.

---

## 주요 특징

- 텍스트, URL, 이미지, 선택 영역, 화면 캡처, 클립보드 입력 공용 분석
- 피싱, 사기, 바이럴, AI 슬롭, 구식 정보 재탕 패턴을 다루는 규칙 기반 점수화
- OCR 우선 스크린샷 처리와 제공자 기반 이미지 텍스트 추출
- Gemini, Groq, Codex 지원 구조
- 모델·버전 주장에 대한 웹 최신성 검증
- OS 보안 저장소 기반 API 키 보관
- macOS 메뉴 막대 런처 지원

---

## 빠른 시작

### 요구 사항

- Node.js 20+
- npm 10+
- 데스크톱 빌드용 Rust 1.80+

### 설치

```bash
npm install
```

### 테스트

```bash
npm run test
npm run lint
```

### Chrome 확장 빌드

```bash
npm run build:extension
```

압축 해제 확장 결과물은 `dist/`에 생성됩니다.

### 데스크톱 빌드

```bash
npm run build:mac
npm run build:windows
```

데스크톱 빌드 산출물은 로컬에서만 생성되며 Git에는 포함하지 않습니다.

---

## 선택형 로컬 호스트

```bash
npm run native:install
```

이 명령은 Chrome 확장의 보안 저장소 연동에 필요한 로컬 네이티브 호스트를 설치합니다. 비윈도우 Chrome에서는 Codex 관련 흐름도 함께 사용할 수 있고, Windows에서는 로컬 호스트가 설치되어 있어도 Codex UI는 계속 숨겨집니다.

---

## 프로젝트 구조

```text
k-warning-check/
├── main/        # 공용 프론트엔드, 확장 런타임, 데스크톱 렌더러, 로컬 호스트 스크립트
├── tauri-app/   # Tauri v2 Rust 백엔드
├── docs/        # 프로젝트 문서
├── README.md
├── README.ko.md
└── package.json
```

---

## 문서

| 문서 | 설명 |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 공용 런타임 구조, capability 모델, 데이터 흐름 |
| [docs/ANALYSIS-ENGINE.md](docs/ANALYSIS-ENGINE.md) | 규칙 엔진, 점수 계산, 분류, AI 후킹 체크리스트 |
| [docs/CHROME-EXTENSION.md](docs/CHROME-EXTENSION.md) | 확장 구조, 백그라운드 흐름, 로컬 호스트 연동 |
| [docs/DESKTOP-APP.md](docs/DESKTOP-APP.md) | Tauri 데스크톱 구조와 플랫폼별 동작 |
| [docs/PROVIDERS.md](docs/PROVIDERS.md) | Gemini, Groq, Codex 지원 범위와 동작 |
| [docs/SECURITY.md](docs/SECURITY.md) | 보안 저장소, bridge token, 저장소 위생 정책 |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | 설치, 빌드, 검증, 작업 규칙 |

---

## 자주 묻는 질문

### 왜 Windows에서는 Codex가 안 보이나

Windows 데스크톱과 Windows Chrome에서는 Codex 연결 흐름을 의도적으로 비활성화했습니다. 저장 포맷 호환성 때문에 상태 필드는 남아 있지만, 런타임은 해당 경로를 사용하지 않습니다.

### 빌드 산출물은 커밋되나

아닙니다. `dist/`, `mac-app/`, `windows-app/` 같은 생성물은 Git에서 제외합니다.

### 비밀값은 어디에 저장되나

API 키는 OS 보안 저장소를 사용합니다. 저장소에는 실제 키, 개인 경로, 로컬 생성물을 남기지 않는 것을 기본 원칙으로 둡니다.

---

## 라이선스

Private
