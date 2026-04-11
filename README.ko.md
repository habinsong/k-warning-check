<p align="center">
  <img src="docs/assets/readme-hero.svg" alt="K-WarningCheck 히어로 배너" width="100%">
</p>

<p align="center">
  클릭하기 전에, 설치하기 전에, 믿기 전에 먼저 읽어보는 워닝 체커.
</p>

<p align="center">
  <a href="README.md">English README</a>
  ·
  <a href="docs/INSTALL.md">설치 안내</a>
  ·
  <a href="docs/GITHUB-RELEASE.md">릴리즈 문안</a>
  ·
  <a href="docs/ARCHITECTURE.md">아키텍처</a>
</p>

<p align="center">
  <img alt="Chrome Extension" src="https://img.shields.io/badge/Chrome-확장프로그램-0F172A?style=for-the-badge&logo=googlechrome&logoColor=white">
  <img alt="macOS Desktop" src="https://img.shields.io/badge/macOS-데스크톱-14532D?style=for-the-badge&logo=apple&logoColor=white">
  <img alt="Windows Desktop" src="https://img.shields.io/badge/Windows-데스크톱-1D4ED8?style=for-the-badge&logo=windows&logoColor=white">
  <img alt="Tauri" src="https://img.shields.io/badge/Tauri-v2-F97316?style=for-the-badge&logo=tauri&logoColor=white">
</p>

## 무엇을 하는 프로젝트인가

K-WarningCheck는 문장이 너무 매끈해서 오히려 의심스러운 상황, 링크가 정상처럼 보여도 어딘가 불편한 상황, 캡처 이미지 속 텍스트까지 빠르게 확인해야 하는 상황을 위한 도구입니다.

주로 이런 입력을 점검합니다.

- 운영 안내처럼 보이지만 결제나 로그인을 유도하는 피싱·사기 문구
- 클릭, 설치, 구매를 조급하게 밀어붙이는 과장형 바이럴 문장
- 근거 없이 확신만 강한 AI 생성 후킹 문구
- OCR이 먼저 필요한 스크린샷과 이미지 캡처

Chrome 확장과 데스크톱 앱이 같은 분석 엔진을 공유하므로 결과 해석 기준이 표면마다 달라지지 않습니다.

## 화면 구성

| 데스크톱 작업 화면 | 확장프로그램 빠른 점검 |
|---|---|
| ![데스크톱 화면](docs/assets/readme-desktop-shot.svg) | ![확장프로그램 화면](docs/assets/readme-extension-shot.svg) |

![설치 흐름 요약](docs/assets/readme-install-flow.svg)

## 핵심 특징

- 텍스트, URL, 이미지, 선택 영역, 캡처, 클립보드 입력 공용 분석
- OCR 우선 처리와 제공자 기반 보조 설명
- 피싱, 사기, 과장형 바이럴, AI 슬롭, 구식 정보 재탕 패턴 점수화
- Gemini, Groq, Codex 구조를 유지하되 Windows에서는 Codex 비노출
- OS 보안 저장소 기반 API 키 보관
- 데스크톱 기록, 수동 점검, 캡처 중심 워크플로

## 플랫폼 지원

| 표면 | 지원 상태 | Codex |
|---|---|---|
| macOS / Linux / 비윈도우 Chrome | 지원 | 사용 가능 |
| Windows Chrome | 지원 | 숨김 및 비활성화 |
| macOS 데스크톱 | 지원 | 사용 가능 |
| Windows 데스크톱 | 지원 | 숨김 및 비활성화 |

Windows에서는 Codex UI, 로그인, 연결 흐름을 의도적으로 노출하지 않습니다.

## 설치

<table>
  <tr>
    <td width="33%">
      <strong>Chrome 확장프로그램</strong><br><br>
      <code>build/dist/</code>를 Chrome의 압축해제 확장으로 불러옵니다.<br><br>
      로컬 host가 필요하면<br>
      <code>npm run native:install</code>
    </td>
    <td width="33%">
      <strong>macOS 앱</strong><br><br>
      <code>build/mac/</code>의 DMG 또는 압축된 앱 번들을 사용합니다.<br><br>
      실행 후 provider 키를 설정하면 됩니다.
    </td>
    <td width="33%">
      <strong>Windows 앱</strong><br><br>
      <code>build/windows/</code>의 실행 파일을 사용합니다.<br><br>
      Windows에서는 Codex 없이 Gemini/Groq 중심으로 동작합니다.
    </td>
  </tr>
</table>

### 소스에서 직접 빌드

```bash
npm install
npm run lint
npm run test
npm run build:extension
npm run build:mac
npm run build:windows
```

원본 빌드 출력은 `dist/`, `mac-app/`, `windows-app/`에 생성되고, 배포용 복사본은 `build/`에 정리합니다.

## 저장소 구조

```text
k-warning-check/
├── build/       # 배포용 확장 및 앱 산출물
├── docs/        # 설치 안내, 문서, 릴리즈 문안, README 자산
├── main/        # 공용 프론트엔드, 확장 런타임, 렌더러, 로컬 host 스크립트
├── tauri-app/   # Tauri v2 Rust 백엔드
├── README.md
├── README.ko.md
└── package.json
```

## 문서

| 문서 | 설명 |
|---|---|
| [docs/INSTALL.md](docs/INSTALL.md) | 설치 경로, 배포 산출물, 소스 빌드 절차 |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 공용 런타임 구조, capability 모델, 데이터 흐름 |
| [docs/ANALYSIS-ENGINE.md](docs/ANALYSIS-ENGINE.md) | 규칙 엔진, 점수 계산, 분류, 체크리스트 |
| [docs/CHROME-EXTENSION.md](docs/CHROME-EXTENSION.md) | 확장 구조, 메시지, 로컬 host 연동 |
| [docs/DESKTOP-APP.md](docs/DESKTOP-APP.md) | 데스크톱 구조, 플랫폼별 동작, Tauri command |
| [docs/PROVIDERS.md](docs/PROVIDERS.md) | Gemini, Groq, Codex 지원 규칙 |
| [docs/SECURITY.md](docs/SECURITY.md) | 보안 저장소, bridge token, 저장소 위생 |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | 설치, 검증, 패키징 작업 흐름 |
| [docs/GITHUB-RELEASE.md](docs/GITHUB-RELEASE.md) | GitHub 릴리즈 본문 초안 |

## 자주 묻는 질문

<details>
  <summary><strong>왜 Windows에서는 Codex가 안 보이나</strong></summary>
  Windows 데스크톱과 Windows Chrome에서는 Codex UI와 bridge 흐름을 숨깁니다. 저장 포맷 호환성용 필드는 남아 있지만, 런타임은 해당 경로를 사용하지 않습니다.
</details>

<details>
  <summary><strong>배포 파일은 어디에 있나</strong></summary>
  실제 배포용 파일은 <code>build/</code>에 모아 둡니다. 원본 로컬 산출물은 여전히 <code>dist/</code>, <code>mac-app/</code>, <code>windows-app/</code>에서 생성됩니다.
</details>

<details>
  <summary><strong>비밀값은 어디에 저장되나</strong></summary>
  provider 키는 OS 보안 저장소를 사용합니다. 저장소에는 실제 키, 개인 경로, 개인 인증서를 남기지 않습니다.
</details>

## Contributors

| 역할 | 기여자 |
|---|---|
| Maintainer | [Habin Song](https://github.com/habinsong) |

## 라이선스

Private
