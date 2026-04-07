---
description: "Phase 1-1: PDF 추출(E-1) + 번역 어댑터(T-1+T-2) 병렬 실행. 전제조건: phase0 머지."
---

## Phase 1-1 (병렬)

> **전제조건:** phase0 PR이 main에 머지된 상태.

하나의 메시지에서 두 에이전트를 **동시에** 실행:

```
Agent(subagent_type="pdf-builder", isolation="worktree", prompt="E-1 작업을 수행하세요.

## 시작 전 필수: 최신 main 동기화
```bash
git fetch origin && git checkout main && git pull origin main
git checkout -b feature/pdf-extractor
```
기존 브랜치가 있어도 절대 재사용하지 말고 반드시 위 순서대로 새 브랜치를 생성하세요.

Branch: feature/pdf-extractor

PdfExtractorService 구현 (src/pdf/services/pdf-extractor.service.ts):
- pdfjs-dist로 PDF에서 위치 포함 텍스트 블록 추출
- extractBlocks(fileBuffer: Buffer) → TextBlock[]
- extractBlocksByPages(fileBuffer: Buffer, pageRange?: string) → TextBlock[][]
- 각 TextBlock: text, page, x, y, width, height, fontSize, fontName
- PDF magic bytes 검증 (0x25 0x50 0x44 0x46)
- 에러: BadRequestException (빈 파일/비PDF), InternalServerErrorException (파싱 실패)
- DI: { provide: PDF_EXTRACTOR, useExisting: PdfExtractorService }
- assets/fonts/에 Noto Sans 폰트 배치 (NotoSansCJKkr-Regular.otf)
- 유닛 테스트: valid PDF → TextBlock[], empty → error, non-PDF → error

## 자동 교정 + 리뷰 루프
다음을 APPROVE가 날 때까지 반복하세요:
1. pnpm build → pnpm lint → pnpm test 통과 확인 (실패 시 수정 반복)
2. git commit → push (최초 1회는 PR 생성, 이후에는 push만)
3. Agent(subagent_type="code-reviewer")로 PR 리뷰 요청 (리뷰어가 🔍 문제 발견 코멘트 게시)
4. 판정이 REQUEST_CHANGES면:
   a. 이슈 수정
   b. PR에 ✅ 수정 완료 코멘트 게시 — 아래 형식 준수:
      ```
      ## ✅ 수정 완료
      **논의 주체:** code-reviewer ↔ {에이전트 역할}
      ### 수정 내용
      {항목별 — 무엇을, 어떻게, 왜 그렇게 수정했는지}
      ### 적용 여부
      {✅ 적용 완료 / ⏭️ 향후 과제로 이관 — 이관 시 이유 명시}
      ```
   c. 1번으로 돌아가기
5. 판정이 APPROVE면: worktree 정리 후 종료")

Agent(subagent_type="translation-builder", isolation="worktree", prompt="T-1 + T-2 작업을 수행하세요.

## 시작 전 필수: 최신 main 동기화
```bash
git fetch origin && git checkout main && git pull origin main
git checkout -b feature/translation-adapters
```
기존 브랜치가 있어도 절대 재사용하지 말고 반드시 위 순서대로 새 브랜치를 생성하세요.

Branch: feature/translation-adapters

1. MyMemoryTranslationService 구현 (src/translation/services/mymemory-translation.service.ts):
   - MyMemory API (https://api.mymemory.translated.net/get) 사용
   - API 키 불필요 (무료 tier: 일 5000자)
   - translate(): HTTP GET (?q=text&langpair={sourceLang}|{targetLang})
   - translateBatch(): 순차 호출, 문단 단위 청크 분할 (최대 500자)
   - getSupportedLanguages(): 지원 언어 목록 반환
   - 에러: BadRequestException (빈 텍스트), TranslationException(BAD_GATEWAY) (API 오류)

2. GeminiTranslationService 구현 (src/translation/services/gemini-translation.service.ts):
   - @google/generative-ai SDK 연동
   - GEMINI_API_KEY 환경변수
   - onModuleInit()에서 API 키 검증 → throw new Error(...) (HttpException 금지)
   - translate(): 프롬프트 기반 번역, 청크 최대 4000자
   - translateBatch(): 순차 호출
   - 분당 요청 제한 대응 (지수 백오프 재시도)
   - 에러: BadRequestException (빈 텍스트), TranslationException(BAD_GATEWAY) (API 오류)

3. TranslationServiceFactory 구현 (src/translation/factories/translation-service.factory.ts):
   - getService(provider: TranslationProvider): ITranslationService
   - MYMEMORY → MyMemoryTranslationService
   - GEMINI → GeminiTranslationService
   - 잘못된 provider → BadRequestException

4. 유닛 테스트 (mock HTTP/SDK 호출)

## 자동 교정 + 리뷰 루프
다음을 APPROVE가 날 때까지 반복하세요:
1. pnpm build → pnpm lint → pnpm test 통과 확인 (실패 시 수정 반복)
2. git commit → push (최초 1회는 PR 생성, 이후에는 push만)
3. Agent(subagent_type="code-reviewer")로 PR 리뷰 요청 (리뷰어가 🔍 문제 발견 코멘트 게시)
4. 판정이 REQUEST_CHANGES면:
   a. 이슈 수정
   b. PR에 ✅ 수정 완료 코멘트 게시 — 아래 형식 준수:
      ```
      ## ✅ 수정 완료
      **논의 주체:** code-reviewer ↔ {에이전트 역할}
      ### 수정 내용
      {항목별 — 무엇을, 어떻게, 왜 그렇게 수정했는지}
      ### 적용 여부
      {✅ 적용 완료 / ⏭️ 향후 과제로 이관 — 이관 시 이유 명시}
      ```
   c. 1번으로 돌아가기
5. 판정이 APPROVE면: worktree 정리 후 종료")
```
