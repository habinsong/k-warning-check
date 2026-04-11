# GitHub 릴리즈 문안

아래 문안은 GitHub 릴리즈 본문에 바로 붙여 넣을 수 있는 형태로 정리했습니다.

---

## 릴리즈 제목

`K-WarningCheck 0.1.0`

---

## 릴리즈 본문

```md
K-WarningCheck 0.1.0은 수상한 문구, URL, 스크린샷, AI 과장 문체를 더 빠르게 걸러내기 위한 첫 정리 릴리즈입니다.

### 이번 릴리즈 핵심

- Chrome 확장과 데스크톱 앱이 같은 분석 엔진을 공유하도록 정리했습니다.
- Windows에서는 Codex UI와 연결 흐름을 완전히 숨겨, 실제 지원 범위와 화면 노출이 일치하도록 맞췄습니다.
- README, 설치 안내, 보안/개발 문서를 현재 배포 방식에 맞게 다시 정리했습니다.
- 배포 산출물을 루트 `build/` 폴더로 모아 바로 확인할 수 있게 했습니다.

### 플랫폼 메모

- macOS 데스크톱: 지원
- Windows 데스크톱: 지원
- Chrome 확장: 지원
- Windows의 Codex: 비노출
- macOS 및 비윈도우 Chrome의 Codex: 유지

### 포함된 산출물

- `build/dist/`: Chrome 확장프로그램
- `build/mac/`: macOS 앱 배포 파일
- `build/windows/`: Windows 앱 배포 파일

### 주요 개선 사항

- 플랫폼 capability 계층 추가
- Windows용 Codex fallback 및 stale 호출 차단
- 온보딩, 설정, provider 선택 UI 정리
- 설치 문서 및 릴리즈 문안 정비
- 저장소 위생 점검과 배포 자산 정리

### 업그레이드 메모

- 기존 Windows 사용자는 Codex 관련 설정이 더 이상 보이지 않는 것이 정상입니다.
- 기존 설정에 `preferredProvider: codex`가 남아 있어도 Windows 런타임에서는 Gemini/Groq 중심으로 정규화됩니다.

### 문서

- README: 프로젝트 개요와 플랫폼 지원
- `docs/INSTALL.md`: 설치 절차
- `docs/ARCHITECTURE.md`: 구조 설명
- `docs/SECURITY.md`: 보안 및 저장소 위생 정책
```

---

## 짧은 소개 문구

```md
Read the message before it moves you.

K-WarningCheck helps you review scam copy, phishing URLs, screenshots, and AI-heavy hype across a Chrome extension and desktop app.
```
