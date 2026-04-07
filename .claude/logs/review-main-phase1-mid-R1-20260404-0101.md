# 검수 로그

## 대상
- 브랜치: main
- PR: 없음 (main 브랜치 직접 검수)
- 라운드: R1

---

## 체크리스트 결과

| 항목 | 통과/실패 | 근거 (파일:줄) |
|------|-----------|---------------|
| 스펙 준수 | 실패 | 아래 상세 참조 |
| 엣지케이스 | 실패 | 아래 상세 참조 |
| 에러 핸들링 | 실패 | 아래 상세 참조 |
| 보안 | 통과 | 민감 정보 노출 없음, 인젝션 위험 없음 |
| 가독성 | 통과 | 주석, 네이밍, 구조 모두 명확 |

---

## 상세 검수 결과

### [E-1] PdfExtractorService

**스펙 준수 — 실패**
- `extractBlocks()`가 텍스트 블록이 없을 때 `BadRequestException`을 throw함  
  (`src/pdf/services/pdf-extractor.service.ts:148`: `throw new BadRequestException('No text content found in the PDF document')`)  
  스펙은 "비PDF/빈 파일 → BadRequestException, 파싱 실패 → InternalServerErrorException"으로만 규정하고 있음. 텍스트 없음 자체는 유효한 PDF이므로 이 예외가 스펙에 명시된 것인지 불분명.  
  → **질의 사항으로 분류** (Q1)

- `extractBlocksByPages()`는 빈 페이지 배열을 반환할 수 있음 (텍스트 없음 예외 없음) — `extractBlocks()`와 일관성 불일치.  
  (`src/pdf/services/pdf-extractor.service.ts:157~200`: `result` 배열을 그대로 반환, 빈 배열 체크 없음)

**엣지케이스 — 실패**
- `parsePageRange()`에서 역범위("5-1")를 입력하면 빈 Set을 반환하며 별도 오류 없이 조용히 빈 결과를 냄  
  (`src/pdf/services/pdf-extractor.service.ts:35~54`)
- `pageRange`가 완전히 유효하지 않은 문자열("abc")일 때도 빈 배열로 조용히 처리됨 — 사용자 실수를 알 수 없음.

---

### [T-1] MyMemoryTranslationService

**스펙 준수 — 실패**
- `translateBatch()`가 `Promise.all` 병렬 처리가 아닌 순차 `for` 루프로 구현되어 있음  
  (`src/translation/services/mymemory-translation.service.ts:128~133`)  
  스펙: "translateBatch(): 병렬 처리 (각 텍스트를 Promise.all로 병렬 호출)"  
  테스트 코드도 "should translate all texts sequentially"라고 명시하여 순차 처리를 정상으로 검증함 — 스펙 불일치.

**엣지케이스 — 통과**
- 빈 텍스트, 네트워크 오류, 429 상태 처리 모두 구현됨.

---

### [T-2] GeminiTranslationService

**스펙 준수 — 실패**
- `translateBatch()`가 `Promise.all` 병렬 처리가 아닌 순차 `for` 루프로 구현되어 있음  
  (`src/translation/services/gemini-translation.service.ts:147~153`)  
  스펙: "translateBatch(): 병렬 처리"

- `translate()` 내부 청크 루프도 병렬이 아닌 순차:  
  (`src/translation/services/gemini-translation.service.ts:131~136`: `for (const chunk of chunks)`)  
  반면 MyMemory의 `translate()`는 `Promise.all`로 청크를 병렬 처리함 — 구현 일관성 불일치.

**에러 핸들링 — 통과**
- `onModuleInit()`에서 API 키 없을 시 `throw new Error(...)` — 스펙 준수.
- 지수 백오프 재시도 구현됨.

---

### [TranslationServiceFactory]

**스펙 준수 — 통과**
- `getService()` 구현 및 잘못된 provider → `BadRequestException` 처리 완료.

---

### [G-1+G-2] PdfOverlayGeneratorService

**스펙 준수 — 통과**
- pdf-lib 로드, 화이트박스 처리, 번역 텍스트 삽입, fontkit CJK 임베딩 모두 구현.
- `fitText()` 폰트 사이즈 축소 + 말줄임 처리 구현됨.

**에러 핸들링 — 실패**
- 텍스트 렌더링 실패(`page.drawText`) 시 예외를 조용히 무시함  
  (`src/pdf/services/pdf-overlay-generator.service.ts:146~151`: 빈 `catch {}` 블록)  
  화이트박스는 그려지지만 텍스트가 누락되어도 사용자에게 알림 없음.  
  → **질의 사항으로 분류** (Q2)

**엣지케이스 — 실패**
- `block.width <= 0` 또는 `block.fontSize <= 0`인 경우 `fitText()`가 무한 루프에 빠질 수 있음  
  (`src/pdf/services/pdf-overlay-generator.service.ts:34~37`:  
  `while (fontSize > MIN_FONT_SIZE && ...)` — `fontSize`가 초기에 0이면 루프 진입 불가이나  
  `measureWidth` 결과가 항상 0을 넘으면서 `boxWidth=0`이면 ellipsis 루프:  
  `src/pdf/services/pdf-overlay-generator.service.ts:41~45`:  
  `while (truncated.length > 0 && measureWidth(truncated + ELLIPSIS, fontSize) > boxWidth)`  
  `boxWidth = 0`이고 `ELLIPSIS`만으로도 `measureWidth > 0`이면 `truncated`가 빈 문자열이 될 때까지 반복함. 빈 문자열 + ELLIPSIS = "..."이 여전히 `> 0`이면 루프 종료되지 않음.)  
  → **잠재적 무한 루프** 위험.

