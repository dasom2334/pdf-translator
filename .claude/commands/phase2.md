---
description: "Phase 2: 고도화. E-2 + G-3 + G-5 → T-3 + T-4 → C-3 + C-4 + C-5. Phase 1 머지 후 실행."
---

## Phase 2: Enhancement

> **전제조건:** Phase 1 PR이 main에 머지된 상태.
> **레이어 페이즈 매핑:** E-2 + G-3 + G-5 (병렬) → T-3 + T-4 (병렬) → C-3 + C-4 + C-5 (순차)

## 실행 방법

**Step 1 — 병렬:** 하나의 메시지에서 동시 실행:
1. `Agent(subagent_type="pdf-builder", isolation="worktree", prompt="Phase 2 E-2 + G-3 + G-5 작업: ...")`
2. `Agent(subagent_type="translation-builder", isolation="worktree", prompt="Phase 2 T-3 + T-4 작업: ...")`

**Step 2 — 순차:** Step 1 PR 머지 후:
3. `Agent(subagent_type="cli-builder", isolation="worktree", prompt="Phase 2 C-3 + C-4 + C-5 작업: ...")`

---

### Step 1-A: @pdf-builder — E-2 + G-3 + G-5 (병렬)

**Branch:** `feature/pdf-enhanced`
**소유 파일:** `src/pdf/**`

1. **추출 품질 개선 (E-2)**:
   - 좌표 기반 읽기 순서 재정렬 (Y좌표 → X좌표 순)
   - 헤더/푸터 자동 감지 및 제거 (페이지 상단/하단 반복 패턴)
   - 과도한 공백·특수문자 정제
   - 문단 경계 감지 및 인접 TextBlock 병합

2. **rebuild 모드 구현 (G-3)** (`src/pdf/services/pdf-rebuild-generator.service.ts`):
   - `canvas` (node-canvas) 의존성 필요 — 커밋 메시지에 `pnpm add canvas` 명시
   - 빈 캔버스 생성 (원본과 동일한 페이지 크기)
   - 원본 PDF에서 이미지·벡터 그래픽 복사
   - TextBlock 좌표에 block.translatedText 배치 (번역 폰트 적용)

3. **콘텐츠 스트림 텍스트 제거 (G-5)**:
   - PDF 콘텐츠 스트림 파싱하여 텍스트 명령어(BT...ET)만 삭제
   - 화이트박스 대신 원본 텍스트 실제 제거
   - 배경색·이미지 위 텍스트 문제 해결
   - PdfOverlayGeneratorService에 옵션으로 통합 가능

4. PdfModule 와이어링:
   - `{ provide: PDF_REBUILD_GENERATOR, useExisting: PdfRebuildGeneratorService }`
   - 토큰 export

5. 유닛 테스트

6. 하네스 검증 루프 통과 후 Commit, push, PR 생성

---

### Step 1-B: @translation-builder — T-3 + T-4 (병렬)

**Branch:** `feature/translation-enhanced`
**소유 파일:** `src/translation/**`, `src/common/**`

1. **번역 품질 개선 (T-3)**:
   - 청크 분할 시 문맥 보존을 위한 앞뒤 문장 오버랩 전략
   - 번역 결과 후처리 (불필요한 공백, 태그 제거)

2. **용어집 (T-4)**:
   - 고유명사·브랜드명 번역 방지 목록
   - YAML/JSON 파일로 관리
   - 청크 전달 전 치환, 번역 후 복원
   - ITranslationService에 glossary 옵션 추가

3. 유닛 테스트

4. 하네스 검증 루프 통과 후 Commit, push, PR 생성

---

### Step 2: @cli-builder — C-3 + C-4 + C-5 (순차)

**Branch:** `feature/cli-enhanced`
**소유 파일:** `src/cli/**`, `src/cli.ts`, `test/**`

> Step 1 PR 머지 후 실행.

1. **페이지 범위 (C-3)**:
   - `--pages 1-5,10` 형식으로 특정 페이지만 번역
   - 범위 파싱: "1-5,10,15-20" → [1,2,3,4,5,10,15,16,17,18,19,20]
   - extractBlocksByPages에 pageRange 전달

2. **설정 파일 (C-4)**:
   - `.pdf-translator.yml` 로딩
   - 프로젝트 루트 및 홈 디렉토리에서 자동 탐색
   - 설정 항목: provider, sourceLang, targetLang, fontPath, glossaryPath, mode
   - CLI 옵션 > 설정 파일 > 기본값 (우선순위)

3. **진행률 표시 (C-5)**:
   - 페이지별 진행률 바 (`[===>    ] 3/10 pages`)
   - 번역 API 호출 실패 시 재시도 횟수 출력

4. rebuild 모드 연동: `--mode rebuild` 시 pdfRebuildGenerator.rebuild() 호출

5. 용어집 연동: `--glossary <file>` 로딩 → 번역 서비스에 전달

6. 유닛 테스트

7. 하네스 검증 루프 통과 후 Commit, push, PR 생성

---

## Done Criteria
- `--mode rebuild` 옵션으로 새 PDF 재생성 확인
- G-5 콘텐츠 스트림 텍스트 제거로 컬러 배경 PDF 정상 동작
- `--pages 1-3` 옵션으로 일부 페이지만 번역
- `--glossary glossary.json` 옵션으로 용어집 적용 번역
- `.pdf-translator.yml` 설정 파일 로딩
- 진행률 바 표시
- 모든 테스트 통과

## 실패 시 대응
- 동일 에러 3회 반복 → 에이전트 중단, 사용자에게 에스컬레이션
- PR 생성 실패 → 브랜치 push 확인 후 수동 `gh pr create`
- 파일 소유권 충돌 발견 → 해당 에이전트 중단, 사용자에게 보고
