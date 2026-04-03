---
description: "Phase 1-1: PDF 추출(E-1) + 번역 어댑터(T-1+T-2) 병렬 실행. 전제조건: phase0 머지."
---

## Phase 1-1 (병렬)

> **전제조건:** phase0 PR이 main에 머지된 상태.

하나의 메시지에서 두 에이전트를 **동시에** 실행:

```
Agent(subagent_type="pdf-builder", isolation="worktree", prompt="E-1 작업을 수행하세요.

Branch: feature/pdf-extractor

PdfExtractorService 구현 (src/pdf/services/pdf-extractor.service.ts):
- pdfjs-dist로 PDF에서 위치 포함 텍스트 블록 추출
- extractBlocks(fileBuffer: Buffer) → TextBlock[]
- extractBlocksByPages(fileBuffer: Buffer, pageRange?: string) → TextBlock[][]
- 각 TextBlock: text, page, x, y, width, height, fontSize, fontName
- PDF magic bytes 검증 (0x25 0x50 0x44 0x46)
- 에러: BadRequestException (빈 파일/비PDF), InternalServerErrorException (파싱 실패)
- DI: { provide: PDF_EXTRACTOR, useExisting: PdfExtractorService }
- assets/fonts/에 Noto Sans 폰트 배치 (NotoSansCJKkr-Regular.otf)
- 유닛 테스트: valid PDF → TextBlock[], empty → error, non-PDF → error

하네스 루프: pnpm build → pnpm lint → pnpm test 통과 후 commit → push → PR 생성.")

Agent(subagent_type="translation-builder", isolation="worktree", prompt="T-1 + T-2 작업을 수행하세요.

Branch: feature/translation-adapters

1. MyMemoryTranslationService 구현 (src/translation/services/mymemory-translation.service.ts):
   - MyMemory API (https://api.mymemory.translated.net/get) 사용
   - API 키 불필요 (무료 tier: 일 5000자)
   - translate(): HTTP GET (?q=text&langpair={sourceLang}|{targetLang})
   - translateBatch(): 문단 단위 청크 분할 (최대 500자), 청크 병렬 처리
   - getSupportedLanguages(): 지원 언어 목록 반환
   - 에러: BadRequestException (빈 텍스트), TranslationException(BAD_GATEWAY) (API 오류)

2. GeminiTranslationService 구현 (src/translation/services/gemini-translation.service.ts):
   - @google/generative-ai SDK 연동
   - GEMINI_API_KEY 환경변수
   - onModuleInit()에서 API 키 검증 → throw new Error(...) (HttpException 금지)
   - translate(): 프롬프트 기반 번역, 청크 최대 4000자
   - translateBatch(): 청크 병렬 처리
   - 분당 요청 제한 대응 (지수 백오프 재시도)
   - 에러: BadRequestException (빈 텍스트), TranslationException(BAD_GATEWAY) (API 오류)

3. TranslationServiceFactory 구현 (src/translation/factories/translation-service.factory.ts):
   - getService(provider: TranslationProvider): ITranslationService
   - MYMEMORY → MyMemoryTranslationService
   - GEMINI → GeminiTranslationService
   - 잘못된 provider → BadRequestException

4. 유닛 테스트 (mock HTTP/SDK 호출)

하네스 루프: pnpm build → pnpm lint → pnpm test 통과 후 commit → push → PR 생성.")
```
