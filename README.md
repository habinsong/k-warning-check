# K-워닝체크

텍스트, URL, 스크린샷을 분석해 한국형 스캠·피싱·바이럴·과장 권유와 AI 티 나는 저품질 후킹글을 점검하는 Chrome Extension MV3 프로토타입입니다.

## 현재 구현

- 텍스트 입력, URL 입력, 이미지 업로드 OCR 분석
- 선택 텍스트 분석
- 현재 페이지 영역 캡처 분석
- 클립보드 단축키 분석
- 워닝 점수, 위험 등급, 체크리스트, 근거 문장, 권장 행동 출력
- 공식 사례 기반 `판별 기준점` 매칭
- AI 저품질 후킹글, AI 바이럴/기기 바이럴, 권위팔이 AI 담론, 구식 모델/최신성 부족, 선택적 비교/정보 왜곡 분류
- 사기성, 바이럴성, AI 냄새, 최신성 위험, 선택적 비교, 권위호소, 후킹 문체 축별 점수
- 내부 100개 AI 저품질 후킹글 체크리스트와 사용자용 상위 5개 사유 표시
- 최근 50건 상세 이력 저장
- Gemini API 키 + 공식 Gemini 3 계열 모델 선택
- Codex CLI 로그인 세션 기반 보조 설명 브리지

## 실행

```bash
cd /Users/songhabin/k-warning-check
npm install
npm run build
```

빌드 결과는 [dist](/Users/songhabin/k-warning-check/dist)에 생성됩니다. Chrome 확장 프로그램 페이지에서 `압축해제된 확장 프로그램을 로드`로 [dist](/Users/songhabin/k-warning-check/dist)를 선택하면 됩니다.

개발 중 감시 빌드:

```bash
npm run dev
```

## Codex 보조 사용

OpenAI 계열 보조는 로컬 Codex CLI의 `codex login` OAuth 세션을 사용합니다.

이 머신에는 Chrome Native Messaging 호스트가 설치되어 있으므로, 확장 설정 화면에서 아래 버튼을 사용하면 됩니다.

1. `Codex OAuth 로그인`
2. `OAuth 페이지 열기`
3. `브리지 시작`
4. `연결 확인`

네이티브 호스트를 다시 설치해야 할 때만 아래 명령을 사용합니다.

```bash
npm run native:install
```

## 구조

- `src/background`: 명령 라우팅, 분석 실행, 저장소 연결
- `src/content`: 화면 영역 캡처 오버레이
- `src/offscreen`: 클립보드 읽기
- `src/popup`: 실행 중심 팝업 UI
- `src/options`: 제공자 설정 및 기록 관리
- `src/modules`: 분석 엔진, OCR, 저장소, 제공자 어댑터
- `src/data/riskBaselines.ts`: 공식 사례 기반 기준점 정의
- `scripts/codex-bridge.mjs`: Codex CLI 로컬 브리지
- `native/codex-native-host.mjs`: 설정 화면 버튼과 로컬 Codex CLI를 연결하는 네이티브 호스트

## 참고

- 공식 기준점 정리는 [docs/official-risk-baselines.md](/Users/songhabin/k-warning-check/docs/official-risk-baselines.md)에 정리했습니다.
- Codex 브리지는 로컬 프로토타입용입니다.
