# 변경 이력

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
- 아키텍처, Chrome 확장, 데스크톱 앱, 제공자, 보안, 개발 문서를 현재 플랫폼 정책에 맞게 갱신했습니다.

### 저장소 정리

- `.claude/`, `.DS_Store`, 빌드 산출물, 개인 경로·비밀값 점검 기준을 문서와 ignore 정책에 반영했습니다.
- 로컬 네이티브 호스트 설명 문구를 Codex 전용 표현 대신 일반 로컬 호스트 기준으로 정리했습니다.