---

### [C-1+C-2] TranslateCommand

**스펙 준수 — 통과**
- `-i, -o, -t, -s, -p, --mode, --font, --pages` 옵션 모두 구현.
- 오케스트레이션 흐름 (readFile → extractBlocksByPages → translateBatch → 1:1 매핑 → overlay/rebuild 분기) 구현됨.
- rebuild 모드 → `console.error + process.exit(1)` 구현됨.
- 에러 → `try/catch → console.error + process.exit(1)` 구현됨.
- provider/mode 파서 enum 검증 구현됨.

**엣지케이스 — 실패**
- `--pages` 옵션 파서(`parsePages`)가 정의되지 않음  
  (`src/cli/commands/translate.command.ts` 전체: `@Option` 데코레이터에 `--pages` 없음)  
  옵션이 `TranslateCommandOptions.pages`에 인터페이스로 정의되어 있으나  
  (`src/cli/commands/translate.command.ts:16`), nest-commander `@Option` 파서 메서드가 없어  
  CLI에서 `--pages` 값을 전달해도 실제로 파싱되지 않음 — 스펙 누락.

---

### 공통

**보안 — 통과**
- `GEMINI_API_KEY`는 환경변수로만 관리, 코드에 하드코딩 없음.
- SQL/코드 인젝션 위험 없음.

**가독성 — 통과**
- 각 서비스마다 주석이 충분하고, 파일 구조가 스펙의 디렉터리 구조와 일치.

---

## 질의 사항
의도가 불분명한 항목:

- **Q1**: `src/pdf/services/pdf-extractor.service.ts:148` — `extractBlocks()`에서 텍스트 블록이 없을 때 `BadRequestException`을 throw하는 것이 의도된 설계인가? 스펙에 명시되지 않은 케이스이며, 이미지 전용 PDF(유효한 PDF이나 텍스트 없음)를 처리 거부하는 것이 맞는지 확인 필요.

- **Q2**: `src/pdf/services/pdf-overlay-generator.service.ts:146~151` — `page.drawText()` 실패 시 예외를 조용히 무시하는 것이 의도된 것인가? CJK 문자를 fallback Helvetica로 렌더링 실패 시 흰 박스만 남고 텍스트 누락이 사용자에게 알려지지 않음. 최소한 `Logger.warn()` 수준의 로그가 있어야 하는지 확인 필요.

---

## 최적 개선 제안

- `MyMemoryTranslationService.translateBatch()` 및 `GeminiTranslationService.translateBatch()`에서 `Promise.all` 병렬화를 도입하면 대용량 PDF의 번역 처리 속도가 크게 개선됨 (스펙 요구사항이기도 함).

- `GeminiTranslationService.translate()` 내 청크 루프도 `Promise.all` 병렬화 가능 — 단, Gemini rate limit 재시도 로직과 충돌하지 않도록 concurrency 제한 필요.

- `PdfOverlayGeneratorService`의 `fitText()`에 `boxWidth <= 0` 가드 조건 추가 권장 — 방어적 프로그래밍.

- `PdfExtractorService.extractBlocksByPages()`에서 빈 pageRange 문자열 ("") 입력 시에도 전체 페이지 처리로 fallback되도록 현재 `pageRange.trim()` 체크가 있으나, 잘못된 범위 ("abc", "0", "999") 시 빈 배열 반환 대신 경고 로그 출력 권장.

---

## 판정

**REQUEST_CHANGES**

---

## 수정 요청

1. `src/translation/services/mymemory-translation.service.ts:128~133` — `translateBatch()`를 순차 `for` 루프에서 `Promise.all(texts.map(...))` 병렬 처리로 변경. 스펙에서 "각 텍스트를 Promise.all로 병렬 호출"이라고 명시.

2. `src/translation/services/gemini-translation.service.ts:147~153` — `translateBatch()`를 순차 `for` 루프에서 `Promise.all(texts.map(...))` 병렬 처리로 변경. 스펙 동일.

3. `src/cli/commands/translate.command.ts` — `--pages` 옵션 파서 메서드 누락. `parsePages(val: string): string { return val; }`를 `@Option({ flags: '--pages <range>', description: '...' })` 데코레이터와 함께 추가해야 CLI에서 `--pages` 인자가 실제로 동작함.

4. `src/pdf/services/pdf-overlay-generator.service.ts:41~45` — `fitText()`의 ellipsis 루프에서 `boxWidth <= 0` 또는 ELLIPSIS 자체가 boxWidth를 초과하는 경우 무한 루프 방지 가드 추가. 예: `if (measureWidth(ELLIPSIS, fontSize) > boxWidth) { return { text: '', fontSize }; }` 와 같은 조기 탈출 조건 필요.

5. `src/translation/services/mymemory-translation.service.spec.ts:102` — `translateBatch` 테스트 설명이 "should translate all texts sequentially"로 순차 처리를 정상으로 검증하고 있음. 위 수정(1)과 함께 "should translate all texts in parallel" 등으로 테스트 설명 및 검증 방식도 업데이트 필요.

6. `src/translation/services/gemini-translation.service.spec.ts:115` — `translateBatch` 테스트 설명이 "should translate all texts sequentially"로 되어 있음. 위 수정(2)와 함께 업데이트 필요.

---

## 검수 완료 시각
2026-04-04 01:01
