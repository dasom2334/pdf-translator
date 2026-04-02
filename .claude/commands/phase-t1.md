---
description: "T-1: MyMemory 번역 어댑터. translation-builder 단독 실행."
---

## T-1: MyMemory 번역 어댑터

translation-builder 에이전트를 실행하여 T-1 작업만 수행한다.

```
Agent(subagent_type="translation-builder", isolation="worktree", prompt="T-1 작업만 수행하세요.

Branch: feature/mymemory-adapter

MyMemoryTranslationService 구현:
- MyMemory API (https://api.mymemory.translated.net/get) 사용
- API 키 불필요 (무료 tier: 일 5000자)
- translate(): HTTP GET (?q=text&langpair=en|ko)
- translateBatch(): 순차 호출, 문단 단위 청크 분할 (최대 500자)
- getSupportedLanguages(): 지원 언어 목록
- 에러: BadRequestException (빈 텍스트), TranslationException(BAD_GATEWAY) (API 오류)

TranslationServiceFactory 구현:
- getService(provider) switch-case
- MYMEMORY → MyMemoryTranslationService
- GEMINI → throw new Error('Not implemented — Phase 1 T-2')
- 잘못된 provider → BadRequestException

유닛 테스트 (mock HTTP 호출)

하네스 루프: pnpm build → pnpm lint → pnpm test 통과 후 commit → push → PR 생성.")
```
