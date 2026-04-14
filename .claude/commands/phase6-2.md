---
description: "Phase 6-2: Vision 통합 + CLI 옵션 (병렬). 전제조건: phase6-1 머지."
---

## Phase 6-2 (병렬)

> **전제조건:** phase6-1 PR이 main에 머지된 상태.

하나의 메시지에서 두 에이전트를 **동시에** 실행:

```
Agent(subagent_type="pdf-builder", isolation="worktree", prompt="Phase 6-2 pdf-builder 작업을 수행하세요.

## 시작 전 필수: 최신 main 동기화
git fetch origin && git checkout main && git pull origin main

Branch: feature/vision-integration

## 배경
phase6-1에서 GeminiVisionTranslationService가 구현되었습니다. PdfTranslationService에 Vision 번역 경로를 추가합니다.

1. PdfTranslationService 수정 (src/pdf/services/pdf-translation.service.ts):
   - @Optional() @Inject(VISION_TRANSLATION_SERVICE) private readonly visionService?: IVisionTranslationService
   - TranslateOptions에 useVision?: boolean 추가
   - translate() 파이프라인에 Vision 분기 추가:
     a. extractBlocksByPages → TextBlock[][] (기존)
     b. useVision이 true이고 visionService가 있고 isAvailable()이 true이면:
        - 페이지별로: renderPdfPages()로 이미지 생성 → visionService.translatePage(image, pageBlocks, sourceLang, targetLang, { glossaryPath })
        - 블록 병합(mergeBlocks)은 Vision 모드에서 불필요 (페이지 전체 컨텍스트 사용)
     c. useVision이 false이거나 visionService 미사용 시: 기존 텍스트 기반 번역
     d. generate (기존)
   - Vision 모드에서도 onPageTranslated 콜백 호출
   - Vision 실패 시 텍스트 기반으로 fallback (부분 실패 복구와 결합)

2. renderPdfPages 활용:
   - src/pdf/utils/pdf-page-renderer.ts의 renderPdfPages() 재사용
   - Vision용 렌더링: 적절한 해상도 (scale=2 정도)

3. CLAUDE.md 업데이트:
   - TranslateOptions에 useVision 추가

4. 유닛 테스트:
   - useVision=true + visionService 있음 → visionService.translatePage 호출
   - useVision=true + visionService 없음 → 텍스트 기반 fallback
   - useVision=false → 기존 경로
   - Vision 실패 → 텍스트 기반 fallback

## 자동 교정 + 리뷰 루프
CLAUDE.md의 '자동 교정 + 리뷰 루프 (에이전트 공통)' 섹션을 따른다.")

Agent(subagent_type="cli-builder", isolation="worktree", prompt="Phase 6-2 cli-builder 작업을 수행하세요.

## 시작 전 필수: 최신 main 동기화
git fetch origin && git checkout main && git pull origin main

Branch: feature/cli-vision

## 배경
Vision 번역 기능이 PdfTranslationService에 통합되었습니다. CLI에서 --vision 플래그를 추가합니다.

1. TranslateCommand에 옵션 추가 (src/cli/commands/translate.command.ts):
   - --vision 플래그 (기본: false)
     @Option({ flags: '--vision', description: 'Use vision LLM for context-aware translation (requires GEMINI_API_KEY)' })
     parseVision(): boolean { return true; }

2. TranslateOptions에 전달:
   - pdfTranslationService.translate(buffer, { ...opts, useVision: opts.vision })

3. GEMINI_API_KEY 미설정 시 경고:
   - --vision 사용 시 process.env.GEMINI_API_KEY 확인
   - 없으면: console.warn('Warning: GEMINI_API_KEY not set. Vision mode requires Gemini API key. Falling back to text-based translation.')

4. .pdf-translator.yml 설정 확장:
   - CliConfig에 vision?: boolean 추가

5. 유닛 테스트:
   - --vision 플래그 파싱
   - API 키 경고 메시지 출력 확인
   - 설정 파일 연동

## 자동 교정 + 리뷰 루프
CLAUDE.md의 '자동 교정 + 리뷰 루프 (에이전트 공통)' 섹션을 따른다.")
```
