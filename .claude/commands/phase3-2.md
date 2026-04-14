---
description: "Phase 3-2: CLI 리팩터링 — TranslateCommand를 PdfTranslationService에 위임. 전제조건: phase3-1 머지."
---

## Phase 3-2

> **전제조건:** phase3-1 PR이 main에 머지된 상태.

```
Agent(subagent_type="cli-builder", isolation="worktree", prompt="Phase 3-2 작업을 수행하세요.

## 시작 전 필수: 최신 main 동기화
git fetch origin && git checkout main && git pull origin main

Branch: feature/cli-delegate-service

## 배경
phase3-1에서 PdfTranslationService가 생성되었습니다. 현재 translate.command.ts(334줄)의 오케스트레이션 로직을 서비스 호출로 교체하여 thin wrapper로 만듭니다.

1. translate.command.ts 리팩터링:
   - 기존 주입 제거: PDF_EXTRACTOR, PDF_OVERLAY_GENERATOR, PDF_REBUILD_GENERATOR, TranslationServiceFactory
   - 새 주입 추가: @Inject(PDF_TRANSLATION_SERVICE) private readonly pdfTranslationService: IPdfTranslationService
   - run() 메서드 단순화:
     a. CLI 옵션 파싱 + 설정 파일 로드 (기존 유지)
     b. fs.readFile(inputPath) → buffer
     c. pdfTranslationService.translate(buffer, { sourceLang, targetLang, provider, mode, outputPath, fontPath, glossaryPath, pages, onPageTranslated: (idx, total) => printProgress(idx + 1, total, 'pages') })
     d. 결과 출력: 'Translation complete. Output saved to: ...'
   - translatePageWithRetry 메서드 삭제 (서비스 내부로 이동됨)
   - 옵션 파서 메서드들(parseInput, parseTargetLang 등)은 그대로 유지

2. import 정리:
   - IPdfExtractor, IPdfOverlayGenerator 등 미사용 import 제거
   - IPdfTranslationService, PDF_TRANSLATION_SERVICE import 추가

3. CliModule 확인:
   - PdfModule이 PDF_TRANSLATION_SERVICE를 export하므로 추가 import 불필요 (이미 PdfModule import 중)

4. 유닛 테스트 업데이트 (src/cli/commands/translate.command.spec.ts):
   - mock 대상을 PDF_TRANSLATION_SERVICE 하나로 축소
   - happy path: 서비스 호출 + 결과 출력
   - 에러 핸들링: 서비스 예외 → console.error + process.exit(1)
   - 옵션 파싱 테스트는 기존 유지

5. 목표: translate.command.ts가 100줄 이하로 축소

## 자동 교정 + 리뷰 루프
CLAUDE.md의 '자동 교정 + 리뷰 루프 (에이전트 공통)' 섹션을 따른다.")
```
