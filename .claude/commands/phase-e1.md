---
description: "E-1: 위치 포함 텍스트 블록 추출 (pdfjs-dist → TextBlock[]). pdf-builder 단독 실행."
---

## E-1: 위치 포함 텍스트 블록 추출

pdf-builder 에이전트를 실행하여 E-1 작업만 수행한다.

```
Agent(subagent_type="pdf-builder", isolation="worktree", prompt="E-1 작업만 수행하세요.

Branch: feature/pdf-extractor

PdfExtractorService를 구현하세요:
- pdfjs-dist로 PDF에서 위치 포함 텍스트 블록 추출
- extractBlocks(fileBuffer) → TextBlock[]
- extractBlocksByPages(fileBuffer, pageRange?) → TextBlock[][]
- 각 TextBlock: text, page, x, y, width, height, fontSize, fontName
- PDF magic bytes 검증 (0x25 0x50 0x44 0x46)
- 에러: BadRequestException (빈 파일), InternalServerErrorException (파싱 실패)
- DI: { provide: PDF_EXTRACTOR, useExisting: PdfExtractorService }
- 유닛 테스트: valid PDF → TextBlock[], empty → error, non-PDF → error
- assets/fonts/에 Noto Sans 폰트 배치

하네스 루프: pnpm build → pnpm lint → pnpm test 통과 후 commit → push → PR 생성.")
```
