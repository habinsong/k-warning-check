# K-워닝체크 공식 기준점 정리

기준일: 2026년 4월 8일

## Gemini / Codex 기준

- Google AI Gemini 3 문서 기준 모델명
  - `gemini-3.1-pro-preview`
  - `gemini-3-flash-preview`
  - `gemini-3.1-flash-lite-preview`
- Gemini 인증은 API 키 기준으로 단순화
- OpenAI 계열 보조는 로컬 `codex login` OAuth 세션 사용
- 사용자가 터미널에 직접 입력하지 않도록 설정 화면에서 Chrome Native Messaging 호스트를 통해 로그인과 브리지 시작을 실행

## 판별 기준점

### 1. 문자 내 URL 클릭, 앱 설치, 인증 유도
- 기준: KISA·정부24 스미싱 예방 안내
- 해석: 출처 불명 문자에 URL이 있고, 클릭 후 앱 설치나 본인 인증을 요구하면 우선 고위험으로 본다.
- 링크:
  - [정부24 스미싱 예방 안내](https://www.gov.kr/portal/ntnadmNews/3796614)
  - [경찰청 통합신고대응단 문자 제보 기준](https://www.counterscam112.go.kr/member/loginProc.do)

### 2. 저금리 대환대출 미끼 + 기존 대출 선상환 요구
- 기준: 경찰청 통합신고대응단 예방 기준
- 해석: 저금리 전환이나 정부지원 대출을 말하면서 기존 대출을 먼저 갚으라고 하면 대출사기 기준점으로 본다.
- 링크:
  - [경찰청 통합신고대응단](https://www.counterscam112.go.kr/cyberCrime/voicePhishing.do)

### 3. 원격제어 앱 또는 악성 앱 설치 요구
- 기준: 경찰청 통합신고대응단, KISA 스미싱 예방 자료
- 해석: 팀뷰어, AnyDesk, helpU 계열, 악성 앱 설치 유도는 치명 항목으로 본다.
- 링크:
  - [경찰청 통합신고대응단](https://www.counterscam112.go.kr/member/loginProc.do)

### 4. 가족·지인 사칭 뒤 메신저 송금 유도
- 기준: 경찰청 메신저피싱 예방 기준
- 해석: 휴대폰 고장, 급한 결제, 대신 송금 요청은 메신저피싱 기준점으로 본다.
- 링크:
  - [경찰청 통합신고대응단](https://www.counterscam112.go.kr/cyberCrime/voicePhishing.do)

### 5. 공공기관·금융기관 사칭 + 링크 포함
- 기준: KISA 통합신고센터 문자 제보 기준
- 해석: 택배, 공공기관, 금융기관 등을 사칭하면서 URL을 넣은 문자는 공식 제보 기준과 직접 맞닿는다.
- 링크:
  - [경찰청 통합신고대응단 문자 제보 기준](https://www.counterscam112.go.kr/member/loginProc.do)

### 6. AI 딸깍형 저품질 후킹글
- 기준: 공식 모델 문서, 모델 폐기 공지, LLM 생성문 스타일로메트리 연구를 대조하고, 문구 자체는 K-워닝체크 내부 휴리스틱으로 판단한다.
- 해석:
  - 구형 또는 검증 필요한 모델명을 최신 주력 모델처럼 사용
  - `10분이면 끝`, `30초 뒤`, `0원`, `개발자 없이`, `원탑`, `끝판왕`처럼 즉시 성과를 약속
  - 문장 구조는 매끈하지만 예외 조건, 한계, 근거, 비교 조건이 빠짐
  - 숫자와 비교표는 있어 보이지만 출처와 조건이 없음
- 링크:
  - [Anthropic 모델 폐기 공지](https://docs.anthropic.com/en/docs/about-claude/model-deprecations)
  - [Google AI Gemini 3 문서](https://ai.google.dev/gemini-api/docs/gemini-3)
  - [LLM 생성문 스타일로메트리 연구](https://arxiv.org/abs/2507.00838)

### 7. AI 바이럴/기기 바이럴
- 기준: Google Gemma 모델 카드와 Ollama 하드웨어 지원 문서를 기준으로 사실 항목과 프레이밍 항목을 분리한다.
- 해석:
  - `Gemma 4 26B A4B` 자체는 Google Gemma 4 모델 카드에 있는 항목이므로 모델명 오류로 단정하지 않는다.
  - 다만 `Mac mini 하나면`, `내 Mac이 AI 서버`, `4B급 속도로 26B급 성능`, `클라우드 API vs 로컬`처럼 특정 기기와 로컬 조합만 정답처럼 밀면 바이럴/선택적 비교로 본다.
  - Ollama는 NVIDIA, AMD ROCm, Apple Metal, 실험적 Vulkan 경로를 문서화하므로 특정 Mac 기기만의 장점처럼 포장하면 비교 공정성 점수를 깎는다.
- 링크:
  - [Google Gemma 4 모델 카드](https://ai.google.dev/gemma/docs/core/model_card_4)
  - [Ollama 하드웨어 지원](https://docs.ollama.com/gpu)

### 8. 권위팔이 AI 담론
- 기준: 공식 모델 최신성 자료와 K-워닝체크 내부 휴리스틱을 함께 쓴다.
- 해석:
  - `현업은 다 이렇게 한다`, `모르면 뒤처진다`, `우리 직원들은 코드 안 짠다`, `대기업은 이미 끝났다`처럼 검증하기 어려운 내부 사례와 트렌드 압박이 함께 나오면 권위팔이로 본다.
  - 비판 방향이 맞아 보여도 `50만 라인 유실`, `전세계 개발자들이 다 확인` 같은 수치와 내부 썰은 출처가 없으면 사실 검증 필요로 표시한다.
- 링크:
  - [Anthropic 모델 개요](https://docs.anthropic.com/en/docs/about-claude/models/overview)
  - [Anthropic 모델 폐기 공지](https://docs.anthropic.com/en/docs/about-claude/model-deprecations)

### 9. 구식 모델/최신성 부족
- 기준: 2026년 4월 8일 기준 공식 모델 개요와 폐기 공지를 따른다.
- 해석:
  - Anthropic 문서상 현재 비교표는 Claude Opus 4.6, Sonnet 4.6, Haiku 4.5를 최신 모델로 안내한다.
  - Claude Sonnet 3.5 계열은 2025년 10월 28일 은퇴된 것으로 문서화되어 있으므로, 2026년에 `Claude 3.5 Sonnet 원탑`처럼 추천하면 강한 최신성 감점이다.
- 링크:
  - [Anthropic 모델 개요](https://docs.anthropic.com/en/docs/about-claude/models/overview)
  - [Anthropic 모델 폐기 공지](https://docs.anthropic.com/en/docs/about-claude/model-deprecations)

## 출력 분류 축

- 사기성: 금전 요구, 개인정보 요구, 기관 사칭, 링크 클릭, 외부 메신저 이동
- 바이럴성: 특정 제품·기기 반복 노출, CTA, 단점 누락, 희소성·후기 위장
- AI 냄새: 매끈하지만 저밀도인 문장, 예외 없는 단정, 모델명/버전 부정확성
- 최신성 위험: 폐기·구형 모델을 현역처럼 추천, 현재 지원 상태 누락
- 선택적 비교: 비용·속도·성능 조건 불일치, 대체재 누락, 일부 장점만 비교
- 권위호소: 내부자 어조, 업계 일반화, 모르면 뒤처진다는 압박
- 후킹 문체: `딱 이거면 끝`, `10분이면 끝`, `30초 뒤`, `0원`, `원탑`, `끝판왕`

## AI 저품질 후킹글 체크리스트 100 적용

- 내부 엔진은 10개 대분류와 100개 항목을 전부 평가한다.
- 각 항목은 약한 매칭 1점, 강한 매칭 2점으로 계산한다.
- 치명 항목은 100점 환산 후 1개당 5점 보정을 적용한다.
- 사용자 화면에는 100개 전체를 그대로 노출하지 않고 상위 5개 사유와 태그 3~6개만 표시한다.
- 10개 대분류:
  - 최신성/버전 정확성
  - 사실성/검증 가능성
  - 과장/단정 표현
  - 비교 왜곡/선택적 프레이밍
  - 바이럴/제품 밀어주기
  - AI 특유 저품질 문체
  - 권위팔이/트렌드 강요
  - 실행 난이도 은폐
  - 비용·시간·성과 과장
  - 기술 맥락/균형감 부족
