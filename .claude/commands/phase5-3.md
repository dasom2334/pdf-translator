---
description: "Phase 5-3: OCR CLI 옵션 추가. 전제조건: phase5-2 머지."
---

## Phase 5-3

> **전제조건:** phase5-2 PR이 main에 머지된 상태.

```
Agent(subagent_type="cli-builder", isolation="worktree", prompt="Phase 5-3 작업을 수행하세요.

## 시작 전 필수: 최신 main 동기화
git fetch origin && git checkout main && git pull origin main

Branch: feature/cli-ocr

## 배경
phase5-2에서 추출 파이프라인에 OCR이 통합되었습니다. CLI에서 --ocr 플래그를 추가하여 스캔 PDF 번역을 지원합니다.

1. TranslateCommand에 옵션 추가 (src/cli/commands/translate.command.ts):
   - --ocr 플래그 (기본: false)
     @Option({ flags: '--ocr', description: 'Enable OCR for scanned/image-based PDF pages' })
     parseOcr(): boolean { return true; }
   - --ocr-lang <lang> 옵션 (기본: 'eng')
     @Option({ flags: '--ocr-lang <lang>', description: 'OCR language (e.g. eng, kor, jpn)', defaultValue: 'eng' })
     parseOcrLang(val: string): string { return val; }

2. TranslateOptions에 전달:
   - pdfTranslationService.translate(buffer, { ...opts, ocr: opts.ocr, ocrLang: opts.ocrLang })

3. OCR 감지 시 콘솔 출력:
   - onPageTranslated 콜백 또는 별도 이벤트로 OCR 감지 페이지 수 표시
   - 예: 'Detected N image-only pages, running OCR...'
   - 이 메시지는 번역 시작 전 또는 추출 단계에서 출력

4. .pdf-translator.yml 설정 확장:
   - CliConfig에 ocr?: boolean, ocrLang?: string 추가
   - 우선순위: CLI 옵션 > 설정 파일 > 기본값

5. --help 출력 확인

6. 유닛 테스트:
   - --ocr 플래그 파싱 확인
   - --ocr-lang 기본값 및 커스텀 값
   - 설정 파일에서 ocr 로드

## 자동 교정 + 리뷰 루프
CLAUDE.md의 '자동 교정 + 리뷰 루프 (에이전트 공통)' 섹션을 따른다.")
```
