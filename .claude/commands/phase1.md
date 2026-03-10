---
description: "Phase 1: Core implementation. Implements PDF text extraction and DeepL adapter. Run after Phase 0 PRs are merged."
---

## Phase 1: Core Implementation

> **Prerequisite:** Phase 0 PRs must be merged into main.
> Run `git checkout main && git pull` first.

Run the following two tasks **sequentially** (recommended for Pro plan token limits).
For parallel execution, use separate terminals with `claude --worktree`.

---

### Task 1: PDF Text Extraction

**Branch:** `feature/pdf-extraction`
**File scope:** `src/pdf/**` only

Implement PdfService and PdfController with actual logic.

1. Install dependencies: `pnpm add pdf-parse multer @types/multer class-validator class-transformer`
2. Implement PdfService:
   - `extractText(fileBuffer: Buffer): Promise<string>` — uses pdf-parse
   - `extractTextByPages(fileBuffer: Buffer): Promise<string[]>` — page-level extraction
   - Error handling: empty file → BadRequestException, non-PDF → BadRequestException, extraction failure → InternalServerErrorException
3. Implement PdfController:
   - `POST /pdf/translate` — FileInterceptor('file'), calls PdfService.extractText(), then TranslationServiceFactory.getService(), then translate()
   - `GET /pdf/supported-languages` — accepts optional `provider` query param
4. Apply class-validator decorators to DTOs — replace `!` assertions with proper decorators:
   - `TranslatePdfDto`: `@IsString() sourceLang`, `@IsString() targetLang`, `@IsOptional() @IsEnum(TranslationProvider) provider?`
   - `TranslationResultDto`: `@IsString()` on all string fields, `@IsEnum(TranslationProvider) provider`
5. Add `ValidationPipe({ transform: true })` to main.ts
6. Write tests:
   - PdfService: valid PDF buffer → text, empty buffer → error, non-PDF → error
   - PdfController: mock TranslationServiceFactory, test request/response flow
7. Verify: `pnpm run lint` + `pnpm test` pass
8. Commit, push, and create PR

---

### Task 2: DeepL Translation Adapter

**Branch:** `feature/deepl-adapter`
**File scope:** `src/translation/**`, `src/common/exceptions/**` only

Implement DeepLTranslationService and TranslationServiceFactory with actual logic.

1. Install dependency: `pnpm add deepl-node`
2. Implement DeepLTranslationService:
   - Read DEEPL_API_KEY from ConfigService
   - `translate()` — uses deepl.Translator.translateText(), maps language codes
   - `translateBatch()` — array support via translateText()
   - `getSupportedLanguages()` — uses getTargetLanguages(), returns code array
   - Error handling: missing API key → clear error at init, empty text → BadRequestException, DeepL API errors → TranslationException wrapper
3. Implement TranslationServiceFactory:
   - `getService(provider)` — switch-case returning correct adapter
   - Google/LLM cases still throw NotImplementedException
   - Invalid provider → BadRequestException
4. Implement TranslationException (if still empty from Phase 0):
   - Extends HttpException with BAD_GATEWAY status
   - Wraps original error message
5. Add ConfigModule import to TranslationModule
6. Write tests:
   - DeepLTranslationService: mock deepl SDK, test translate/batch/languages, error cases
   - TranslationServiceFactory: DEEPL → correct instance, GOOGLE/LLM → NotImplementedException, invalid → BadRequestException
7. Verify: `pnpm run lint` + `pnpm test` pass
8. Commit, push, and create PR

---

## Done Criteria
- Both PRs created successfully
- All tests pass for both tasks
- `curl http://localhost:3000/pdf/supported-languages` returns language list (with valid DEEPL_API_KEY)
- `curl -X POST http://localhost:3000/pdf/translate -F "file=@test.pdf" -F "sourceLang=en" -F "targetLang=ko"` returns translated text (with valid DEEPL_API_KEY)