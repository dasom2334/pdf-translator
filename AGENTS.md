# Agents

## 에이전트 목록

| 에이전트 | 소유 파일 | 담당 레이어 |
|---------|----------|-----------|
| backend-builder | src/, test/, package.json, tsconfig | 모듈/DI 뼈대 |
| pdf-builder | src/pdf/**, assets/fonts/** | 추출(E) + 생성(G) |
| translation-builder | src/translation/**, src/common/** | 번역(T) |
| cli-builder | src/cli/**, src/cli.ts, src/main.ts, src/app.module.ts | CLI(C) |
| infra-builder | docker/**, .github/**, docs/**, README.md | 인프라 |

## 하네스 검증 루프

각 에이전트는 코드 작성 후 반드시 아래 루프를 통과해야 PR을 생성한다.

```
코드 작성
  → pnpm build          # 컴파일 에러 확인
  → pnpm lint           # 린트 에러 확인
  → pnpm test           # 단위 테스트 통과 확인
  → 실패 시: 에러 분석 → 수정 → 루프 재시작
  → 전부 통과 시: commit → push → PR 생성
```

### 루프 탈출 조건

- **통과**: `pnpm build` + `pnpm lint` + `pnpm test` 모두 0 exit code
- **실패 한도**: 동일한 에러가 3회 반복되면 루프 중단 후 사용자에게 에스컬레이션
- **스코프 외 수정 금지**: 에이전트는 자신의 소유 파일만 수정. 타 레이어 파일 수정 필요 시 루프 중단 후 사용자에게 에스컬레이션

### 에이전트별 추가 검증

| 에이전트 | 추가 검증 |
|---------|---------|
| pdf-builder | 샘플 PDF로 TextBlock 추출 결과 콘솔 출력 확인 |
| translation-builder | 짧은 텍스트로 실제 API 호출 통합 테스트 |
| cli-builder | `--help` 출력, 기본 옵션으로 e2e 실행 확인 |
| backend-builder | `pnpm build` 통과 + 모든 서비스 DI 주입 확인 |

## 소유권 규칙

- 에이전트는 자신의 소유 파일만 수정한다
- `.env`는 사용자 소유 — 어떤 에이전트도 수정 금지
- 공유 계약(CLAUDE.md Shared Contracts) 변경 시 CLAUDE.md도 함께 업데이트
- 타 에이전트 소유 파일 수정이 필요한 경우: 루프 중단 후 사용자에게 에스컬레이션
