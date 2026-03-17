---
description: "Phase 2: 고도화. Gemini LLM 어댑터, 용어집, 페이지 범위, 설정파일, 바이링구얼 PDF."
---

## Phase 2: Enhancement

> **전제조건:** Phase 1 PR이 main에 머지된 상태.

translation-builder와 pdf-builder를 **병렬** 실행 후,
cli-builder를 **순차** 실행.

---

### Sub-agent 1: @translation-builder (병렬)

**Branch:** `feature/gemini-adapter`
**소유 파일:** `src/translation/**`, `src/common/**`

1. `@google/generative-ai` 의존성 추가 (커밋 메시지에 명시)
2. **GeminiTranslationService 구현** (`src/translation/services/gemini-translation.service.ts`):
   - Gemini API로 번역 (프롬프트 기반)
   - GEMINI_API_KEY 환경변수 사용
   - `onModuleInit()`에서 API 키 검증 → `throw new Error(...)` (HttpException 금지)
   - `translate()`: 프롬프트에 소스/타겟 언어 지정
   - `translateBatch()`: 배치 프롬프트 또는 순차 호출
   - `getSupportedLanguages()`: LLM 지원 언어 목록
   - 용어집(Glossary) 지원: 프롬프트에 용어 사전 컨텍스트 포함
3. TranslationServiceFactory에 GEMINI case 추가
4. 유닛 테스트 (Gemini SDK mock)
5. `pnpm run lint` + `pnpm test` 통과
6. Commit, push, PR 생성

---

### Sub-agent 2: @pdf-builder (병렬)

**Branch:** `feature/pdf-enhanced`
**소유 파일:** `src/pdf/**`

1. **바이링구얼 PDF 모드**:
   - IPdfGenerator에 `generateBilingual()` 메서드 추가:
     ```typescript
     generateBilingual(
       originalPages: string[],
       translatedPages: string[],
       outputPath: string,
       options?: PdfGenerateOptions,
     ): Promise<void>;
     ```
   - 원문과 번역문을 페이지별로 교대 배치 (원문 → 번역 → 원문 → 번역)
   - 또는 좌우 2단 레이아웃 (Phase 2 내에서 선택)

2. **페이지 범위 지정**:
   - `extractTextByPages()`에 선택적 페이지 범위 파라미터 추가:
     ```typescript
     extractTextByPages(fileBuffer: Buffer, pageRange?: string): Promise<string[]>;
     ```
   - 범위 파싱: "1-5,10,15-20" → [1,2,3,4,5,10,15,16,17,18,19,20]

3. PdfGenerateOptions 확장:
   ```typescript
   export interface PdfGenerateOptions {
     fontPath?: string;
     glossary?: Record<string, string>;
   }
   ```

4. 유닛 테스트
5. `pnpm run lint` + `pnpm test` 통과
6. Commit, push, PR 생성

---

### Sub-agent 3: @cli-builder (순차 — 위 2개 완료 후)

**Branch:** `feature/cli-enhanced`
**소유 파일:** `src/cli/**`, `src/cli.ts`, `test/**`

1. 새 CLI 옵션 추가:
   - `--glossary <file>` — 용어집 JSON/YAML 파일 경로
   - `--pages <range>` — 페이지 범위 (예: "1-5,10")
   - `--bilingual` — 이중언어 PDF 모드

2. **설정 파일 (.pdf-translator.yml)** 로딩:
   - 프로젝트 루트 및 홈 디렉토리에서 자동 탐색
   - 설정 항목: provider, sourceLang, targetLang, fontPath, glossaryPath
   - CLI 옵션 > 설정 파일 > 기본값 (우선순위)

3. TranslateCommand에 새 옵션 반영:
   - glossary 파일 로딩 → PdfGenerateOptions에 전달
   - 페이지 범위 → extractTextByPages에 전달
   - bilingual → generateBilingual 호출

4. 유닛 테스트
5. `pnpm run lint` + `pnpm test` 통과
6. Commit, push, PR 생성

---

## Done Criteria
- Gemini 번역 동작 확인 (GEMINI_API_KEY 설정 필요)
- 용어집 적용 번역 확인
- `--pages 1-3` 옵션으로 일부 페이지만 번역
- `--bilingual` 옵션으로 이중언어 PDF 생성
- `.pdf-translator.yml` 설정 파일 로딩
- 모든 테스트 통과
