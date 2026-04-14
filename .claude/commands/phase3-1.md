---
description: "Phase 3-1: PdfTranslationService 생성 + 데드코드 제거. 전제조건: phase2-2 머지."
---

## Phase 3-1

> **전제조건:** phase2-2 PR이 main에 머지된 상태.

```
Agent(subagent_type="pdf-builder", isolation="worktree", prompt="Phase 3-1 작업을 수행하세요.

## 시작 전 필수: 최신 main 동기화
git fetch origin && git checkout main && git pull origin main

Branch: feature/pdf-translation-service

## 배경
현재 translate.command.ts(334줄)에 파이프라인 로직(extract → translate → map → generate)이 모두 들어있어 HTTP API 재사용이 불가합니다. 이 로직을 PdfTranslationService로 분리합니다.

1. 인터페이스 정의 (src/pdf/interfaces/pdf-translation-service.interface.ts):
   - IPdfTranslationService, TranslateOptions, TranslateResult, PDF_TRANSLATION_SERVICE 토큰
   - src/pdf/interfaces/index.ts에서 re-export
   - TranslateOptions: sourceLang, targetLang, provider(TranslationProvider), mode(OutputMode), outputPath, fontPath?, glossaryPath?, pages?, onPageTranslated?(pageIdx, totalPages) => void
   - TranslateResult: outputPath, pageCount, blockCount
   - IPdfTranslationService: translate(fileBuffer: Buffer, options: TranslateOptions): Promise<TranslateResult>

2. PdfTranslationService 구현 (src/pdf/services/pdf-translation.service.ts):
   - @Injectable(), IPdfTranslationService 구현
   - 주입: PDF_EXTRACTOR(IPdfExtractor), PDF_OVERLAY_GENERATOR(IPdfOverlayGenerator), PDF_REBUILD_GENERATOR(IPdfRebuildGenerator), TranslationServiceFactory
   - translate() 흐름:
     a. extractBlocksByPages(fileBuffer, options.pages) → TextBlock[][]
     b. 페이지별 번역 (mapWithConcurrency 사용, concurrency=3):
        - TranslationServiceFactory.getService(provider) → translateBatch(texts, sourceLang, targetLang, { glossaryPath })
        - 페이지당 MAX_RETRY=3 재시도 (기존 translatePageWithRetry 로직 이전)
        - onPageTranslated 콜백 호출
     c. 번역 결과를 flatBlocks에 1:1 매핑 (block.translatedText = translated[i])
     d. mode에 따라 overlay/rebuild 호출
     e. TranslateResult 반환
   - mapWithConcurrency는 src/common/utils/concurrency.ts에서 import

3. 데드코드 제거:
   - src/pdf/dto/translate-pdf.dto.ts 삭제
   - src/pdf/dto/translation-result.dto.ts 삭제
   - src/pdf/dto/ 디렉토리가 비면 삭제

4. PdfModule 등록:
   - providers에 PdfTranslationService 추가
   - { provide: PDF_TRANSLATION_SERVICE, useExisting: PdfTranslationService }
   - exports에 PDF_TRANSLATION_SERVICE 추가
   - imports에 TranslationModule 추가 (TranslationServiceFactory 주입을 위해)

5. CLAUDE.md 업데이트:
   - Shared Contracts에 IPdfTranslationService, TranslateOptions, TranslateResult, PDF_TRANSLATION_SERVICE 추가
   - Phase 커맨드 테이블에 phase3-1 ~ phase8-2 추가

6. 유닛 테스트 (src/pdf/services/pdf-translation.service.spec.ts):
   - 의존성 전부 mock
   - happy path: extract → translate → overlay/rebuild → TranslateResult 반환
   - rebuild 모드 테스트
   - 페이지 번역 실패 시 재시도 확인
   - onPageTranslated 콜백 호출 확인
   - 빈 블록 → 에러 처리

## 자동 교정 + 리뷰 루프
CLAUDE.md의 '자동 교정 + 리뷰 루프 (에이전트 공통)' 섹션을 따른다.")
```
