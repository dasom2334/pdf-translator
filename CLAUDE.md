# PDF Translator — Project Rules

## Overview
CLI backend that translates PDF files via adapter pattern.
- NestJS 11 (Node 22 LTS, pnpm 9, managed by mise.toml)
- No frontend. CLI usage only (curl/Postman).
- Swappable translation services: DeepL, Google, LLM

## Shared Contracts

### TranslationProvider enum
```typescript
export enum TranslationProvider {
  DEEPL = 'deepl',
  GOOGLE = 'google',
  LLM = 'llm',
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

### API Endpoints
- `POST /pdf/translate` — Upload PDF and request translation
- `GET /pdf/supported-languages` — List supported languages

### Environment Variables
```
PORT=3000
NODE_ENV=development
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=10485760
DEEPL_API_KEY=
GOOGLE_TRANSLATE_API_KEY=
GITHUB_TOKEN=
GITHUB_REPO=
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
- Phase 1: PDF text extraction + DeepL adapter implementation
- Phase 2: PDF regeneration + Google/LLM adapters
- Phase 3: Error handling, batch processing, hardening