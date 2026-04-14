---
description: "Phase 4-2: 캐시 통합 + CLI 옵션 (병렬). 전제조건: phase4-1 머지."
---

## Phase 4-2 (병렬)

> **전제조건:** phase4-1 PR이 main에 머지된 상태.

하나의 메시지에서 두 에이전트를 **동시에** 실행:

```
Agent(subagent_type="translation-builder", isolation="worktree", prompt="Phase 4-2 translation-builder 작업을 수행하세요.

## 시작 전 필수: 최신 main 동기화
git fetch origin && git checkout main && git pull origin main

Branch: feature/cached-translation

## 배경
phase4-1에서 만든 FileTranslationCacheService를 번역 흐름에 통합합니다. 데코레이터 패턴으로 기존 ITranslationService를 감싸서 캐시 체크 후 미스만 실제 번역합니다.

1. CachedTranslationService 구현 (src/translation/services/cached-translation.service.ts):
   - 생성자: ITranslationService(실제 서비스), ITranslationCache
   - ITranslationService 구현
   - translate(text, sourceLang, targetLang):
     a. cache.buildKey(text, sourceLang, targetLang, providerName) → key
     b. cache.get(key) → hit이면 바로 반환
     c. miss이면 delegate.translate() → cache.set() → 반환
   - translateBatch(texts, sourceLang, targetLang, options):
     a. 각 text에 대해 cache.get() → hits/misses 분류
     b. misses만 delegate.translateBatch()에 전달
     c. 번역 결과를 cache.set()으로 저장
     d. hits + 새 번역을 원래 순서로 합쳐 반환
   - getSupportedLanguages(): delegate에 위임

2. TranslationServiceFactory 수정 (src/translation/factories/translation-service.factory.ts):
   - TRANSLATION_CACHE 주입 (@Optional()으로 — 캐시 미설정 시 래핑 안 함)
   - getService(provider, useCache?: boolean): ITranslationService
     - useCache가 true이고 cache가 있으면: CachedTranslationService로 래핑
     - 아니면: 기존 서비스 직접 반환
   - provider 이름을 CachedTranslationService에 전달 (캐시 키 구분용)

3. 유닛 테스트:
   - 캐시 히트 시 delegate 호출 안 됨
   - 캐시 미스 시 delegate 호출 + 캐시 저장
   - translateBatch: 부분 히트 (일부만 delegate 호출)
   - useCache=false 시 래핑 안 됨

## 자동 교정 + 리뷰 루프
CLAUDE.md의 '자동 교정 + 리뷰 루프 (에이전트 공통)' 섹션을 따른다.")

Agent(subagent_type="cli-builder", isolation="worktree", prompt="Phase 4-2 cli-builder 작업을 수행하세요.

## 시작 전 필수: 최신 main 동기화
git fetch origin && git checkout main && git pull origin main

Branch: feature/cli-cache

## 배경
번역 캐시 기능이 추가되었습니다. CLI에서 캐시 활성/비활성 옵션과 히트율 출력을 추가합니다.

1. TranslateCommand에 옵션 추가 (src/cli/commands/translate.command.ts):
   - --no-cache 플래그: 캐시 비활성화 (기본: 캐시 활성)
   - TranslateOptions에 cache?: boolean 전달

2. TranslateOptions 확장:
   - PdfTranslationService의 TranslateOptions에 cache?: boolean 추가 필요
   - 이 값은 내부에서 TranslationServiceFactory.getService(provider, cache)에 전달됨
   - 주의: TranslateOptions 인터페이스는 src/pdf/interfaces/에 있어 직접 수정 불가
   - → PdfTranslationService가 cache 옵션을 받아 factory에 전달하도록 연동

3. 번역 완료 후 캐시 통계 출력:
   - TRANSLATION_CACHE를 주입하여 stats() 호출
   - 출력 형식: Cache: {hitCount}/{hitCount+missCount} hits ({percentage}%)
   - --no-cache 시 통계 출력 생략

4. .pdf-translator.yml 설정에 cache 옵션 추가:
   - cli-config.loader.ts의 CliConfig 인터페이스에 cache?: boolean 추가

5. 유닛 테스트:
   - --no-cache 시 cache=false 전달 확인
   - 기본값 cache=true 확인
   - 캐시 통계 출력 포맷 확인

## 자동 교정 + 리뷰 루프
CLAUDE.md의 '자동 교정 + 리뷰 루프 (에이전트 공통)' 섹션을 따른다.")
```
