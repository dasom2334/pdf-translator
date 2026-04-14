---
description: "Phase 6-1: Vision 번역 인터페이스 + Gemini Vision 구현. 전제조건: phase5-3 머지."
---

## Phase 6-1

> **전제조건:** phase5-3 PR이 main에 머지된 상태.

```
Agent(subagent_type="translation-builder", isolation="worktree", prompt="Phase 6-1 작업을 수행하세요.

## 시작 전 필수: 최신 main 동기화
git fetch origin && git checkout main && git pull origin main

Branch: feature/vision-translation

## 배경
텍스트 기반 번역은 블록 단위로 문맥이 끊기지만, LLM Vision은 페이지 전체 이미지를 보면서 레이아웃 맥락을 이해하고 번역할 수 있습니다. Gemini Vision을 첫 번째 어댑터로 구현합니다.

1. 인터페이스 정의 (src/translation/interfaces/vision-translation-service.interface.ts):
   - VISION_TRANSLATION_SERVICE = Symbol('VISION_TRANSLATION_SERVICE')
   - IVisionTranslationService:
     - translatePage(pageImage: Buffer, blocks: TextBlock[], sourceLang: string, targetLang: string, options?: { glossaryPath?: string }): Promise<TextBlock[]>
       — 페이지 이미지와 블록 정보를 받아 각 블록의 translatedText를 채운 TextBlock[] 반환
     - isAvailable(): Promise<boolean>

2. GeminiVisionTranslationService 구현 (src/translation/services/gemini-vision-translation.service.ts):
   - @Injectable(), IVisionTranslationService 구현
   - @google/generative-ai SDK 사용 (기존 GeminiTranslationService와 동일 SDK)
   - 모델: gemini-1.5-flash (또는 gemini-1.5-pro, vision 지원 모델)

   - translatePage() 구현:
     a. 프롬프트 구성:
        - 시스템: "You are a document translator. You will receive a page image and a list of text blocks with their coordinates. Translate each block from {sourceLang} to {targetLang} using the visual context of the page layout."
        - 블록 정보: JSON 배열로 전달 [{ index: 0, text: "...", x, y, width, height }, ...]
        - 용어집이 있으면: GlossaryService로 치환 → 프롬프트에 보존 목록 추가
        - 응답 형식 지정: JSON 배열 [{ index: 0, translatedText: "..." }, ...]
     b. Gemini API 호출: 이미지(pageImage를 base64) + 텍스트 프롬프트
     c. 응답 파싱: JSON 응답에서 index별 translatedText 추출
     d. blocks 배열에 translatedText 할당 → 반환
     e. 용어집 복원: GlossaryService.restore()

   - 에러 처리:
     - JSON 파싱 실패 → 재시도 (MAX_RETRY=3)
     - 429/503 → 지수 백오프 (기존 패턴 재사용)
     - 블록 수 불일치 → 부분 매핑 (가능한 것만 할당)

   - isAvailable(): GEMINI_API_KEY 환경변수 확인

   - GlossaryService 주입 (기존 서비스 재사용)

3. TranslationModule 등록:
   - providers에 GeminiVisionTranslationService 추가
   - { provide: VISION_TRANSLATION_SERVICE, useExisting: GeminiVisionTranslationService }
   - exports에 VISION_TRANSLATION_SERVICE 추가

4. CLAUDE.md 업데이트:
   - Shared Contracts에 IVisionTranslationService, VISION_TRANSLATION_SERVICE 추가

5. 유닛 테스트 (src/translation/services/gemini-vision-translation.service.spec.ts):
   - Gemini API mock → 정상 JSON 응답 → TextBlock[] 매핑 확인
   - JSON 파싱 실패 → 재시도 확인
   - 용어집 치환/복원 라운드트립
   - 429 에러 → 백오프 재시도
   - isAvailable: API 키 있으면 true, 없으면 false
   - 블록 수 불일치 → 부분 매핑

## 자동 교정 + 리뷰 루프
CLAUDE.md의 '자동 교정 + 리뷰 루프 (에이전트 공통)' 섹션을 따른다.")
```
