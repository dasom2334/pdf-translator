---
description: "Phase 1: 핵심 기능 구현. PDF 추출/생성, MyMemory 번역, CLI 커맨드. Phase 0 머지 후 실행."
---

## Phase 1: Core Implementation

> **전제조건:** Phase 0 PR이 main에 머지된 상태여야 함.

## 실행 방법

**Step 1 — 병렬:** 하나의 메시지에서 동시 실행:
1. `Agent(subagent_type="pdf-builder", isolation="worktree", prompt="Phase 1 pdf-builder 작업을 수행하세요. 아래 지시사항을 따르세요: ...")`
2. `Agent(subagent_type="translation-builder", isolation="worktree", prompt="Phase 1 translation-builder 작업을 수행하세요. 아래 지시사항을 따르세요: ...")`

**Step 2 — 순차:** Step 1의 두 에이전트가 모두 완료되고 PR 머지 후:
3. `Agent(subagent_type="cli-builder", isolation="worktree", prompt="Phase 1 cli-builder 작업을 수행하세요. 아래 지시사항을 따르세요: ...")`

---

### Sub-agent 1: @pdf-builder (병렬)

**Branch:** `feature/pdf-core`
**소유 파일:** `src/pdf/**`, `assets/fonts/**`

1. `assets/fonts/`에 Noto Sans 폰트 파일 배치 (NotoSans-Regular.ttf 또는 NotoSansCJKkr-Regular.otf)

2. **PdfExtractorService 구현** (`src/pdf/services/pdf-extractor.service.ts`):
   - pdf-parse로 텍스트 추출
   - `extractText(fileBuffer)` → 전체 텍스트
   - `extractTextByPages(fileBuffer)` → 페이지별 텍스트 배열
   - PDF 유효성 검증 — 바이너리 magic bytes 비교:
     ```typescript
     const magic = fileBuffer.slice(0, 4);
     if (magic[0] !== 0x25 || magic[1] !== 0x50 || magic[2] !== 0x44 || magic[3] !== 0x46) {
       throw new BadRequestException('File is not a valid PDF');
     }
     ```
   - 에러: 빈 파일 → BadRequestException, 파싱 실패 → InternalServerErrorException

3. **PdfGeneratorService 구현** (`src/pdf/services/pdf-generator.service.ts`):
   - pdf-lib + fontkit으로 새 PDF 생성
   - `generate(text, outputPath, options?)` → 단일 텍스트 PDF
   - `generateFromPages(pages[], outputPath, options?)` → 멀티페이지 PDF
   - 기본 폰트: `assets/fonts/` 번들 Noto Sans (fontkit으로 임베드)
   - 커스텀 폰트: `options.fontPath`로 오버라이드
   - 워드랩 알고리즘 (`font.widthOfTextAtSize()` 활용)
   - 출력 디렉토리 자동 생성 (`fs.mkdir({ recursive: true })`)
   - A4 크기 (595.28 x 841.89 pt), margin 50pt

4. PdfModule 와이어링:
   - `{ provide: PDF_EXTRACTOR, useExisting: PdfExtractorService }`
   - `{ provide: PDF_GENERATOR, useExisting: PdfGeneratorService }`
   - 토큰 export

5. 유닛 테스트 — happy path + 에러 케이스:
   - PdfExtractorService: valid PDF → text, empty → error, non-PDF → error
   - PdfGeneratorService: text → PDF 파일 생성, 멀티페이지, 커스텀 폰트

6. `pnpm run lint` + `pnpm test` 통과
7. Commit, push, PR 생성

---

### Sub-agent 2: @translation-builder (병렬)

**Branch:** `feature/mymemory-adapter`
**소유 파일:** `src/translation/**`, `src/common/**`

