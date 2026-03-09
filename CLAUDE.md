# PDF Translator — Project Rules

## Overview
CLI backend that translates PDF files via adapter pattern.
- NestJS (Node 18.18.0, managed by mise.toml)
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
- Always pass `npm run lint` + `npm test` before PR

## Parallel Work Rules
- Each agent modifies ONLY files within its ownership scope
- `.env` is user-owned — NO agent may modify it
- When modifying shared interfaces/enums, update this CLAUDE.md accordingly

## Phase Roadmap
- Phase 0: Project structure and boilerplate
- Phase 1: PDF text extraction + DeepL adapter implementation
- Phase 2: PDF regeneration + Google/LLM adapters
- Phase 3: Error handling, batch processing, hardening