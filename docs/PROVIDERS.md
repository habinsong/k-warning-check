# 제공자

K-WarningCheck는 Gemini, Groq, Codex를 지원하지만, 분석 시에는 항상 사용자가 고른 제공자 1개만 호출합니다. 런타임 정책과 지원 범위는 플랫폼별로 다릅니다.

---

## 설정 화면 예시

<table>
  <tr>
    <td width="50%">
      <img src="../img/KOR/settings-providers.png" alt="제공자 설정 화면" width="100%">
    </td>
    <td width="50%">
      <img src="../img/KOR/settings-codex.png" alt="Codex 설정 화면" width="100%">
    </td>
  </tr>
  <tr>
    <td align="center"><strong>Gemini / Groq 설정</strong><br>모델, API 키 보관 정책, 도구 구성을 관리합니다.</td>
    <td align="center"><strong>Codex 설정</strong><br>지원 플랫폼에서만 보이는 연결 예시 화면입니다.</td>
  </tr>
</table>

---

## 지원 매트릭스

| 제공자 | Chrome 비윈도우 | Chrome Windows | 데스크톱 macOS | 데스크톱 Windows |
|---|---|---|---|---|
| Gemini | 지원 | 지원 | 지원 | 지원 |
| Groq | 지원 | 지원 | 지원 | 지원 |
| Codex | 지원 | 비노출 | 지원 | 비노출 |

---

## Gemini

역할:

- `analyzeRisk` 단일 호출
- 이미지 텍스트 추출 보조
- 같은 호출 안에서 최신성 코멘트 보강
- `LLM 분석` 카드에 응답 전문과 근거 기록

설정 조건:

- API 키 필요
- OS 보안 저장소 저장 필요

기본 모델:

- `Gemini 3.1 Flash-Lite Preview`

---

## Groq

역할:

- `analyzeRisk` 단일 호출
- 이미지 텍스트 추출 보조
- `LLM 분석` 카드에 응답 전문과 근거 기록

설정 조건:

- API 키 필요
- OS 보안 저장소 저장 필요

기본 모델:

- `Compound Mini`

중요:

- 현재 단일 호출 모드에서는 Groq 웹 최신성 검증을 별도 실행하지 않습니다.
- 최신성 판단이 필요하면 선택 결과에 따라 `검증 건너뜀` 또는 `불충분` 안내가 남습니다.

---

## Codex

역할:

- bridge 기반 `analyzeRisk` 단일 호출
- bridge 기반 이미지 텍스트 추출
- `LLM 분석` 카드에 응답 전문과 근거 기록

동작 조건:

- 로컬 bridge
- 로컬 로그인 세션
- 지원 플랫폼에서만 UI 노출

중요:

- Windows에서는 Codex UI와 연결 흐름을 노출하지 않습니다.
- 저장 포맷의 `codex` 필드는 남아 있지만, Windows 런타임은 bridge token을 주입하지 않습니다.

---

## Provider 선택 규칙

정규화 원칙:

- Windows에서는 Codex를 기본/fallback 후보에서 제거
- provider가 구성되지 않았으면 선택지에 남더라도 비활성화
- 분석 실행 시에는 `preferredProvider` 1개만 호출
- 숨은 fallback, 다중 provider 순회, 재시도 체인은 사용하지 않음

웹 최신성 검증:

- 현재 단일 호출 모드에서 최신성 코멘트까지 함께 수행하는 경로는 Gemini만 사용합니다.
- 선택 provider가 이를 지원하지 않으면 실패 대신 `건너뜀` 상태를 기록합니다.

---

## 이미지 분석

이미지 분석은 멀티모달 제공자가 필요하며, 역시 선택한 제공자 1개만 사용합니다.

- 지원 플랫폼의 Codex
- 또는 Gemini
- 또는 Groq

Windows에서는 사실상 Gemini 또는 Groq가 필요합니다.

---

## 구현 포인트

- UI는 capability와 provider state를 함께 보고 렌더링합니다.
- 분석 엔진은 `createSelectedProvider()`로 선택 제공자 1개만 생성합니다.
- provider state 정규화와 provider factory는 같은 플랫폼 정책을 따라야 합니다.
