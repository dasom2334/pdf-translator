---
description: "Phase 1-3: CLI 커맨드(C-1+C-2). 전제조건: phase1-2 머지."
---

## Phase 1-3

> **전제조건:** phase1-2 PR이 main에 머지된 상태.

```
Agent(subagent_type="cli-builder", isolation="worktree", prompt="C-1 + C-2 작업을 수행하세요.

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

하네스 루프: pnpm build → pnpm lint → pnpm test 통과 후 commit → push → PR 생성.")
```
