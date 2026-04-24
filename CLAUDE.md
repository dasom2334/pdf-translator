# PDF Translator

CLI tool: extract text with position from PDF → translate → place back at original coordinates.  
Stack: NestJS 11, Node 22 LTS, pnpm 9, nest-commander, mise.toml.

## Commands

```bash
pnpm build      # TypeScript compile
pnpm lint       # ESLint
pnpm test       # Jest
pnpm run cli -- translate -i input.pdf -t ko   # run CLI
```

## CLI Usage

```bash
pnpm run cli -- translate \
  -i <input.pdf> \
  -t <target-lang> \
  [-s <source-lang>] \
  [-o <output.pdf>] \
  [-p mymemory|gemini|local] \
  [--mode overlay|rebuild] \
  [--font <path-to-ttf>] \
  [--pages 1-5,10] \
  [--local-model <path-to-gguf>]
```

## Environment Variables

```
GEMINI_API_KEY=
MYMEMORY_EMAIL=        # optional — raises daily limit 1,000→10,000 words, bypasses 403
LOCAL_LLM_MODEL_PATH=  # optional — default: assets/models/translateGemma.gguf
```

Never edit `.env` — it is user-owned.

## Exception Rules

Use only these exception types — never `HttpException` directly:

| Situation | Exception |
|-----------|-----------|
| Bad input (empty file, invalid lang code) | `BadRequestException` |
| Internal failure (PDF parse error) | `InternalServerErrorException` |
| External translation API failure | `TranslationException` (always `BAD_GATEWAY`) |
| Fatal startup (missing API key) | `throw new Error(...)` — crashes bootstrap intentionally |

## Key Design Contracts

- `TextBlock` is the shared data shape between PDF extraction and translation; `translatedText` is filled by the CLI orchestrator after translation.
- DI tokens: `PDF_EXTRACTOR`, `PDF_OVERLAY_GENERATOR`, `PDF_REBUILD_GENERATOR` (Symbols in `src/pdf/interfaces/index.ts`).
- Two PDF output strategies: `overlay` (draw over original) and `rebuild` (new PDF from scratch).
- Translation provider is swappable via adapter pattern; factory in `src/translation/factories/`.

## Git & PR Rules

- Branch: `feature/<task-name>`
- Commits: conventional commits (`feat:`, `fix:`, `docs:`, `chore:`)
- One concern per branch — never mix unrelated changes in one PR.
- **Do not merge PRs** — provide the PR URL and let the human merge. Exception: user explicitly says "머지해줘".

## Agent Review Loop

After implementing, repeat until `APPROVE`:

1. `pnpm build` → `pnpm lint` → `pnpm test` — fix and repeat on failure.
2. `git commit` → `git push` (first iteration: `gh pr create`; subsequent: push only).
3. Spawn `code-reviewer` subagent with the PR for review.
4. On `REQUEST_CHANGES`:
   a. Fix issues.
   b. Re-run `pnpm build` → `pnpm lint` → `pnpm test` — **never commit without passing**.
   c. `git commit` → `git push`.
   d. Post PR comment:
      ```
      ✅ 수정 완료

      **논의 주체**: 코드리뷰어 ↔ 에이전트
      **목표**: 무엇을 해결하려 했는가
      **근거**: 왜 문제였는가 (오류 메시지, 재현 조건 등)
      **변경**: 무엇을 어떻게 바꿨는가
      **이유**: 왜 이 접근을 선택했는가
      ```
   e. Return to step 3.
5. On `APPROVE`: report done and stop.

## Parallel Agent Rules

- Each agent owns only its designated files (see `AGENTS.md`).
- Update this `CLAUDE.md` whenever shared interfaces or enums change.

## Phase Command Order

| Command | Work | Prerequisite |
|---------|------|--------------|
| `/phase0` | backend-builder + infra-builder (parallel) | — |
| `/phase1-1` | pdf-builder(E-1) + translation-builder(T-1+T-2) (parallel) | phase0 merged |
| `/phase1-2` | pdf-builder(G-1+G-2) | phase1-1 merged |
| `/phase1-3` | cli-builder(C-1+C-2) | phase1-2 merged |
| `/phase2-1` | pdf-builder(E-2+G-3+G-5) + translation-builder(T-3+T-4) (parallel) | phase1-3 merged |
| `/phase2-2` | cli-builder(C-3+C-4+C-5) | phase2-1 merged |
