---
description: "Phase 1: POC 핵심 기능. E-1 + T-1 + T-2 → G-1 + G-2 → C-1 + C-2. Phase 0 머지 후 실행."
---

## Phase 1: POC Core Implementation

> **전제조건:** Phase 0 PR이 main에 머지된 상태여야 함.
> **레이어 페이즈 매핑:** E-1 + T-1 + T-2 (병렬) → G-1 + G-2 (순차) → C-1 + C-2 (순차)

## 실행 방법

**Step 1 — 병렬:** 하나의 메시지에서 동시 실행:
1. `Agent(subagent_type="pdf-builder", isolation="worktree", prompt="Phase 1 E-1 작업: ...")`
2. `Agent(subagent_type="translation-builder", isolation="worktree", prompt="Phase 1 T-1 + T-2 작업: ...")`

**Step 2 — 순차:** Step 1 PR 머지 후:
3. `Agent(subagent_type="pdf-builder", isolation="worktree", prompt="Phase 1 G-1 + G-2 작업: ...")`

**Step 3 — 순차:** Step 2 PR 머지 후:
4. `Agent(subagent_type="cli-builder", isolation="worktree", prompt="Phase 1 C-1 + C-2 작업: ...")`

---

### Step 1-A: @pdf-builder — E-1 (병렬)

**Branch:** `feature/pdf-extractor`
**소유 파일:** `src/pdf/**`, `assets/fonts/**`

1. `assets/fonts/`에 Noto Sans 폰트 파일 배치 (NotoSansCJKkr-Regular.otf)

2. **PdfExtractorService 구현** (`src/pdf/services/pdf-extractor.service.ts`):
   - `pdfjs-dist`로 위치 포함 텍스트 블록 추출
   - `extractBlocks(fileBuffer)` → TextBlock[] (전체)
   - `extractBlocksByPages(fileBuffer, pageRange?)` → TextBlock[][] (페이지별)
   - 각 TextBlock에 text, page, x, y, width, height, fontSize, fontName 포함
   - PDF 유효성 검증 — 바이너리 magic bytes 비교 (`0x25 0x50 0x44 0x46`)
   - 에러: 빈 파일 → BadRequestException, 파싱 실패 → InternalServerErrorException

3. PdfModule 와이어링:
   - `{ provide: PDF_EXTRACTOR, useExisting: PdfExtractorService }`
   - 토큰 export

4. 유닛 테스트 — happy path + 에러 케이스:
   - PdfExtractorService: valid PDF → TextBlock[], empty → error, non-PDF → error
   - TextBlock 필드 검증 (x, y, fontSize 등 포함 확인)

5. 하네스 검증 루프 통과 후 Commit, push, PR 생성

---

### Step 1-B: @translation-builder — T-1 + T-2 (병렬)

**Branch:** `feature/translation-adapters`
**소유 파일:** `src/translation/**`, `src/common/**`

1. **MyMemoryTranslationService 구현 (T-1)** (`src/translation/services/mymemory-translation.service.ts`):
   - MyMemory API (`https://api.mymemory.translated.net/get`) 사용
   - API 키 불필요 (무료 tier: 일 5000자)
   - `translate()`: HTTP GET 요청 (`?q=text&langpair=en|ko`)
   - `translateBatch()`: 순차 호출
   - `getSupportedLanguages()`: 지원 언어 목록 반환
   - 문단 단위 청크 분할 (최대 500자)
   - 에러: 빈 텍스트 → BadRequestException, API 오류 → TranslationException(BAD_GATEWAY)

2. **GeminiTranslationService 구현 (T-2)** (`src/translation/services/gemini-translation.service.ts`):
   - `@google/generative-ai` SDK 연동
   - GEMINI_API_KEY 환경변수
   - `onModuleInit()`에서 API 키 검증 → `throw new Error(...)` (HttpException 금지)
   - 프롬프트 기반 번역, 청크 최대 4000자
   - 분당 요청 제한 대응 (지수 백오프 재시도)

3. **TranslationServiceFactory 구현** (`src/translation/factories/translation-service.factory.ts`):
   - `getService(provider)` — switch-case
   - MYMEMORY → MyMemoryTranslationService
   - GEMINI → GeminiTranslationService
   - 잘못된 provider → BadRequestException

