# PDF Translator — Project Rules

## Overview
CLI 프로그램: PDF 파일의 텍스트를 위치 정보 포함하여 추출 → 번역 → 원본 좌표에 치환하여 새 PDF로 생성.
- NestJS 11 (Node 22 LTS, pnpm 9, mise.toml)
- CLI: nest-commander (핵심 인터페이스)
- 어댑터 패턴으로 번역 서비스 교체 가능
- overlay / rebuild 두 가지 PDF 생성 전략 지원
- HTTP API는 향후 확장 예정 (Phase 3+)

## Shared Contracts

### TextBlock interface
```typescript
export interface TextBlock {
  text: string;
  translatedText?: string;  // 번역 후 CLI 오케스트레이터가 채움
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  fontName: string;
}
```

### TranslationProvider enum
```typescript
export enum TranslationProvider {
  MYMEMORY = 'mymemory',
  GEMINI = 'gemini',
}
```

### OutputMode enum
```typescript
export enum OutputMode {
  OVERLAY = 'overlay',
  REBUILD = 'rebuild',
}
```

### ITranslationService interface
```typescript
export interface ITranslationService {
  translate(text: string, sourceLang: string, targetLang: string): Promise<string>;
  translateBatch(texts: string[], sourceLang: string, targetLang: string, options?: { glossaryPath?: string }): Promise<string[]>;
  getSupportedLanguages(): Promise<string[]>;
}
```

### IPdfExtractor interface
```typescript
export interface IPdfExtractor {
  extractBlocks(fileBuffer: Buffer): Promise<TextBlock[]>;
  extractBlocksByPages(fileBuffer: Buffer, pageRange?: string): Promise<TextBlock[][]>;
}
```

### IPdfOverlayGenerator interface
```typescript
export interface IPdfOverlayGenerator {
  overlay(originalBuffer: Buffer, blocks: TextBlock[], outputPath: string, options?: PdfGenerateOptions): Promise<void>;
}
```

### IPdfRebuildGenerator interface
```typescript
export interface IPdfRebuildGenerator {
  rebuild(blocks: TextBlock[], outputPath: string, options?: PdfGenerateOptions): Promise<void>;
}
```

### PdfGenerateOptions
```typescript
export interface PdfGenerateOptions {
  fontPath?: string;
}
```

### DI Tokens
```typescript
export const PDF_EXTRACTOR = Symbol('PDF_EXTRACTOR');
export const PDF_OVERLAY_GENERATOR = Symbol('PDF_OVERLAY_GENERATOR');
export const PDF_REBUILD_GENERATOR = Symbol('PDF_REBUILD_GENERATOR');
```

### CLI 사용법
```bash
pnpm run cli -- translate \
  -i <input.pdf> \
  -t <target-lang> \
  [-s <source-lang>] \
  [-o <output.pdf>] \
  [-p mymemory|gemini] \
  [--mode overlay|rebuild] \
  [--font <path-to-ttf>] \
  [--pages 1-5,10]
```

### API Endpoints (Phase 3+ 예정)
- `POST /pdf/translate` — PDF 업로드 및 번역 요청
- `GET /pdf/supported-languages` — 지원 언어 목록

### Environment Variables
```
NODE_ENV=development
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=10485760
GEMINI_API_KEY=
MYMEMORY_EMAIL=          # 선택사항. 설정 시 MyMemory 일일 한도 1,000→10,000 단어로 증가 및 403 우회
# PORT=3000              # 향후 HTTP API 용
```

## Directory Structure
```
src/
  main.ts                              # HTTP 엔트리포인트 (Phase 3+)
  cli.ts                               # CLI 엔트리포인트 (핵심)
  app.module.ts                        # 루트 모듈
  cli/
    cli.module.ts                      # CLI 루트 모듈
    commands/
      translate.command.ts             # translate CLI 커맨드 (오케스트레이터)
  pdf/
    pdf.module.ts
    pdf.controller.ts                  # Phase 3+
    interfaces/
      text-block.interface.ts          # TextBlock 인터페이스
      pdf-extractor.interface.ts       # IPdfExtractor
      pdf-overlay-generator.interface.ts  # IPdfOverlayGenerator
      pdf-rebuild-generator.interface.ts  # IPdfRebuildGenerator
      index.ts
    services/
      pdf-extractor.service.ts         # pdfjs-dist 기반 추출 (TextBlock[] 반환)
      pdf-overlay-generator.service.ts # overlay 모드: 원본 위 텍스트 치환
      pdf-rebuild-generator.service.ts # rebuild 모드: 새 PDF 재생성
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
      output-mode.enum.ts
    exceptions/
      translation.exception.ts
assets/
  fonts/                               # Noto Sans 폰트 번들
```

