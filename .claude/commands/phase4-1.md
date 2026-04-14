---
description: "Phase 4-1: 파일 기반 번역 캐시 서비스. 전제조건: phase7-2 머지."
---

## Phase 4-1

> **전제조건:** phase7-2 PR이 main에 머지된 상태.

```
Agent(subagent_type="translation-builder", isolation="worktree", prompt="Phase 4-1 작업을 수행하세요.

## 시작 전 필수: 최신 main 동기화
git fetch origin && git checkout main && git pull origin main

Branch: feature/translation-cache

## 배경
동일 텍스트 재번역 시 API 비용과 시간을 절감하기 위해 파일 기반 캐시를 도입합니다. ~/.pdf-translator/cache/ 디렉토리에 JSON 파일로 저장합니다.

1. 인터페이스 정의 (src/translation/interfaces/translation-cache.interface.ts):
   - TRANSLATION_CACHE = Symbol('TRANSLATION_CACHE')
   - ITranslationCache:
     - get(key: string): Promise<string | null>
     - set(key: string, value: string): Promise<void>
     - buildKey(text: string, sourceLang: string, targetLang: string, provider: string): string
     - clear(): Promise<void>
     - stats(): Promise<CacheStats>
   - CacheStats: { entries: number; sizeBytes: number; hitCount: number; missCount: number }

2. FileTranslationCacheService 구현 (src/translation/services/file-translation-cache.service.ts):
   - @Injectable(), ITranslationCache 구현
   - 캐시 디렉토리: path.join(os.homedir(), '.pdf-translator', 'cache')
   - onModuleInit()에서 디렉토리 생성 (fs.mkdir recursive)
   - buildKey(): SHA-256 해시 of `${text}|${sourceLang}|${targetLang}|${provider}`
   - 저장 구조: 해시 앞 2자를 서브디렉토리로 사용 → {cacheDir}/{prefix}/{prefix}.json
     - JSON 내용: { [fullHash]: { value: string, createdAt: string } }
   - get(): 파일 읽기 → 해시 조회 → 있으면 value 반환, 없으면 null
   - set(): 기존 파일 읽기 → 해시 추가 → atomic write (temp + rename)
   - clear(): 캐시 디렉토리 내 모든 파일 삭제
   - stats(): 모든 캐시 파일 순회 → 엔트리 수 + 총 크기 집계
   - hitCount/missCount는 인스턴스 변수로 런타임 추적

3. TranslationModule 등록:
   - providers에 FileTranslationCacheService 추가
   - { provide: TRANSLATION_CACHE, useExisting: FileTranslationCacheService }
   - exports에 TRANSLATION_CACHE 추가

4. CLAUDE.md 업데이트:
   - Shared Contracts에 ITranslationCache, CacheStats, TRANSLATION_CACHE 추가

5. 유닛 테스트 (src/translation/services/file-translation-cache.service.spec.ts):
   - 임시 디렉토리(os.tmpdir)를 캐시 경로로 override
   - set → get 라운드트립
   - 없는 키 → null
   - buildKey 결정성 (같은 입력 → 같은 해시)
   - clear → 이후 get이 null
   - stats → 정확한 엔트리 수
   - 동시 set 충돌 안정성

## 자동 교정 + 리뷰 루프
CLAUDE.md의 '자동 교정 + 리뷰 루프 (에이전트 공통)' 섹션을 따른다.")
```
