# 검수 로그

## 대상
- 브랜치: feature/infra-setup
- PR: #22
- 라운드: R1

## 체크리스트 결과

| 항목 | 통과/실패 | 근거 (파일:줄) |
|------|-----------|---------------|
| **스펙 준수: mise.toml** | 통과 | mise.toml:2-3 — `node = "22"`, `pnpm = "9"` 스펙 그대로 충족 |
| **스펙 준수: .gitignore** | 통과 | .gitignore — node_modules, dist, .env, coverage, uploads, .claude/worktrees/ 모두 포함. `.env.local`, `.env.*.local` 추가는 방어적 개선으로 허용 |
| **스펙 준수: .env.example** | 통과 | .env.example:1-12 — NODE_ENV, UPLOAD_DIR, MAX_FILE_SIZE, GEMINI_API_KEY 빈값+설명 주석 모두 포함. `# PORT=3000` Phase 3+ 주석 처리도 CLAUDE.md 스펙 일치 |
| **스펙 준수: docker/Dockerfile** | 통과 | Dockerfile:1-29 — node:22-alpine 기반, multi-stage (builder → production), `pnpm install --frozen-lockfile --prod` 프로덕션 단계 의존성 최소화 |
| **스펙 준수: docker/docker-compose.yml** | 통과 | docker-compose.yml:1-19 — dev mode, volume mount (`../src:/app/src`, `../assets:/app/assets`), port 3000, `pnpm run start:dev` hot-reload |
| **스펙 준수: docker/.dockerignore** | 통과 | .dockerignore:1-9 — node_modules, dist, .git, .env, coverage, uploads 모두 포함. `.claude` 추가는 불필요한 빌드 컨텍스트 제외로 개선 |
| **스펙 준수: .github/workflows/ci.yml** | 통과 | ci.yml:1-37 — pnpm/action-setup@v4 (version: 9), actions/setup-node@v4 (node-version: '22'), steps: install → lint → test → build, push/PR to main 트리거 |
| **스펙 준수: README.md** | 통과 | README.md — 프로젝트 소개, CLI 사용법(`--mode overlay\|rebuild` 포함), Docker 사용법, Phase 로드맵 모두 포함 |
| **스펙 준수: docs/architecture.md** | 통과 | architecture.md — Mermaid 다이어그램 4개(모듈 의존성, TextBlock 데이터 흐름, 어댑터 패턴, overlay/rebuild 분기), 환경변수 테이블 포함 |
| **스펙 준수: src/ 수정 없음** | 통과 | diff에 src/ 관련 변경 없음 |
| **엣지케이스: GEMINI_API_KEY 누락** | 경고 | Dockerfile:28 — `CMD ["node", "dist/main"]`은 HTTP 엔트리포인트 실행. 현재 Phase 0 시점에는 main.ts가 있으나 API 키 없이 Gemini 사용 시 런타임 오류 발생. .env.example에 빈값+주석으로 안내는 되어 있음 (허용 범위) |
| **엣지케이스: pnpm-lock.yaml 부재 시 CI** | 경고 | ci.yml:27 — `pnpm install --frozen-lockfile` 사용. 초기 저장소에 pnpm-lock.yaml이 없으면 CI 실패. 현재 PR에 lock 파일 포함 여부 불명확. README에 `pnpm install` 안내는 있으나 lock 파일 커밋 여부 명시 없음 |
| **엣지케이스: Dockerfile COPY pnpm-lock.yaml*** | 경고 | Dockerfile:8 — `COPY package.json pnpm-lock.yaml* ./` 글로브(`*`)로 선택적 복사. lock 파일 없으면 재현 불가 빌드가 됨. --frozen-lockfile을 쓰므로 lock 파일 없이는 빌드 실패로 안전장치는 있음 |
| **엣지케이스: docker-compose dev 모드에서 .env 누락** | 경고 | docker-compose.yml:14 — `env_file: ../.env` 참조. 최초 설정 시 .env가 없으면 docker compose up 실패. README에 `.env.example → .env` 복사 안내 없음 |
| **에러 핸들링: CI lint/test 실패 시** | 통과 | ci.yml:29-35 — lint, test, build 순차 실행. 각 step 실패 시 GitHub Actions가 후속 step 중단하므로 별도 처리 불필요 |
| **에러 핸들링: Docker 빌드 실패** | 통과 | Dockerfile:11 — `RUN pnpm install --frozen-lockfile`이 실패하면 빌드 중단. multi-stage로 빌드 실패 시 production 이미지 생성 안 됨 |
| **보안: .env 커밋 방지** | 통과 | .gitignore:9 — `.env` 명시. `.env.local`, `.env.*.local`도 추가로 보호 |
| **보안: .dockerignore의 .env 제외** | 통과 | .dockerignore:4-5 — `.env`, `.env.local` 제외로 빌드 컨텍스트에 시크릿 노출 방지 |
| **보안: GitHub Actions 시크릿** | 통과 | ci.yml에 GEMINI_API_KEY를 CI 단계에서 주입하지 않음. 테스트에서 API 키가 필요한 경우는 Phase 1+ 에서 처리 예정으로 현 단계 허용 |
| **가독성: README.md** | 통과 | README.md — 설치, CLI 옵션 표, Docker 사용법, 환경변수 표, Phase 로드맵 체계적으로 구성. 신규 개발자에게 충분한 진입점 제공 |
| **가독성: docs/architecture.md** | 통과 | architecture.md — 4개의 Mermaid 다이어그램으로 시각적 구조 파악 가능. 환경변수 테이블의 `Required` 컬럼에 `T-2+`, `Phase 3+` 표기로 컨텍스트 명확 |

## 질의 사항

없음.

## 최적 개선 제안

1. **README.md에 `.env` 설정 안내 추가** (minor): Docker 사용 전 `.env.example`을 `.env`로 복사하는 단계를 Docker Usage 섹션에 추가하면 `docker compose up` 실패를 방지할 수 있습니다.
   - 예: `cp .env.example .env` 한 줄 추가
   - 근거: docker-compose.yml:14 `env_file: ../.env` 참조

2. **Dockerfile production 단계의 `npm install -g pnpm@9` 중복 최적화** (optional): production 단계에서도 pnpm을 전역 설치하는데, `--prod` 설치 후에는 pnpm이 필요 없으므로 corepack 활성화 방식으로 대체하거나 빌더 단계의 node_modules를 선별 복사하는 방식도 고려할 수 있습니다. 현재 동작에는 문제 없음.

3. **ci.yml Node 버전 핀 고려** (optional): `node-version: '22'`는 22.x 최신 패치를 받으므로 재현성을 높이려면 `node-version-file: 'mise.toml'`이나 `node-version: '22.x'` 방식 또는 exact version 사용을 고려할 수 있습니다. 현재도 허용 범위.

## 판정

APPROVE

## 검수 완료 시각
2026-04-02 00:00