## Git Conventions
- Branch: `feature/[task-name]`
- Commits: conventional commits (`feat:`, `fix:`, `docs:`, `chore:`)
- Always pass `pnpm run lint` + `pnpm test` before PR
- **작업 내용이 다르면 브랜치를 분리하여 별도 PR로 올린다** — 하나의 브랜치에 관련 없는 변경을 섞지 않는다

## Exception Handling Rules
- `BadRequestException` — 잘못된 입력 (빈 파일, 잘못된 언어 코드 등)
- `InternalServerErrorException` — 내부 처리 실패 (PDF 파싱 오류 등)
- `TranslationException` — 외부 번역 API 오류 (항상 HttpStatus.BAD_GATEWAY)
- 앱 시작 불가 상황(API 키 누락 등) — `throw new Error(...)` (NestJS 부트스트랩 중단 목적)
- NestJS 기본 예외(`HttpException` 직접 사용)는 금지 — 위 분류 중 하나를 사용할 것

## 자동 교정 + 리뷰 루프 (에이전트 공통)

에이전트가 작업을 완료한 뒤 APPROVE가 날 때까지 반복:

1. `pnpm build` → `pnpm lint` → `pnpm test` 통과 확인 (실패 시 수정 반복)
2. `git commit` → `push` (최초 1회는 PR 생성, 이후에는 push만)
3. `Agent(subagent_type="code-reviewer")`로 PR 리뷰 요청
4. 판정이 `REQUEST_CHANGES`면:
   a. 이슈 수정
   b. PR에 아래 형식으로 ✅ 수정 완료 코멘트 게시:
      ```
      ✅ 수정 완료

      **논의 주체**: 코드리뷰어 ↔ 에이전트
      **목표**: 무엇을 해결하려 했는가
      **근거**: 왜 문제였는가 (오류 메시지, 재현 조건 등)
      **변경**: 무엇을 어떻게 바꿨는가
      **이유**: 왜 이 접근을 선택했는가
      ```
   c. 1번으로 돌아가기
5. 판정이 `APPROVE`면: 완료 보고 후 종료

## PR 규칙
- PR 머지는 에이전트가 하지 않는다 — `gh pr merge` 등 머지 명령 실행 금지
- PR 생성 후 URL만 제공하고 머지는 항상 사람이 직접 한다
- 프롬프트에서 명시적으로 "머지해줘" 등 머지를 지시한 경우에만 예외적으로 허용

## 병렬 작업 규칙
- 각 에이전트는 자신의 소유 파일만 수정 (AGENTS.md 참조)
- `.env`는 사용자 소유 — 어떤 에이전트도 수정 금지
- 공유 인터페이스/enum 변경 시 이 CLAUDE.md도 함께 업데이트

## Phase 커맨드 실행 순서
| phase 커맨드 | 내용 | 전제조건 |
|-------------|------|---------|
| `/phase0` | 병렬: backend-builder + infra-builder | — |
| `/phase1-1` | 병렬: pdf-builder(E-1) + translation-builder(T-1+T-2) | phase0 머지 |
| `/phase1-2` | pdf-builder(G-1+G-2) | phase1-1 머지 |
| `/phase1-3` | cli-builder(C-1+C-2) | phase1-2 머지 |
| `/phase2-1` | 병렬: pdf-builder(E-2+G-3+G-5) + translation-builder(T-3+T-4) | phase1-3 머지 |
| `/phase2-2` | cli-builder(C-3+C-4+C-5) | phase2-1 머지 |
