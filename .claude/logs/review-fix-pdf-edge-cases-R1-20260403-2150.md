# Code Review — fix/pdf-edge-cases R1

**PR:** #38
**Branch:** fix/pdf-edge-cases
**Round:** 1
**Reviewer:** code-reviewer
**Date:** 2026-04-03

---

## 판정: APPROVE ✅

이슈 없음. 세 가지 변경 모두 스펙에 부합하며 코딩 규칙을 준수합니다.

---

## 리뷰 요약

### 1. extractBlocks — 빈 배열 반환 (pdf-extractor.service.ts)

**변경 내용:** `allBlocks.length === 0` 시 `BadRequestException` 대신 `[]` 반환.

**판단:** 올바른 수정. 유효한 PDF이지만 텍스트가 없는 이미지 전용 PDF는 입력 오류가 아니라 정상 케이스이므로 `BadRequestException` 분류가 부적절했음. 빈 배열 반환이 `IPdfExtractor` 계약에도 일치함.

**파일 소유권:** `src/pdf/services/` — pdf-builder 소유 범위 내.

🟢 이슈 없음.

---

### 2. fitText boxWidth=0 탈출 조건 (pdf-overlay-generator.service.ts)

**변경 내용:**
- Phase 2 진입 직후 `boxWidth <= 0` 체크 → 즉시 `{ text: '', fontSize }` 반환
- while 루프 종료 후 `truncated.length === 0` 체크 → 즉시 `{ text: '', fontSize }` 반환

**판단:** 논리적으로 올바름. `boxWidth <= 0` 조건은 Phase 2 분기 내부에 배치되어 있어 Phase 1 루프(`fontSize > MIN_FONT_SIZE && measureWidth > boxWidth`)는 여전히 정상 동작. `truncated.length === 0` 시 `'' + ELLIPSIS = '...'` 반환 방지도 적절.

**미세 관찰 (비차단):** `boxWidth <= 0`이면 Phase 1 루프(`measureWidth(text, fontSize) > boxWidth`)도 즉시 탈출하므로 Phase 2 자체에 진입하지 않을 수 있음. 실제로는 `measureWidth`가 0을 반환하면 `> 0`이 false가 되어 Phase 2로 넘어오지 않음. 단, `measureWidth`가 음수 boxWidth보다 큰 양수를 반환하면 Phase 2에 진입 가능. 따라서 현재 위치의 탈출 조건은 방어적으로 필요하며 코드가 올바름.

🟢 이슈 없음.

---

### 3. drawText 실패 시 Logger.warn (pdf-overlay-generator.service.ts)

**변경 내용:**
- `private readonly logger = new Logger(PdfOverlayGeneratorService.name)` 추가
- catch 블록에서 `this.logger.warn(...)` 호출

**판단:** NestJS 관행에 부합. 로그 메시지에 page/x/y 좌표 포함으로 디버깅 용이. 빈 `catch {}` 제거로 숨겨진 오류가 관찰 가능해짐.

🟢 이슈 없음.

---

### 4. 테스트 커버리지

**pdf-extractor.service.spec.ts:**
- 기존 `BadRequestException` 케이스 → 빈 배열 반환 케이스로 정확히 전환
- 16개 테스트 모두 통과

**pdf-overlay-generator.service.spec.ts:**
- `boxWidth=0` 케이스 신규 추가 (무한 루프 방지 검증)
- 11개 테스트 모두 통과

🟢 이슈 없음.

---

### 5. 파일 소유권 확인

변경된 파일:
- `src/pdf/services/pdf-extractor.service.ts` ✅ pdf-builder 소유
- `src/pdf/services/pdf-overlay-generator.service.ts` ✅ pdf-builder 소유
- `src/pdf/services/pdf-extractor.service.spec.ts` ✅ pdf-builder 소유
- `src/pdf/services/pdf-overlay-generator.service.spec.ts` ✅ pdf-builder 소유

`.claude/agents/` 파일들 변경도 포함되어 있으나 이는 main 브랜치 대비 diff이며, 해당 변경은 이전 PR들에서 이미 머지된 내용으로 본 PR 커밋(`b9c030f`)에는 포함되지 않음. PR 커밋 자체는 pdf/ 파일만 수정.

🟢 소유권 침범 없음.

---

### 6. 보안 이슈

하드코딩된 시크릿 없음. 민감 정보 노출 없음.

🟢 이슈 없음.

---

## 발견된 이슈 목록

| 심각도 | 항목 | 상태 |
|--------|------|------|
| — | 발견된 이슈 없음 | — |

---

**최종 판정: APPROVE**
