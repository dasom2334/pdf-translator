# Code Review — fix/translatebatch-parallel / Round 1
Date: 2026-04-06 22:33
Reviewer: code-reviewer (claude-sonnet-4-6)

## 판정: APPROVE

---

## 변경 범위

| 파일 | 변경 유형 |
|------|----------|
| `src/translation/services/mymemory-translation.service.ts` | fix: translateBatch for 루프 → Promise.all |
| `src/translation/services/gemini-translation.service.ts` | fix: translateBatch for 루프 → Promise.all |
| `src/translation/services/mymemory-translation.service.spec.ts` | test: 설명 업데이트 + 병렬 검증 케이스 추가 |
| `src/translation/services/gemini-translation.service.spec.ts` | test: 설명 업데이트 + 병렬 검증 케이스 추가 |

---

## 이슈 없음

발견된 이슈 없음 (🔴/🟡/🟢 모두 해당 없음).

---

## 세부 점검 결과

### CLAUDE.md 코딩 규칙 준수
- ITranslationService 인터페이스 시그니처 그대로 유지: 준수
- TranslationServiceFactory 미변경: 준수
- Conventional commits (`fix:`): 준수
- 파일 소유권 — `src/translation/**` 내 파일만 수정: 준수

### Exception Handling Rules
- translateBatch는 translate()에 위임하므로 예외 처리 경로 변화 없음
- BadRequestException (빈 텍스트) / TranslationException (API 오류) 분류 그대로 유지: 준수
- HttpException 직접 사용 없음: 준수

### 파일 소유권
- translation-builder 소유 파일(`src/translation/**`)만 수정: 준수
- Off-Limits 파일(src/pdf/**, src/cli/**, src/main.ts 등) 미변경: 준수

### 로직 정확성
- `Promise.all(texts.map(...))` 패턴은 입력 순서대로 결과를 보장함 — 기존 순차 반환 의미 유지
- 빈 배열 입력 시 `Promise.all([])` → `[]` 반환: 정상

### 테스트 커버리지
- 기존 happy path 케이스 설명 업데이트 ("sequentially" → "in parallel")
- 신규: `vi.spyOn(service, 'translate')`로 각 텍스트에 대한 호출 횟수 검증 — 병렬성 간접 검증
- 빈 배열 케이스 유지
- 에러 케이스는 translate() 단위 테스트에서 이미 커버됨

### 성능 / 부작용
- MyMemory: 일일 한도(5000자)가 있으나 translateBatch 호출 빈도가 낮고 청크 제어는 translate() 내부에서 유지되므로 허용 범위 내
- Gemini: rate limit 대응(지수 백오프)이 translateChunkWithRetry에 구현되어 있어 병렬 전환 후에도 재시도 동작 유지됨

### 보안
- 하드코딩된 시크릿 없음
- 민감 정보 노출 없음

---

## 총평

스펙에 정확히 부합하는 최소 변경. 로직, 예외 처리, 인터페이스, 파일 소유권 모두 규칙 준수.
테스트도 의도(병렬 호출)를 적절히 검증함.
