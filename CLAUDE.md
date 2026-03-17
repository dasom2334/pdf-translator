# PDF Translator — Project Rules

## Overview
CLI 프로그램: PDF 파일의 텍스트를 추출 → 번역 → 새 PDF로 생성.
- NestJS 11 (Node 22 LTS, pnpm 9, mise.toml)
- CLI: nest-commander
- HTTP API도 병행 제공 (curl/Postman)
- 어댑터 패턴으로 번역 서비스 교체 가능

## Shared Contracts

### TranslationProvider enum
```typescript
export enum TranslationProvider {
  MYMEMORY = 'mymemory',
  GEMINI = 'gemini',
}
```

### ITranslationService interface
```typescript
export interface ITranslationService {
  translate(text: string, sourceLang: string, targetLang: string): Promise<string>;
  translateBatch(texts: string[], sourceLang: string, targetLang: string): Promise<string[]>;
  getSupportedLanguages(): Promise<string[]>;
}
```

### IPdfExtractor interface
```typescript
export interface IPdfExtractor {
  extractText(fileBuffer: Buffer): Promise<string>;
  extractTextByPages(fileBuffer: Buffer): Promise<string[]>;
}
```

### IPdfGenerator interface
```typescript
export interface IPdfGenerator {
  generate(text: string, outputPath: string, options?: PdfGenerateOptions): Promise<void>;
  generateFromPages(pages: string[], outputPath: string, options?: PdfGenerateOptions): Promise<void>;
}

export interface PdfGenerateOptions {
  fontPath?: string;
}
```

### CLI 사용법
```bash
pnpm run cli -- translate \
  -i <input.pdf> \
  -t <target-lang> \
  [-s <source-lang>] \
  [-o <output.pdf>] \
  [-p mymemory|gemini] \
  [--font <path-to-ttf>]
```

### API Endpoints
- `POST /pdf/translate` — Upload PDF and request translation
- `GET /pdf/supported-languages` — List supported languages

### Environment Variables
```
PORT=3000
NODE_ENV=development
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=10485760
GEMINI_API_KEY=
```

## Directory Structure
```
src/
  main.ts                              # HTTP 엔트리포인트
  cli.ts                               # CLI 엔트리포인트
  app.module.ts                        # HTTP 루트 모듈
  cli/
    cli.module.ts                      # CLI 루트 모듈
    commands/
      translate.command.ts             # translate CLI 커맨드
  pdf/
    pdf.module.ts
    pdf.controller.ts
    interfaces/
      pdf-extractor.interface.ts
      pdf-generator.interface.ts
      index.ts
    services/
      pdf-extractor.service.ts         # pdf-parse 기반 추출
      pdf-generator.service.ts         # pdf-lib 기반 생성
    dto/
      translate-pdf.dto.ts
      translation-result.dto.ts
  translation/
    translation.module.ts
    interfaces/
      translation-service.interface.ts
    services/
      mymemory-translation.service.ts
      gemini-translation.service.ts
    factories/
      translation-service.factory.ts
  common/
    enums/
      translation-provider.enum.ts
    exceptions/
      translation.exception.ts
assets/
  fonts/                               # Noto Sans 폰트 번들
```

## Git Conventions
- Branch: `feature/[task-name]`
- Commits: conventional commits (`feat:`, `fix:`, `docs:`, `chore:`)
- Always pass `pnpm run lint` + `pnpm test` before PR

## Exception Handling Rules
- `BadRequestException` — 잘못된 입력 (빈 파일, 잘못된 언어 코드 등)
- `InternalServerErrorException` — 내부 처리 실패 (PDF 파싱 오류 등)
- `TranslationException` — 외부 번역 API 오류 (항상 HttpStatus.BAD_GATEWAY)
- 앱 시작 불가 상황(API 키 누락 등) — `throw new Error(...)` (NestJS 부트스트랩 중단 목적)
- NestJS 기본 예외(`HttpException` 직접 사용)는 금지 — 위 분류 중 하나를 사용할 것

## Parallel Work Rules
- Each agent modifies ONLY files within its ownership scope
- `.env` is user-owned — NO agent may modify it
- When modifying shared interfaces/enums, update this CLAUDE.md accordingly

## Phase Roadmap
- Phase 0: Project structure and boilerplate
- Phase 1: PDF 추출 + PDF 생성 + MyMemory 번역 + CLI 커맨드
- Phase 2: Gemini LLM 어댑터, 용어집, 페이지 범위, 설정파일, 바이링구얼 PDF
