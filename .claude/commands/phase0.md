---
description: "Phase 0: Generate project boilerplate. Spawns backend-builder and infra-builder as parallel sub-agents with worktree isolation."
---

## Phase 0: Boilerplate Generation

Run the following two tasks as **parallel sub-agents**.
Each agent works in its own worktree. No file ownership overlap.
Each agent creates its own branch and opens a PR when done.

---

### Sub-agent 1: @backend-builder

**Branch:** `feature/backend-init-boilerplate`

Initialize the NestJS project and set up the adapter pattern structure with empty implementations.
NO business logic — interfaces and structure only.

1. Create NestJS project: `npx @nestjs/cli new pdf-translator --package-manager npm --strict`
2. Create directory structure:
   - `src/pdf/` — pdf.module, pdf.service, pdf.controller, dto/ (TranslatePdfDto, TranslationResultDto)
   - `src/translation/` — translation.module, interfaces/ (ITranslationService), services/ (deepl, google, llm), factories/ (TranslationServiceFactory)
   - `src/common/` — enums/ (TranslationProvider), exceptions/ (TranslationException)
3. Define ITranslationService interface (see CLAUDE.md for contract)
4. All 3 adapter services: `implements ITranslationService`, every method throws `NotImplementedException`
5. TranslationServiceFactory: `getService(provider)` signature only, throws `NotImplementedException`
6. DTOs: TranslatePdfDto (sourceLang, targetLang, provider?), TranslationResultDto (originalText, translatedText, sourceLang, targetLang, provider)
7. Wire modules: AppModule imports PdfModule + TranslationModule, PdfModule imports TranslationModule
8. Create `.spec.ts` for each module/service/controller (DI resolve check only)
9. Verify: `npm run lint` + `npm test` — both must pass
10. Commit, push, and create PR

---

### Sub-agent 2: @infra-builder

**Branch:** `feature/project-setup-boilerplate`

Set up Docker, CI/CD, documentation, and environment config.
Do NOT touch `src/` — it is owned by backend-builder.

1. `docker/Dockerfile` — Node 18.18-alpine, multi-stage build (builder → production)
2. `docker/docker-compose.yml` — dev mode with volume mount, hot-reload, port 3000
3. `docker/.dockerignore` — node_modules, dist, .git, .env, coverage, uploads
4. `.github/workflows/ci.yml` — Node 18.18.0, steps: npm ci → lint → test → build, triggers on push/PR to main
5. `mise.toml` — pin Node 18.18.0
6. `.gitignore` — node_modules, dist, .env, coverage, uploads, .claude/worktrees/
7. `.env.example` — all env var keys with empty values, setup instructions in comments
8. `README.md` — project intro, tech stack, Quick Start (mise install, npm install, curl examples), Docker usage, Phase roadmap
9. `docs/architecture.md` — Mermaid diagrams (module dependency graph, request sequence), adapter pattern explanation, env var reference table
10. Commit, push, and create PR

---

## Done Criteria
- Both PRs created successfully
- backend-builder: `npm run lint` + `npm test` pass
- Zero file ownership overlap between the two agents