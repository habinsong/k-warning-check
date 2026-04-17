# 변경 이력

## 2026-04-17

### 분석 파이프라인

- 분석 시 선택한 provider 1개만 `analyzeRisk` 1회 호출하도록 정리했습니다.
- 로컬 정규식·휴리스틱 엔진이 점수와 유형을 먼저 확정하고, LLM은 요약과 근거만 보강하도록 바꿨습니다.
- `llmAnalysis`를 기록 스키마에 추가하고, 실제 응답 전문·근거·최신성 코멘트를 저장하도록 정리했습니다.
- 기록 카드에 `LLM 분석` 섹션을 추가해 provider, 소요 시간, 응답 전문, 근거, 오류를 바로 확인할 수 있게 했습니다.

### 제공자 기본값과 속도

- Gemini 기본 모델을 `Gemini 3.1 Flash-Lite Preview`로 조정했습니다.
- Groq 기본 모델을 `Compound Mini`로 조정했습니다.
- Gemini와 Groq의 단일 호출 프롬프트를 압축해 응답 시간을 줄이고, 근거를 원문 인용 위주로 정리했습니다.

### 보안 저장소

- Gemini와 Groq 키를 저장할 때만 OS 보안 저장소를 사용하고, 실행·분석 중에는 로컬 암호화 캐시만 읽도록 바꿨습니다.
- 런타임 캐시가 없으면 키체인을 다시 열지 않고 `다시 저장 필요` 오류를 반환하도록 정리했습니다.

### 검증

- `npm test`, `npm run lint`, `cargo check`를 다시 통과시켰습니다.
- Chrome 확장, macOS 앱, Windows 앱 빌드를 모두 다시 생성했습니다.

## 2026-04-11

### 플랫폼

- Windows 데스크톱 앱에서 Codex UI, 연결, 로그인 흐름을 제거했습니다.
- Windows Chrome 확장에서 Codex 관련 설정과 온보딩 노출을 제거했습니다.
- 런타임 capability 계층을 추가해 `supportsCodex` 기준으로 UI, 상태 정규화, 제공자 fallback이 함께 동작하도록 정리했습니다.

### 제공자 동작

- Windows에서 기존 저장 상태가 `preferredProvider: codex`인 경우 Gemini 우선 구조로 정규화합니다.
- Windows에서는 Codex bridge token을 주입하지 않아 분석 fallback에서 Codex가 다시 선택되지 않도록 막았습니다.
- stale Codex 호출은 Windows에서 즉시 `지원하지 않음` 오류로 종료합니다.

### 문서

- `README.md`를 영문 메인 문서로 전면 개편했습니다.
- `README.ko.md`를 추가해 한영 README를 분리했습니다.
- README용 시각 자산, 설치 안내 페이지, GitHub 릴리즈 문안을 새로 정리했습니다.
- 아키텍처, Chrome 확장, 데스크톱 앱, 제공자, 보안, 개발 문서를 현재 플랫폼 정책에 맞게 갱신했습니다.

### 저장소 정리

- 개발 메타 디렉터리, `.DS_Store`, 빌드 산출물, 개인 경로·비밀값 점검 기준을 문서와 ignore 정책에 반영했습니다.
- 로컬 네이티브 호스트 설명 문구를 Codex 전용 표현 대신 일반 로컬 호스트 기준으로 정리했습니다.
- 배포용 확장 및 앱 파일을 루트 `build/`에 모아 관리하는 흐름을 문서에 반영했습니다.
