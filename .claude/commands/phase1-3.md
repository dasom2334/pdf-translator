---
description: "Phase 1-3: CLI 커맨드(C-1+C-2). 전제조건: phase1-2 머지."
---

## Phase 1-3

> **전제조건:** phase1-2 PR이 main에 머지된 상태.

```
Agent(subagent_type="cli-builder", isolation="worktree", prompt="C-1 + C-2 작업을 수행하세요.

## 시작 전 필수: 최신 main 동기화
```bash
git fetch origin && git checkout main && git pull origin main
git checkout -b feature/cli-translate
```
기존 브랜치가 있어도 절대 재사용하지 말고 반드시 위 순서대로 새 브랜치를 생성하세요.

Branch: feature/cli-translate

TranslateCommand 구현 (src/cli/commands/translate.command.ts):
옵션:
- -i, --input <path> (필수) — 입력 PDF
- -o, --output <path> — 출력 PDF (기본: <input>_<targetLang>.pdf)
- -t, --target-lang <lang> (필수)
- -s, --source-lang <lang>
- -p, --provider <provider> (기본: mymemory)
- --mode overlay|rebuild (기본: overlay)
- --font <path>

오케스트레이션 흐름:
1. fs.readFile(inputPath) → Buffer
2. pdfExtractor.extractBlocksByPages(buffer) → TextBlock[][]
3. 전체 TextBlock을 flat하게 모아 texts 배열 추출
4. translationService.translateBatch(texts, sourceLang, targetLang) → string[]
5. 원래 순서에 1:1 매핑 → block.translatedText = result
6. --mode에 따라:
   - overlay: pdfOverlayGenerator.overlay(buffer, flatBlocks, outputPath, { fontPath })
   - rebuild: 미구현 → '지원 예정' 에러 메시지 출력 후 process.exit(1)
7. 성공 메시지 출력

에러 핸들링: try/catch → 유저 친화적 메시지 + process.exit(1)

cli.ts: CommandFactory.run(CliModule, ['log', 'warn', 'error'])
package.json scripts: \"cli\": \"npx ts-node -r tsconfig-paths/register src/cli.ts\"
유닛 테스트 + E2E 테스트 (test/app.e2e-spec.ts)

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
