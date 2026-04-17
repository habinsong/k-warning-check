# 아키텍처

K-WarningCheck는 하나의 분석 엔진을 Chrome 확장과 Tauri 데스크톱 앱에서 함께 사용합니다. 핵심 목적은 입력 표면이 달라도 같은 위험도 계산과 같은 결과 구조를 유지하는 것입니다.

---

## 상위 구조

```text
입력 표면
├── Chrome 확장
│   ├── popup
│   ├── options
│   ├── background service worker
│   └── native host
└── Tauri 데스크톱
    ├── React renderer
    └── Rust commands

공용 엔진
├── parser
├── rules / checklist / baselines
├── scoring / classifier
├── provider adapters
└── localization
```

---

## 핵심 원칙

- 입력 종류와 무관하게 `AnalysisInput -> StoredAnalysisRecord` 흐름을 유지합니다.
- 위험도 계산은 공용 TypeScript 엔진에서 수행합니다.
- 플랫폼별 차이는 capability로 표현하고 UI와 상태 정규화에서 함께 처리합니다.
- 저장 포맷은 크게 깨지지 않게 유지하고, 런타임에서만 플랫폼별 정책을 적용합니다.

---

## Runtime Capability

현재 플랫폼 정책의 핵심은 `RuntimeCapabilities`입니다.

| 필드 | 의미 |
|---|---|
| `os` | 현재 런타임 OS |
| `supportsCodex` | 현재 런타임에서 Codex UI/기능을 노출할지 여부 |

현재 규칙은 단순합니다.

- Windows: `supportsCodex = false`
- 그 외 지원 런타임: `supportsCodex = true`

이 capability는 다음 경로에 동시에 영향을 줍니다.

- 온보딩과 설정 UI
- preferred provider 정규화
- 선택 provider 허용 여부
- Codex bridge token 주입 여부
- stale Codex 호출의 즉시 차단

---

## 상태 흐름

### Chrome 확장

1. `background`가 provider state와 기록을 읽습니다.
2. `chrome.runtime.getPlatformInfo()`로 capability를 계산합니다.
3. provider state를 capability 기준으로 정규화합니다.
4. popup/options는 정규화된 상태만 렌더링합니다.

### 데스크톱

1. Rust command가 저장 상태를 읽습니다.
2. 현재 OS 기준 capability를 계산합니다.
3. provider state를 capability 기준으로 정규화합니다.
4. React renderer는 정규화된 상태와 capability를 함께 사용합니다.

---

## 분석 흐름

1. 입력 수집
2. 텍스트 정규화
3. 규칙 매칭
4. 체크리스트/기준점 적용
5. 점수 계산 및 유형 분류
6. 선택한 provider 1개에 한해 `analyzeRisk` 1회 호출
7. `llmAnalysis`와 보강 요약 저장
8. 기록 저장

Provider 보조 동작에는 다음이 포함됩니다.

- 설명 보조
- 이미지 텍스트 추출
- 웹 최신성 검증

숨은 fallback, 다중 provider 순회, 재시도 체인은 현재 분석 경로에서 사용하지 않습니다.

---

## Provider 구조

| 제공자 | 역할 | Windows |
|---|---|---|
| Gemini | 단일 호출 설명 보조, OCR 보조, 최신성 코멘트 | 지원 |
| Groq | 단일 호출 설명 보조, OCR 보조 | 지원 |
| Codex | 설명 보조, OCR 보조, bridge 기반 호출 | 비노출 |

Codex 설정 객체는 저장 포맷 호환성 때문에 유지하지만, Windows 런타임에서는 bridge token을 주입하지 않습니다.

---

## 저장소 분리

- 기록: 플랫폼별 로컬 저장소
- provider state: 플랫폼별 로컬 저장소
- API 키: 저장 시 OS 보안 저장소 + 런타임용 로컬 암호화 캐시
- Codex bridge token: 로컬 런타임 파일

빌드 산출물과 개인 환경 파일은 Git에 포함하지 않습니다.

---

## 관련 문서

- [Chrome 확장](CHROME-EXTENSION.md)
- [데스크톱 앱](DESKTOP-APP.md)
- [제공자](PROVIDERS.md)
- [보안](SECURITY.md)
