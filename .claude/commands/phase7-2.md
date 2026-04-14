---
description: "Phase 7-2: 블록 병합 통합 + 부분 실패 복구 + rebuild 페이지 크기 개선. 전제조건: phase7-1 머지."
---

## Phase 7-2

> **전제조건:** phase7-1 PR이 main에 머지된 상태.

```
Agent(subagent_type="pdf-builder", isolation="worktree", prompt="Phase 7-2 작업을 수행하세요.

## 시작 전 필수: 최신 main 동기화
git fetch origin && git checkout main && git pull origin main

Branch: feature/translation-quality

## 배경
phase7-1에서 만든 block-merger를 PdfTranslationService에 통합하고, 대용량 PDF의 부분 실패 복구와 rebuild 모드의 페이지 크기 정확도를 개선합니다.

1. PdfTranslationService에 블록 병합 통합 (src/pdf/services/pdf-translation.service.ts):
   - TranslateOptions에 mergeBlocks?: boolean 추가 (기본: true)
   - translate() 파이프라인 변경:
     a. extractBlocksByPages → TextBlock[][] (기존)
     b. mergeBlocks가 true이면:
        - 페이지별 mergeBlocksForTranslation(pageBlocks) → MergedBlockGroup[]
        - 번역 대상: groups.map(g => g.mergedText)
        - 번역 후: splitTranslationToBlocks(groups, translations) → TextBlock[] (translatedText 할당됨)
     c. mergeBlocks가 false이면: 기존 방식 (블록별 번역)
     d. generate (기존)

2. 부분 실패 복구:
   - 페이지별 번역에서 MAX_RETRY 소진 후에도 전체 중단하지 않음
   - 실패한 페이지는 원본 텍스트 유지 (translatedText 미할당)
   - TranslateResult에 failedPages: number[] 필드 추가
   - IPdfTranslationService 인터페이스의 TranslateResult도 업데이트
   - 실패 페이지 정보를 onPageTranslated 콜백과 별도로 보고하거나, 최종 결과에 포함

3. rebuild 모드 페이지 크기 개선:
   - 현재 PdfRebuildGeneratorService는 블록 좌표에서 페이지 크기를 추정 (부정확)
   - IPdfRebuildGenerator.rebuild() 시그니처 확장:
     rebuild(blocks: TextBlock[], outputPath: string, options?: PdfGenerateOptions & { originalBuffer?: Buffer }): Promise<void>
   - originalBuffer가 있으면 pdf-lib로 원본 PDF를 로드하여 실제 페이지 크기(width, height)를 읽음
   - PdfTranslationService에서 rebuild 호출 시 originalBuffer 전달

4. CLAUDE.md 업데이트:
   - TranslateResult에 failedPages 추가
   - TranslateOptions에 mergeBlocks 추가
   - PdfGenerateOptions 또는 rebuild 시그니처 변경 반영

5. 유닛 테스트:
   - 블록 병합 활성화 시 mergeBlocksForTranslation → splitTranslationToBlocks 호출 확인
   - mergeBlocks: false 시 기존 방식 확인
   - 페이지 번역 실패 → failedPages에 포함, 나머지 페이지 정상 처리
   - rebuild에 originalBuffer 전달 시 정확한 페이지 크기 사용

## 자동 교정 + 리뷰 루프
CLAUDE.md의 '자동 교정 + 리뷰 루프 (에이전트 공통)' 섹션을 따른다.")
```
