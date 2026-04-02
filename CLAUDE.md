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
  translateBatch(texts: string[], sourceLang: string, targetLang: string): Promise<string[]>;
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

## Exception Handling Rules
- `BadRequestException` — 잘못된 입력 (빈 파일, 잘못된 언어 코드 등)
- `InternalServerErrorException` — 내부 처리 실패 (PDF 파싱 오류 등)
- `TranslationException` — 외부 번역 API 오류 (항상 HttpStatus.BAD_GATEWAY)
- 앱 시작 불가 상황(API 키 누락 등) — `throw new Error(...)` (NestJS 부트스트랩 중단 목적)
- NestJS 기본 예외(`HttpException` 직접 사용)는 금지 — 위 분류 중 하나를 사용할 것

## 병렬 작업 규칙
- 각 에이전트는 자신의 소유 파일만 수정 (AGENTS.md 참조)
- `.env`는 사용자 소유 — 어떤 에이전트도 수정 금지
- 공유 인터페이스/enum 변경 시 이 CLAUDE.md도 함께 업데이트

## 레이어별 Phase 로드맵

### 추출 레이어 (Extraction)
- E-1: 위치 포함 텍스트 블록 추출 (pdfjs-dist → TextBlock[])
- E-2: 추출 품질 개선 (읽기 순서, 헤더/푸터, 문단 병합)
- E-3: 인코딩 대응 (커스텀 폰트, CJK)
- E-4: 복잡한 레이아웃 (다단, 표, 각주)
- E-5: OCR 폴백 (스캔 PDF)

### 생성 레이어 (Generation)
- G-1: overlay 모드 (화이트박스 + 번역 텍스트 치환, 흰 배경 PDF 한정)
- G-2: 텍스트 오버플로 처리 (폰트 축소, 말줄임)
- G-3: rebuild 모드 (새 PDF 재생성)
- G-4: 바이링구얼 PDF
- G-5: 콘텐츠 스트림 텍스트 제거 (배경색 문제 해결)

### 번역 레이어 (Translation)
- T-1: MyMemory 어댑터
- T-2: Gemini 어댑터
- T-3: 번역 품질 개선 (청크 오버랩, 후처리)
- T-4: 용어집 (Glossary)
- T-5: Google Cloud Translation

### CLI 레이어 (CLI)
- C-1: 기본 커맨드 (-i, -t, -o, -p)
- C-2: 모드 및 폰트 옵션 (--mode, --font)
- C-3: 페이지 범위 (--pages)
- C-4: 설정 파일 (.pdf-translator.yml)
- C-5: 진행률 표시

### phase 커맨드 실행 순서
| phase 커맨드 | 내용 | 전제조건 |
|-------------|------|---------|
| `/phase0` | 병렬: backend-builder + infra-builder | — |
| `/phase1-1` | 병렬: pdf-builder(E-1) + translation-builder(T-1+T-2) | phase0 머지 |
| `/phase1-2` | pdf-builder(G-1+G-2) | phase1-1 머지 |
| `/phase1-3` | cli-builder(C-1+C-2) | phase1-2 머지 |
| `/phase2-1` | 병렬: pdf-builder(E-2+G-3+G-5) + translation-builder(T-3+T-4) | phase1-3 머지 |
| `/phase2-2` | cli-builder(C-3+C-4+C-5) | phase2-1 머지 |
