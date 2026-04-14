---
description: "Phase 8-1: HTTP API 컨트롤러 + main.ts 설정 (병렬). 전제조건: phase6-2 머지."
---

## Phase 8-1 (병렬)

> **전제조건:** phase6-2 PR이 main에 머지된 상태.

하나의 메시지에서 두 에이전트를 **동시에** 실행:

```
Agent(subagent_type="pdf-builder", isolation="worktree", prompt="Phase 8-1 pdf-builder 작업을 수행하세요.

## 시작 전 필수: 최신 main 동기화
git fetch origin && git checkout main && git pull origin main

Branch: feature/http-api-controller

## 배경
Phase 3에서 만든 PdfTranslationService 덕분에 HTTP API는 서비스 호출만으로 구현 가능합니다. 기존 hollow PdfController를 실제 REST 엔드포인트로 구현합니다.

1. PdfController 구현 (src/pdf/pdf.controller.ts):

   a. POST /pdf/translate
      - @UseInterceptors(FileInterceptor('file')) — Multer 파일 업로드
      - Body: TranslatePdfDto (class-validator 검증)
      - 로직:
        1. file.buffer 추출
        2. outputPath 생성 (UPLOAD_DIR + UUID + '_translated.pdf')
        3. pdfTranslationService.translate(buffer, { ...dto, outputPath })
        4. 성공: 파일 스트림으로 응답 (Content-Type: application/pdf, Content-Disposition: attachment)
        5. 또는 TranslateResultDto JSON 반환 (사용자 선택)
      - @Inject(PDF_TRANSLATION_SERVICE)

   b. GET /pdf/supported-languages
      - TranslationServiceFactory.getService('mymemory').getSupportedLanguages()
      - 캐시 가능 (언어 목록은 정적)

   c. GET /pdf/health
      - { status: 'ok', version: package.json version }

2. DTO 재생성 (src/pdf/dto/):

   a. translate-pdf.dto.ts:
      - @IsString() @IsNotEmpty() targetLang: string
      - @IsOptional() @IsString() sourceLang?: string
      - @IsOptional() @IsEnum(TranslationProvider) provider?: TranslationProvider
      - @IsOptional() @IsEnum(OutputMode) mode?: OutputMode
      - @IsOptional() @IsString() pages?: string
      - @IsOptional() @IsBoolean() ocr?: boolean
      - @IsOptional() @IsString() ocrLang?: string
      - @IsOptional() @IsBoolean() vision?: boolean
      - @IsOptional() @IsBoolean() mergeBlocks?: boolean
      - @IsOptional() @IsBoolean() cache?: boolean

   b. translate-result.dto.ts:
      - outputPath: string
      - pageCount: number
      - blockCount: number
      - failedPages: number[]

3. 에러 핸들링:
   - BadRequestException → 400
   - InternalServerErrorException → 500
   - TranslationException → 502 (BAD_GATEWAY)
   - 파일 크기 초과 → 413 (PayloadTooLargeException)
   - 파일 미첨부 → 400

4. PdfModule 업데이트:
   - controllers에 PdfController 추가 (이미 있을 수 있음 — 확인 후 보강)
   - multer 설정: limits.fileSize = ConfigService.get('MAX_FILE_SIZE') || 10MB

5. 유닛 테스트 (src/pdf/pdf.controller.spec.ts):
   - POST /pdf/translate: mock 파일 업로드 → 서비스 호출 → 결과 반환
   - DTO 검증: targetLang 누락 → 400
   - GET /pdf/supported-languages → 언어 배열
   - GET /pdf/health → { status: 'ok' }

## 자동 교정 + 리뷰 루프
CLAUDE.md의 '자동 교정 + 리뷰 루프 (에이전트 공통)' 섹션을 따른다.")

Agent(subagent_type="cli-builder", isolation="worktree", prompt="Phase 8-1 cli-builder 작업을 수행하세요.

## 시작 전 필수: 최신 main 동기화
git fetch origin && git checkout main && git pull origin main

Branch: feature/http-api-bootstrap

## 배경
HTTP API가 PdfController에 구현됩니다. main.ts에서 HTTP 서버 부트스트랩을 실제로 동작하게 만듭니다.

1. main.ts 업데이트 (src/main.ts):
   - NestFactory.create(AppModule)
   - app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }))
   - CORS 활성화: app.enableCors()
   - 파일 업로드 크기 제한: bodyParser limit 또는 Multer 설정
   - 포트: ConfigService.get('PORT') || 3000
   - 시작 로그: console.log('PDF Translator API running on port ...')

2. app.module.ts 확인 (src/app.module.ts):
   - PdfModule이 PDF_TRANSLATION_SERVICE를 export하는지 확인
   - TranslationModule이 import되어 있는지 확인
   - ConfigModule.forRoot({ isGlobal: true }) 확인

3. package.json scripts 확인:
   - 'start': 'node dist/main' — HTTP 서버 시작
   - 'start:dev': 'nest start --watch'
   - 기존 스크립트와 충돌 없는지 확인

4. 유닛 테스트:
   - E2E 테스트 (test/app.e2e-spec.ts)에 API 엔드포인트 테스트 추가
   - GET /pdf/health → 200

## 자동 교정 + 리뷰 루프
CLAUDE.md의 '자동 교정 + 리뷰 루프 (에이전트 공통)' 섹션을 따른다.")
```
