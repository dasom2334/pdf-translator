---
description: "Phase 0: 프로젝트 보일러플레이트 생성. backend-builder와 infra-builder를 병렬 서브에이전트로 실행."
---

## Phase 0: Boilerplate Generation

## 실행 방법

다음 Agent tool 호출을 **하나의 메시지에서 병렬로** 실행:

1. `Agent(subagent_type="backend-builder", isolation="worktree", prompt="Phase 0 backend-builder 작업을 수행하세요. 아래 지시사항을 따르세요: ...")`
2. `Agent(subagent_type="infra-builder", isolation="worktree", prompt="Phase 0 infra-builder 작업을 수행하세요. 아래 지시사항을 따르세요: ...")`

각 에이전트는 하네스 검증 루프(build → lint → test)를 통과한 후 commit → push → PR 생성.

---

### Sub-agent 1: @backend-builder

**Branch:** `feature/backend-init`

NestJS 프로젝트 초기화 및 어댑터 패턴 구조 설정. 비즈니스 로직 없음 — 인터페이스와 구조만.

1. `npx @nestjs/cli new pdf-translator --package-manager pnpm --strict`로 초기화 (또는 현재 디렉토리에 수동 구성)
2. 의존성 추가:
   - Runtime: `nest-commander`, `pdf-lib`, `@pdf-lib/fontkit`, `pdfjs-dist`, `class-validator`, `class-transformer`, `@nestjs/config`
   - Dev: 기본 NestJS dev deps (`@nestjs/testing`, `jest`, `ts-jest`, `supertest`, `typescript`, `eslint`, `prettier` 등)
3. 디렉토리 구조 생성 (CLAUDE.md Directory Structure 참조):
   - `src/pdf/` — interfaces (TextBlock, IPdfExtractor + PDF_EXTRACTOR token, IPdfOverlayGenerator + PDF_OVERLAY_GENERATOR token, IPdfRebuildGenerator + PDF_REBUILD_GENERATOR token), services (stub), dto (stub), controller (stub, Phase 3+), module
   - `src/translation/` — interfaces (ITranslationService), services (MyMemory stub, Gemini stub), factories (stub), module
   - `src/common/` — enums (TranslationProvider, OutputMode), exceptions (TranslationException)
   - `src/cli/` — cli.module, commands/translate.command (stub)
   - `src/cli.ts` — CLI 엔트리포인트 (`CommandFactory.run(CliModule)`)
4. 모든 인터페이스/enum은 CLAUDE.md Shared Contracts 그대로 구현:
   - **TextBlock**: text, translatedText?, page, x, y, width, height, fontSize, fontName
   - **OutputMode**: OVERLAY, REBUILD
   - **IPdfExtractor**: extractBlocks(), extractBlocksByPages()
   - **IPdfOverlayGenerator**: overlay()
   - **IPdfRebuildGenerator**: rebuild()
5. stub 메서드: `throw new NotImplementedException('Phase 1')`
6. 모듈 와이어링:
   - AppModule → ConfigModule.forRoot({ isGlobal: true }), PdfModule, TranslationModule
   - CliModule → ConfigModule.forRoot({ isGlobal: true }), PdfModule, TranslationModule
   - PdfModule → PDF_EXTRACTOR, PDF_OVERLAY_GENERATOR, PDF_REBUILD_GENERATOR 토큰 provide/export
   - TranslationModule → Factory + 서비스들 provide/export
7. main.ts: `ValidationPipe({ transform: true })` (향후 HTTP API 확장용)
8. cli.ts: `CommandFactory.run(CliModule, ['log', 'warn', 'error'])`
9. package.json scripts 추가: `"cli": "npx ts-node -r tsconfig-paths/register src/cli.ts"`
10. `.spec.ts` 작성 — 모든 모듈/서비스/컨트롤러에 DI resolve 확인 테스트
11. 하네스 검증 루프: `pnpm build` + `pnpm lint` + `pnpm test` 통과 확인
12. Commit, push, PR 생성

---

### Sub-agent 2: @infra-builder

**Branch:** `feature/infra-setup`

Docker, CI/CD, 문서, 환경설정. src/ 절대 건드리지 않음.

1. `mise.toml` — Node 22 LTS, pnpm 9
2. `.gitignore` — node_modules, dist, .env, coverage, uploads, .claude/worktrees/
3. `.env.example` — CLAUDE.md Environment Variables 참조 (모든 키에 빈 값, 설명 주석)
4. `docker/Dockerfile` — Node 22-alpine, multi-stage build (builder → production)
5. `docker/docker-compose.yml` — dev mode, volume mount, hot-reload, port 3000
6. `docker/.dockerignore` — node_modules, dist, .git, .env, coverage, uploads
7. `.github/workflows/ci.yml` — pnpm 9, Node 22, steps: pnpm install → lint → test → build, triggers: push/PR to main
8. `README.md` — 프로젝트 소개, CLI 사용법 (--mode overlay|rebuild 포함), Docker 사용법, 레이어별 Phase 로드맵
9. `docs/architecture.md` — Mermaid 다이어그램 (모듈 의존성 그래프, TextBlock 데이터 흐름, overlay/rebuild 분기, 어댑터 패턴 설명), 환경변수 레퍼런스 테이블
10. Commit, push, PR 생성

---

## Done Criteria
- 양쪽 PR 생성 완료
- backend-builder: `pnpm build` + `pnpm lint` + `pnpm test` 통과
- 파일 소유권 겹침 없음

## 실패 시 대응
- 동일 에러 3회 반복 → 에이전트 중단, 사용자에게 에스컬레이션
- PR 생성 실패 → 브랜치 push 확인 후 수동 `gh pr create`
- 파일 소유권 충돌 발견 → 해당 에이전트 중단, 사용자에게 보고
