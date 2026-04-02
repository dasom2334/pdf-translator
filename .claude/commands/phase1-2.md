---
description: "Phase 1-2: overlay PDF 생성(G-1+G-2). 전제조건: phase1-1 머지."
---

## Phase 1-2

> **전제조건:** phase1-1 PR이 main에 머지된 상태.

```
Agent(subagent_type="pdf-builder", isolation="worktree", prompt="G-1 + G-2 작업을 수행하세요.

Branch: feature/pdf-overlay

1. PdfOverlayGeneratorService 구현 (src/pdf/services/pdf-overlay-generator.service.ts):
   - pdf-lib로 원본 PDF 로드
   - 각 TextBlock 영역을 화이트박스로 덮어 기존 텍스트 가리기
   - 같은 좌표에 block.translatedText 렌더링 (번역 폰트 적용)
   - CJK 폰트 임베딩 (fontkit, assets/fonts/ 번들 폰트 기본값, options.fontPath로 오버라이드)
   - POC 제약: 흰 배경 PDF만 정상 동작 (G-5에서 해결 예정)
   - DI: { provide: PDF_OVERLAY_GENERATOR, useExisting: PdfOverlayGeneratorService }

2. 텍스트 오버플로 처리 (G-2, PdfOverlayGeneratorService 내부):
   - block.translatedText가 원본 width 초과 시 fontSize 자동 축소
   - 최소 fontSize 이하로도 넘치면 말줄임(...) 처리

3. 유닛 테스트 (happy path + 오버플로 케이스)

하네스 루프: pnpm build → pnpm lint → pnpm test 통과 후 commit → push → PR 생성.")
```
