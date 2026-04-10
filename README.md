# K-워닝체크

텍스트, URL, 스크린샷을 분석해 한국형 스캠·피싱·바이럴·과장 권유와 AI 티 나는 저품질 후킹글을 점검하는 멀티플랫폼 워크스페이스입니다.

## 현재 구조

- `main`: 공용 소스와 Chrome 확장프로그램, 데스크톱 공용 React/서비스 코드
- `tauri-app`: 데스크톱 앱 (Tauri v2 + Rust 백엔드)
- `dist`: Chrome 개발자모드에서 직접 불러오는 확장 최종 산출물

## 실행

```bash
cd <프로젝트-루트>
npm install --cache ./.npm-cache
```

Chrome 확장 빌드:

```bash
npm run build:extension
```

빌드 결과는 `dist`에 생성됩니다. Chrome 확장 프로그램 페이지에서 `압축해제된 확장 프로그램을 로드`로 `dist`를 선택하면 됩니다.

데스크톱 앱 빌드 (Tauri):

```bash
npm run build:tauri
```

개발 모드:

```bash
npm run dev:extension
npm run dev:tauri
```

## 공용 계층

- 공용 분석 엔진: `main/src/modules`, `main/src/shared`
- 공용 분석 서비스 인터페이스: `main/src/core`
- 데스크톱 API 계약: `main/src/platform/desktopApi.ts`
- Tauri Rust 백엔드: `tauri-app/src`

## 참고

- 공식 기준점 정리는 `main/docs/official-risk-baselines.md`에 정리했습니다.
- 네이티브 호스트 재설치 명령은 `npm run native:install -w main` 입니다.
