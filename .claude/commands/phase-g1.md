---
description: "G-1: overlay 모드 구현 (원본 PDF 위 텍스트 치환). pdf-builder 단독 실행."
---

## G-1: overlay 모드 구현

> **전제조건:** E-1 PR이 main에 머지된 상태.

pdf-builder 에이전트를 실행하여 G-1 + G-2 작업을 수행한다.

```
Agent(subagent_type="pdf-builder", isolation="worktree", prompt="G-1 + G-2 작업을 수행하세요.

Branch: feature/pdf-generators

1. PdfOverlayGeneratorService 구현 (G-1):
   - pdf-lib로 원본 PDF 로드
   - 각 TextBlock 영역을 화이트박스로 덮어 기존 텍스트 가리기
   - 같은 좌표에 block.translatedText 렌더링
   - CJK 폰트 임베딩 (fontkit)
   - POC 제약: 흰 배경 PDF만 정상 동작
   - DI: { provide: PDF_OVERLAY_GENERATOR, useExisting: PdfOverlayGeneratorService }

2. 텍스트 오버플로 처리 (G-2):
   - translatedText가 원본 width 초과 시 fontSize 자동 축소
   - 최소 fontSize 이하로도 넘치면 말줄임(...) 처리

3. 유닛 테스트

하네스 루프: pnpm build → pnpm lint → pnpm test 통과 후 commit → push → PR 생성.")
```
