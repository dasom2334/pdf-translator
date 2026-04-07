# Code Review — fix/pdf-edge-cases R1

**PR:** #38  
**Branch:** fix/pdf-edge-cases  
**Round:** 1  
**Date:** 2026-04-04 01:20

---

## 판정: APPROVE

모든 스펙 요구사항이 올바르게 구현되었으며 코딩 규칙 위반, 보안 이슈, 파일 소유권 침범 없음.

---

## 변경사항 요약

### 1. `pdf-extractor.service.ts`
- `extractBlocks()` 후처리 로직에서 `allBlocks.length === 0`이면 `BadRequestException`을 던지던 부분 제거
- 이미지 전용 PDF 등 텍스트 없는 유효한 PDF는 빈 배열 `[]` 반환으로 정상 처리

### 2. `pdf-overlay-generator.service.ts`
- `Logger` 임포트 및 `private readonly logger = new Logger(PdfOverlayGeneratorService.name)` 초기화
- `fitText()` Phase 2 진입 후 `boxWidth <= 0` 즉시 탈출 조건 추가
- `truncated.length === 0` 탈출 조건 추가 (ELLIPSIS 자체도 박스 넘칠 때)
- `drawText` catch 블록에 `this.logger.warn(...)` 추가 — page/x/y 컨텍스트 포함

### 3. 테스트
- `pdf-extractor.service.spec.ts`: "no text content" → `BadRequestException` 기대를 빈 배열 반환으로 수정
- `pdf-overlay-generator.service.spec.ts`: `boxWidth=0` 케이스 추가

---

## 이슈 리포트

이슈 없음.

---

## 세부 검토

### CLAUDE.md 규칙 준수
- Exception Handling Rules: `BadRequestException`(잘못된 입력), `InternalServerErrorException`(파싱 실패) 분류 정확. 빈 배열 반환은 유효한 PDF에 텍스트가 없는 경우로 예외 불필요 — 올바른 판단.
- `HttpException` 직접 사용 없음.

### 파일 소유권
- 수정 파일 모두 `src/pdf/**` 범위 내 — 소유권 침범 없음.

### 테스트 커버리지
- happy path: overlay 정상 실행, 파일 출력 확인
- 에러 케이스: invalid buffer → InternalServerErrorException
- edge case: boxWidth=0, page out-of-range, no translatedText, overflow, ellipsis, multi-page
- 총 89개 테스트 모두 통과

### 보안
- 하드코딩된 시크릿 없음
- 민감 정보 노출 없음

### 코드 품질
- `fitText` 탈출 조건 배치가 논리적으로 올바름: `boxWidth <= 0` 체크를 루프 진입 전에 두어 불필요한 연산 방지
- `truncated.length === 0` 체크는 ELLIPSIS 너비가 boxWidth를 초과하는 극단적 케이스 처리 — 방어적으로 적절
- Logger 초기화 방식이 NestJS 관례에 맞음
