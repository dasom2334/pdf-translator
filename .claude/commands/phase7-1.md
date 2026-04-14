---
description: "Phase 7-1: 인접 블록 병합 유틸리티 — 번역 문맥 보존. 전제조건: phase3-2 머지."
---

## Phase 7-1

> **전제조건:** phase3-2 PR이 main에 머지된 상태.

```
Agent(subagent_type="pdf-builder", isolation="worktree", prompt="Phase 7-1 작업을 수행하세요.

## 시작 전 필수: 최신 main 동기화
git fetch origin && git checkout main && git pull origin main

Branch: feature/block-merger

## 배경
현재 블록 단위 번역은 문장이 여러 블록에 분리될 때 의미가 끊깁니다. 수직으로 인접한 블록을 문단으로 병합하여 번역 API에 전달하면 문맥이 보존됩니다.

1. MergedBlockGroup 인터페이스 (src/pdf/interfaces/text-block.interface.ts에 추가):
   - mergedText: string — 그룹 내 모든 블록의 text를 공백/줄바꿈으로 연결
   - blocks: TextBlock[] — 원본 블록 배열 (순서 보존)
   - page: number

2. src/pdf/utils/block-merger.ts 생성:

   a. mergeBlocksForTranslation(blocks: TextBlock[]): MergedBlockGroup[]
      - 같은 페이지의 블록을 Y 좌표 순으로 정렬
      - 두 블록이 '수직 인접'인 조건: 같은 페이지, Y 간격 ≤ 1.5 × fontSize, X 좌표가 유사 (같은 컬럼)
      - X 유사 판정: 두 블록의 X 좌표 차이 < 블록 width의 50%
      - 인접 블록끼리 그룹화 → MergedBlockGroup
      - 단일 블록도 하나의 그룹으로 반환

   b. splitTranslationToBlocks(groups: MergedBlockGroup[], translations: string[]): TextBlock[]
      - groups[i]에 대응하는 translations[i]를 해당 그룹의 blocks에 분배
      - 분배 기준: 각 블록의 원본 text 글자 수 비율
      - 예: 원본 블록 A(10자) B(20자) → 번역 30자 중 A에 10자, B에 20자
      - 분배 후 각 block.translatedText에 할당
      - 반환: 모든 그룹의 blocks를 flat하게 반환 (원본 순서 유지)

3. CLAUDE.md Shared Contracts에 MergedBlockGroup 추가

4. 유닛 테스트 (src/pdf/utils/block-merger.spec.ts):
   - 같은 라인 블록 → 병합 안 됨 (수평 인접은 이미 extractor에서 처리)
   - 수직 인접 블록 → 하나의 그룹
   - 다른 페이지 블록 → 별도 그룹
   - 다단 컬럼 → X 좌표 차이로 별도 그룹
   - splitTranslationToBlocks 비율 분배 정확성
   - 빈 블록 배열 → 빈 결과
   - 단일 블록 → 그대로 반환

## 자동 교정 + 리뷰 루프
CLAUDE.md의 '자동 교정 + 리뷰 루프 (에이전트 공통)' 섹션을 따른다.")
```
