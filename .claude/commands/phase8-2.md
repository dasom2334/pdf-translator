---
description: "Phase 8-2: API 문서(Swagger) + 인프라 업데이트. 전제조건: phase8-1 머지."
---

## Phase 8-2

> **전제조건:** phase8-1 PR이 main에 머지된 상태.

```
Agent(subagent_type="infra-builder", isolation="worktree", prompt="Phase 8-2 작업을 수행하세요.

## 시작 전 필수: 최신 main 동기화
git fetch origin && git checkout main && git pull origin main

Branch: feature/api-docs

## 배경
Phase 8-1에서 HTTP API가 구현되었습니다. Swagger 문서, Docker 설정, CI 업데이트, README 보강을 수행합니다.

1. Swagger/OpenAPI 통합:
   - pnpm add @nestjs/swagger swagger-ui-express
   - docs/swagger-setup.md 또는 README에 설정 가이드 추가
   - 주의: src/main.ts 수정은 cli-builder 소유 — 직접 수정 불가
   - 대신: docs/에 Swagger 설정 코드 스니펫 문서화, 또는 사용자에게 안내

2. docs/architecture.md 업데이트:
   - API 엔드포인트 레퍼런스 테이블:
     | Method | Path | Description | Auth |
     | POST | /pdf/translate | PDF 업로드 및 번역 | - |
     | GET | /pdf/supported-languages | 지원 언어 목록 | - |
     | GET | /pdf/health | 헬스체크 | - |
   - 요청/응답 예시
   - Mermaid 다이어그램에 HTTP API 경로 추가

3. README.md 업데이트:
   - HTTP API 사용법 섹션 추가:
     - curl 예시: multipart/form-data로 PDF 업로드
     - 응답 형식 설명
     - 환경변수 (PORT, UPLOAD_DIR, MAX_FILE_SIZE)
   - Phase 로드맵 업데이트 (Phase 3~8 완료 표시)

4. docker/docker-compose.yml 업데이트:
   - API 모드 서비스 추가 (또는 기존 서비스에 포트 매핑)
   - 환경변수: PORT, UPLOAD_DIR, MAX_FILE_SIZE, GEMINI_API_KEY
   - volumes: uploads 디렉토리 마운트

5. docker/Dockerfile 확인:
   - EXPOSE 3000 추가 (없다면)
   - uploads 디렉토리 생성

6. .github/workflows/ci.yml 업데이트:
   - API E2E 테스트 step 추가 (필요 시)
   - 빌드 후 health check curl 추가 (선택)

7. .env.example 업데이트:
   - PORT=3000 (주석 해제)
   - UPLOAD_DIR=./uploads

## 자동 교정 + 리뷰 루프
CLAUDE.md의 '자동 교정 + 리뷰 루프 (에이전트 공통)' 섹션을 따른다.")
```
