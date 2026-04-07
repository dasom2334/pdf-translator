---
description: "Phase 1-2: overlay PDF 생성(G-1+G-2). 전제조건: phase1-1 머지."
---

## Phase 1-2

> **전제조건:** phase1-1 PR이 main에 머지된 상태.

```
Agent(subagent_type="pdf-builder", isolation="worktree", prompt="G-1 + G-2 작업을 수행하세요.

## 시작 전 필수: 최신 main 동기화
```bash
git fetch origin && git checkout main && git pull origin main
git checkout -b feature/pdf-overlay
```
기존 브랜치가 있어도 절대 재사용하지 말고 반드시 위 순서대로 새 브랜치를 생성하세요.

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

## 자동 교정 + 리뷰 루프
다음을 APPROVE가 날 때까지 반복하세요:
1. pnpm build → pnpm lint → pnpm test 통과 확인 (실패 시 수정 반복)
2. git commit → push (최초 1회는 PR 생성, 이후에는 push만)
3. Agent(subagent_type="code-reviewer")로 PR 리뷰 요청 (리뷰어가 🔍 문제 발견 코멘트 게시)
4. 판정이 REQUEST_CHANGES면:
   a. 이슈 수정
   b. PR에 ✅ 수정 완료 코멘트 게시 — 아래 형식 준수:
      ```
      ## ✅ 수정 완료
      **논의 주체:** code-reviewer ↔ {에이전트 역할}
      ### 수정 내용
      {항목별 — 무엇을, 어떻게, 왜 그렇게 수정했는지}
      ### 적용 여부
      {✅ 적용 완료 / ⏭️ 향후 과제로 이관 — 이관 시 이유 명시}
      ```
   c. 1번으로 돌아가기
5. 판정이 APPROVE면: worktree 정리 후 종료")
```
