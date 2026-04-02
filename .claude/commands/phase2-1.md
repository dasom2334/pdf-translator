---
description: "Phase 2-1: PDF 고도화(E-2+G-3+G-5) + 번역 고도화(T-3+T-4) 병렬 실행. 전제조건: phase1-3 머지."
---

## Phase 2-1 (병렬)

> **전제조건:** phase1-3 PR이 main에 머지된 상태.

하나의 메시지에서 두 에이전트를 **동시에** 실행:

```
Agent(subagent_type="pdf-builder", isolation="worktree", prompt="E-2 + G-3 + G-5 작업을 수행하세요.

Branch: feature/pdf-enhanced

1. 추출 품질 개선 (E-2, PdfExtractorService 수정):
   - 좌표 기반 읽기 순서 재정렬 (Y좌표 → X좌표 순)
   - 헤더/푸터 자동 감지 및 제거 (페이지 상단/하단 반복 패턴)
   - 과도한 공백·특수문자 정제
   - 인접 TextBlock 문단 병합

2. rebuild 모드 구현 (G-3, src/pdf/services/pdf-rebuild-generator.service.ts):
   - pdf-lib로 빈 페이지 생성 (원본과 동일한 크기)
   - 원본 PDF에서 이미지·벡터 그래픽 복사
   - TextBlock 좌표에 block.translatedText 배치 (번역 폰트 적용)
   - DI: { provide: PDF_REBUILD_GENERATOR, useExisting: PdfRebuildGeneratorService }

3. 콘텐츠 스트림 텍스트 제거 (G-5, PdfOverlayGeneratorService 옵션으로 통합):
   - PDF 콘텐츠 스트림 파싱하여 텍스트 명령어(BT...ET)만 삭제
   - 화이트박스 대신 원본 텍스트 실제 제거 → 배경색·이미지 위 텍스트 문제 해결

4. 유닛 테스트

하네스 루프: pnpm build → pnpm lint → pnpm test 통과 후 commit → push → PR 생성.")

Agent(subagent_type="translation-builder", isolation="worktree", prompt="T-3 + T-4 작업을 수행하세요.

Branch: feature/translation-enhanced

1. 번역 품질 개선 (T-3, 기존 서비스 수정):
   - 청크 분할 시 앞뒤 문장 오버랩으로 문맥 보존
   - 번역 결과 후처리 (불필요한 공백, 태그 제거)

2. 용어집 (T-4):
   - 고유명사·브랜드명 번역 방지 목록
   - YAML/JSON 파일로 관리
   - 청크 전달 전 플레이스홀더로 치환, 번역 후 복원
   - translateBatch()에 glossaryPath?: string 옵션 추가

3. 유닛 테스트

하네스 루프: pnpm build → pnpm lint → pnpm test 통과 후 commit → push → PR 생성.")
```
