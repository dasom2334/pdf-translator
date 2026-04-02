---
description: "T-2: Gemini 번역 어댑터. translation-builder 단독 실행."
---

## T-2: Gemini 번역 어댑터

translation-builder 에이전트를 실행하여 T-2 작업만 수행한다.

```
Agent(subagent_type="translation-builder", isolation="worktree", prompt="T-2 작업만 수행하세요.

Branch: feature/gemini-adapter

GeminiTranslationService 구현:
- @google/generative-ai SDK 연동
- GEMINI_API_KEY 환경변수
- onModuleInit()에서 API 키 검증 → throw new Error(...) (HttpException 금지)
- translate(): 프롬프트 기반 번역, 소스/타겟 언어 지정
- translateBatch(): 배치 프롬프트 또는 순차 호출, 청크 최대 4000자
- getSupportedLanguages(): LLM 지원 언어 목록
- 분당 요청 제한 대응 (지수 백오프 재시도)
- 에러: BadRequestException (빈 텍스트), TranslationException(BAD_GATEWAY) (API 오류)

TranslationServiceFactory에 GEMINI case 추가.

유닛 테스트 (Gemini SDK mock)

하네스 루프: pnpm build → pnpm lint → pnpm test 통과 후 commit → push → PR 생성.")
```
