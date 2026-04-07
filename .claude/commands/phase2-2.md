---
description: "Phase 2-2: CLI 고도화(C-3+C-4+C-5). 전제조건: phase2-1 머지."
---

## Phase 2-2

> **전제조건:** phase2-1 PR이 main에 머지된 상태.

```
Agent(subagent_type="cli-builder", isolation="worktree", prompt="C-3 + C-4 + C-5 작업을 수행하세요.

## 시작 전 필수: 최신 main 동기화
git fetch origin && git checkout main && git pull origin main

Branch: feature/cli-enhanced

1. 페이지 범위 (C-3):
   - --pages 1-5,10 형식 지원
   - 파싱: '1-5,10,15-20' → [1,2,3,4,5,10,15,16,17,18,19,20]
   - extractBlocksByPages(buffer, pageRange) 전달

2. 설정 파일 (C-4):
   - .pdf-translator.yml 자동 탐색 (프로젝트 루트 → 홈 디렉토리)
   - 설정 항목: provider, sourceLang, targetLang, fontPath, glossaryPath, mode
   - 우선순위: CLI 옵션 > 설정 파일 > 기본값

3. 진행률 표시 (C-5):
   - 페이지별 진행률 바: [===>    ] 3/10 pages
   - 번역 API 호출 실패 시 재시도 횟수 출력

4. rebuild 모드 연동: --mode rebuild 시 pdfRebuildGenerator.rebuild() 호출
5. 용어집 연동: --glossary <file> 로딩 → translateBatch()에 glossaryPath 전달

6. 유닛 테스트

## 자동 교정 + 리뷰 루프
다음을 APPROVE가 날 때까지 반복하세요:
1. pnpm build → pnpm lint → pnpm test 통과 확인 (실패 시 수정 반복)
2. git commit → push (최초 1회는 PR 생성, 이후에는 push만)
3. Agent(subagent_type="code-reviewer")로 PR 리뷰 요청 (리뷰어가 🔍 문제 발견 코멘트 게시)
4. 판정이 REQUEST_CHANGES면:
   a. 이슈 수정
   b. PR에 ✅ 수정 완료 코멘트 게시
   c. 1번으로 돌아가기
5. 판정이 APPROVE면: 완료 보고 후 종료")
```
