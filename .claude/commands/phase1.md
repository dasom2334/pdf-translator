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
**File scope:** `src/pdf/**`, `src/main.ts` only

Implement PdfService and PdfController with actual logic.

1. Install dependencies: `pnpm add pdf-parse multer @types/multer @types/pdf-parse class-validator class-transformer`

2. Implement PdfService:
   - `extractText(fileBuffer: Buffer): Promise<string>` — uses pdf-parse
   - `extractTextByPages(fileBuffer: Buffer): Promise<string[]>` — page-level extraction
   - PDF 검증은 **반드시 바이너리 비교**로 할 것 (문자열 비교 금지):
     ```typescript
     const magic = fileBuffer.slice(0, 4);
     if (magic[0] !== 0x25 || magic[1] !== 0x50 || magic[2] !== 0x44 || magic[3] !== 0x46) {
       throw new BadRequestException('File is not a valid PDF');
     }
     ```
   - Error handling: empty file → BadRequestException, non-PDF → BadRequestException, extraction failure → InternalServerErrorException

3. Implement PdfController:
   - `POST /pdf/translate` — FileInterceptor('file')에 **반드시 파일 검증과 크기 제한** 추가:
     ```typescript
     @UseInterceptors(FileInterceptor('file', {
       limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE ?? '10485760') },
     }))
     async translatePdf(
       @UploadedFile(new ParseFilePipe({ validators: [new MaxFileSizeValidator({ maxSize: parseInt(process.env.MAX_FILE_SIZE ?? '10485760') })] }))
       file: Express.Multer.File,
       @Body() dto: TranslatePdfDto,
     )
     ```
   - `GET /pdf/supported-languages` — accepts optional `provider` query param

4. Apply class-validator decorators to DTOs — replace `!` assertions with proper decorators:
   - `TranslatePdfDto`:
     ```typescript
     @IsString()
     @IsNotEmpty()
     @Length(2, 5)
     sourceLang: string;

     @IsString()
     @IsNotEmpty()
     @Length(2, 5)
     targetLang: string;

     @IsOptional()
     @IsEnum(TranslationProvider)
     provider?: TranslationProvider;
     ```
   - `TranslationResultDto`: `@IsString()` on all string fields, `@IsEnum(TranslationProvider) provider`

5. Add `ValidationPipe({ transform: true })` to main.ts

6. Write tests — **반드시 happy path 포함**:
   - PdfService:
     - `extractText`: valid PDF buffer → returns text (happy path)
     - `extractText`: empty buffer → BadRequestException
     - `extractText`: non-PDF buffer → BadRequestException
     - `extractText`: corrupt PDF → InternalServerErrorException
     - `translatePdf`: valid file + dto → TranslationResultDto (happy path, mock factory)
     - `getSupportedLanguages`: returns language array (happy path, mock factory)
   - PdfController:
     - `POST /pdf/translate`: mock PdfService.translatePdf → returns result (happy path)
     - `GET /pdf/supported-languages`: mock PdfService.getSupportedLanguages → returns languages

7. Verify: `pnpm run lint` + `pnpm test` pass
8. Commit, push, and create PR

---

### Task 2: DeepL Translation Adapter

**Branch:** `feature/deepl-adapter`
**File scope:** `src/translation/**`, `src/common/exceptions/**`, `src/app.module.ts` only

Implement DeepLTranslationService and TranslationServiceFactory with actual logic.

1. Install dependency: `pnpm add deepl-node @nestjs/config`

2. Implement DeepLTranslationService:
   - Read DEEPL_API_KEY from ConfigService
   - API 키 검증은 **`onModuleInit()`에서 `Error`를 throw**할 것 (`TranslationException` 금지 — NestJS 앱 시작 중단이 목적):
     ```typescript
     onModuleInit() {
       const apiKey = this.configService.get<string>('DEEPL_API_KEY');
       if (!apiKey) {
         throw new Error('DEEPL_API_KEY is not configured');
       }
       this.translator = new deepl.Translator(apiKey);
     }
     ```
   - `translate()` — uses deepl.Translator.translateText(), maps language codes
   - `translateBatch()` — array support via translateText()
   - `getSupportedLanguages()` — uses getTargetLanguages(), returns code array
   - Error handling: empty text → BadRequestException, DeepL API errors → TranslationException(message, HttpStatus.BAD_GATEWAY)

3. Implement TranslationServiceFactory:
   - constructor에 DeepLTranslationService, GoogleTranslationService, LlmTranslationService **모두 주입**
   - `getService(provider)` — switch-case returning correct adapter
   - Google/LLM cases: `throw new Error('Not implemented')`
   - Invalid provider → BadRequestException

4. TranslationException은 Phase 0에서 이미 구현됨 (HttpStatus 파라미터 지원). 그대로 사용.

5. Add ConfigModule import to TranslationModule, ConfigModule.forRoot({ isGlobal: true }) to AppModule

6. Write tests — **반드시 happy path 포함**:
   - DeepLTranslationService: mock deepl SDK
     - `translate`: valid text → translated string (happy path)
     - `translate`: empty text → BadRequestException
     - `translate`: API error → TranslationException (BAD_GATEWAY)
     - `translateBatch`: valid array → translated array (happy path)
     - `translateBatch`: empty array → BadRequestException
     - `getSupportedLanguages`: → language code array (happy path)
     - `getSupportedLanguages`: API error → TranslationException
   - TranslationServiceFactory:
     - DEEPL → DeepLTranslationService 인스턴스
     - GOOGLE → GoogleTranslationService 인스턴스
     - LLM → LlmTranslationService 인스턴스
     - invalid → BadRequestException

7. Verify: `pnpm run lint` + `pnpm test` pass
8. Commit, push, and create PR

---

## Done Criteria
- Both PRs created successfully
- All tests pass for both tasks
- `curl http://localhost:3000/pdf/supported-languages` returns language list (with valid DEEPL_API_KEY)
- `curl -X POST http://localhost:3000/pdf/translate -F "file=@test.pdf" -F "sourceLang=en" -F "targetLang=ko"` returns translated text (with valid DEEPL_API_KEY)
