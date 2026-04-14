---
description: "Phase 5-2: OCR을 추출 파이프라인에 통합. 전제조건: phase5-1 머지."
---

## Phase 5-2

> **전제조건:** phase5-1 PR이 main에 머지된 상태.

```
Agent(subagent_type="pdf-builder", isolation="worktree", prompt="Phase 5-2 작업을 수행하세요.

## 시작 전 필수: 최신 main 동기화
git fetch origin && git checkout main && git pull origin main

Branch: feature/ocr-extraction

## 배경
phase5-1에서 만든 OCR 어댑터를 PdfExtractorService에 통합하여, 텍스트 레이어 없는 스캔 PDF를 자동 감지하고 OCR로 추출합니다.

1. PdfExtractorService 수정 (src/pdf/services/pdf-extractor.service.ts):
   - OCR_ENGINE을 @Optional() + @Inject로 주입
   - extractBlocksByPages()에 options 파라미터 추가:
     extractBlocksByPages(fileBuffer: Buffer, pageRange?: string, options?: { ocr?: boolean; ocrLang?: string }): Promise<TextBlock[][]>
   - OCR 감지 로직 (ocr=true일 때):
     a. 기존 pdfjs-dist로 페이지별 텍스트 아이템 추출 시도
     b. 특정 페이지의 텍스트 아이템이 0개이면 → OCR 후보로 마킹
     c. OCR 후보 페이지: renderPdfPages()로 이미지 렌더링 → ocrEngine.recognize(imageBuffer, ocrLang) 호출
     d. OCR 결과의 TextBlock[]을 해당 페이지 결과로 사용
   - ocr=false이면 기존 동작 유지 (OCR 건너뜀)

2. IPdfExtractor 인터페이스 확장 검토:
   - extractBlocksByPages의 시그니처가 변경되므로 인터페이스도 업데이트
   - 기존: extractBlocksByPages(fileBuffer: Buffer, pageRange?: string): Promise<TextBlock[][]>
   - 변경: extractBlocksByPages(fileBuffer: Buffer, pageRange?: string, options?: ExtractOptions): Promise<TextBlock[][]>
   - ExtractOptions: { ocr?: boolean; ocrLang?: string }
   - src/pdf/interfaces/pdf-extractor.interface.ts 업데이트

3. PdfTranslationService 연동:
   - TranslateOptions에 ocr?: boolean, ocrLang?: string 추가
   - translate()에서 extractBlocksByPages 호출 시 options 전달

4. CLAUDE.md 업데이트:
   - IPdfExtractor 시그니처 변경 반영
   - TranslateOptions에 ocr, ocrLang 추가

5. 유닛 테스트:
   - 텍스트 있는 PDF → OCR 호출 안 됨
   - 텍스트 없는 페이지 + ocr=true → OCR 엔진 호출 확인
   - ocr=false → OCR 건너뜀 (텍스트 없어도)
   - OCR 결과가 TextBlock[][] 형태로 정상 반환

## 자동 교정 + 리뷰 루프
CLAUDE.md의 '자동 교정 + 리뷰 루프 (에이전트 공통)' 섹션을 따른다.")
```