4. TranslationModule 와이어링

5. 유닛 테스트 (mock HTTP/SDK 호출)

6. 하네스 검증 루프 통과 후 Commit, push, PR 생성

---

### Step 2: @pdf-builder — G-1 + G-2 (순차)

**Branch:** `feature/pdf-generators`
**소유 파일:** `src/pdf/**`

> Step 1 PR 머지 후 실행.

1. **PdfOverlayGeneratorService 구현 (G-1)** (`src/pdf/services/pdf-overlay-generator.service.ts`):
   - pdf-lib로 원본 PDF 로드
   - 각 TextBlock 영역을 화이트박스로 덮어 기존 텍스트 가리기
   - 같은 좌표에 block.translatedText 렌더링 (번역 폰트 적용)
   - CJK 폰트 임베딩 (fontkit)
   - **POC 제약: 흰 배경 PDF만 정상 동작**

2. **텍스트 오버플로 처리 (G-2)**:
   - block.translatedText가 원본 width를 초과할 경우 fontSize 자동 축소
   - 최소 fontSize 이하로도 넘치면 말줄임(...) 처리

3. PdfModule 와이어링:
   - `{ provide: PDF_OVERLAY_GENERATOR, useExisting: PdfOverlayGeneratorService }`
   - 토큰 export

4. 유닛 테스트

5. 하네스 검증 루프 통과 후 Commit, push, PR 생성

---

### Step 3: @cli-builder — C-1 + C-2 (순차)

**Branch:** `feature/cli-integration`
**소유 파일:** `src/cli/**`, `src/cli.ts`, `src/app.module.ts`, `src/main.ts`, `package.json` (scripts/bin만), `test/app.e2e-spec.ts`

> Step 2 PR 머지 후 실행.

1. **TranslateCommand 구현 (C-1 + C-2)** (`src/cli/commands/translate.command.ts`):
   - 옵션:
     - `-i, --input <path>` (필수) — 입력 PDF
     - `-o, --output <path>` — 출력 PDF (기본: `<input>_<targetLang>.pdf`)
     - `-t, --target-lang <lang>` (필수)
     - `-s, --source-lang <lang>` (선택)
     - `-p, --provider <provider>` (기본: mymemory)
     - `--mode overlay|rebuild` (기본: overlay)
     - `--font <path>` — 커스텀 폰트 경로
   - **오케스트레이션 흐름 (TextBlock ↔ 번역 매핑 책임)**:
     1. `fs.readFile(inputPath)` → Buffer
     2. `pdfExtractor.extractBlocksByPages(buffer)` → TextBlock[][]
     3. TextBlock[].text를 추출 → 블록 단위로 번역 요청 그룹핑
     4. `translationService.translateBatch(texts, sourceLang, targetLang)` → string[]
     5. 번역 결과를 원래 TextBlock 순서에 1:1 매핑 → `block.translatedText = result`
     6. `--mode`에 따라:
        - overlay: `pdfOverlayGenerator.overlay(buffer, blocks, outputPath, { fontPath })`
        - rebuild: 아직 미구현 → 에러 메시지 출력
     7. console.log 성공 메시지
   - 에러 핸들링: try/catch → 유저 친화적 메시지 + process.exit(1)

2. CliModule 와이어링: PdfModule + TranslationModule import

3. cli.ts: `CommandFactory.run(CliModule, ['log', 'warn', 'error'])`

4. package.json scripts: `"cli": "npx ts-node -r tsconfig-paths/register src/cli.ts"`

5. 유닛 테스트 + E2E 테스트

6. 하네스 검증 루프 통과 후 Commit, push, PR 생성

---

## Done Criteria
- `pnpm run cli -- translate -i sample.pdf -t ko -p mymemory --mode overlay -o out.pdf` 실행 시 번역된 PDF 생성
- TextBlock에 x, y, fontSize 위치 정보 포함 확인
- overlay 모드에서 원본 좌표에 번역 텍스트 치환 확인
- 모든 테스트 통과

## 실패 시 대응
- 동일 에러 3회 반복 → 에이전트 중단, 사용자에게 에스컬레이션
- PR 생성 실패 → 브랜치 push 확인 후 수동 `gh pr create`
- 파일 소유권 충돌 발견 → 해당 에이전트 중단, 사용자에게 보고