1. **MyMemoryTranslationService 구현** (`src/translation/services/mymemory-translation.service.ts`):
   - MyMemory API (`https://api.mymemory.translated.net/get`) 사용
   - API 키 불필요 (무료 tier: 일 5000자)
   - `translate()`: HTTP GET 요청으로 번역 (`?q=text&langpair=en|ko`)
   - `translateBatch()`: 순차 호출 또는 문장 결합
   - `getSupportedLanguages()`: MyMemory 지원 언어 목록 반환
   - 에러: 빈 텍스트 → BadRequestException, API 오류 → TranslationException(BAD_GATEWAY)

2. **TranslationServiceFactory 구현** (`src/translation/factories/translation-service.factory.ts`):
   - constructor에 모든 서비스 주입
   - `getService(provider)` — switch-case
   - MYMEMORY → MyMemoryTranslationService
   - GEMINI → `throw new Error('Not implemented — Phase 2')`
   - 잘못된 provider → BadRequestException

3. TranslationModule 와이어링:
   - ConfigModule import
   - Factory + 서비스들 provide/export

4. 유닛 테스트 — happy path + 에러 케이스:
   - MyMemoryTranslationService: mock HTTP 호출, translate/translateBatch/getSupportedLanguages
   - TranslationServiceFactory: provider 라우팅, invalid provider

5. `pnpm run lint` + `pnpm test` 통과
6. Commit, push, PR 생성

---

### Sub-agent 3: @cli-builder (순차 — Sub-agent 1, 2 완료 후)

**Branch:** `feature/cli-integration`
**소유 파일:** `src/cli/**`, `src/cli.ts`, `src/app.module.ts`, `src/main.ts`, `package.json` (scripts/bin만), `test/app.e2e-spec.ts`

> Sub-agent 1, 2의 PR이 머지된 후 실행.

1. **TranslateCommand 구현** (`src/cli/commands/translate.command.ts`):
   - 옵션:
     - `-i, --input <path>` (필수) — 입력 PDF
     - `-o, --output <path>` — 출력 PDF (기본: `<input>_<targetLang>.pdf`)
     - `-t, --target-lang <lang>` (필수)
     - `-s, --source-lang <lang>` (선택)
     - `-p, --provider <provider>` (기본: mymemory)
     - `--font <path>` — 커스텀 폰트 경로
   - 실행 흐름:
     1. `fs.readFile(inputPath)` → Buffer
     2. `pdfExtractor.extractTextByPages(buffer)` → string[]
     3. `translationService.translateBatch(pages, sourceLang, targetLang)` → string[]
     4. `pdfGenerator.generateFromPages(translatedPages, outputPath, { fontPath })` → void
     5. console.log 성공 메시지
   - 에러 핸들링: try/catch → 유저 친화적 메시지 + process.exit(1)

2. CliModule 와이어링: PdfModule + TranslationModule import, TranslateCommand provider

3. cli.ts: `CommandFactory.run(CliModule, ['log', 'warn', 'error'])`

4. app.module.ts: `ConfigModule.forRoot({ isGlobal: true })` 확인

5. main.ts: `ValidationPipe({ transform: true })` 확인

6. package.json:
   - scripts: `"cli": "npx ts-node -r tsconfig-paths/register src/cli.ts"`
   - bin: `"pdf-translator": "./dist/cli.js"`

7. 유닛 테스트: mock 주입, 전체 플로우 테스트

8. E2E 테스트 (`test/app.e2e-spec.ts`): CLI 커맨드 통합 검증

9. `pnpm run lint` + `pnpm test` 통과
10. Commit, push, PR 생성

---

## Done Criteria
- 3개 PR 생성 완료
- `pnpm run cli -- translate -i sample.pdf -t en` 실행 시 번역된 PDF 생성
- 모든 테스트 통과

## 실패 시 대응
- lint/test 실패 → 에이전트가 자체 수정 후 재시도 (최대 3회)
- PR 생성 실패 → 브랜치 push 확인 후 수동 `gh pr create`
- 파일 소유권 충돌 발견 → 해당 에이전트 중단, 사용자에게 보고
