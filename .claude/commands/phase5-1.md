---
description: "Phase 5-1: OCR 어댑터 인터페이스 + tesseract.js/시스템 구현. 전제조건: phase4-2 머지."
---

## Phase 5-1

> **전제조건:** phase4-2 PR이 main에 머지된 상태.

```
Agent(subagent_type="pdf-builder", isolation="worktree", prompt="Phase 5-1 작업을 수행하세요.

## 시작 전 필수: 최신 main 동기화
git fetch origin && git checkout main && git pull origin main

Branch: feature/ocr-adapters

## 배경
스캔된 PDF(텍스트 레이어 없음)를 지원하기 위해 OCR 엔진을 어댑터 패턴으로 도입합니다. tesseract.js(번들, WASM)와 시스템 tesseract(바이너리) 두 가지를 지원합니다.

1. 인터페이스 정의 (src/pdf/interfaces/ocr-engine.interface.ts):
   - OCR_ENGINE = Symbol('OCR_ENGINE')
   - IOcrEngine:
     - recognize(imageBuffer: Buffer, lang?: string): Promise<OcrResult>
     - isAvailable(): Promise<boolean>
   - OcrResult:
     - blocks: TextBlock[] — OCR로 인식된 텍스트 블록 (좌표 포함)
     - confidence: number — 전체 인식 신뢰도 (0~100)
   - src/pdf/interfaces/index.ts에서 re-export

2. TesseractJsOcrService 구현 (src/pdf/services/tesseractjs-ocr.service.ts):
   - @Injectable(), IOcrEngine 구현
   - tesseract.js의 createWorker() 사용
   - recognize(): 이미지 버퍼 → worker.recognize() → 결과의 words/lines를 TextBlock[]로 변환
   - 좌표 변환: tesseract.js는 pixel 좌표 반환 → PDF 포인트로 변환 필요 (DPI 기반)
     - 기본 DPI 가정: 72 (renderPdfPages 출력 기준) 또는 150 (OCR 정확도)
     - 변환: x_pt = x_px * 72 / dpi
   - isAvailable(): Promise.resolve(true) — 항상 사용 가능 (번들됨)
   - worker 재사용: onModuleInit()에서 생성, onModuleDestroy()에서 종료
   - lang 파라미터를 worker에 전달 (기본: 'eng')

3. SystemTesseractOcrService 구현 (src/pdf/services/system-tesseract-ocr.service.ts):
   - @Injectable(), IOcrEngine 구현
   - child_process.execFile로 시스템 tesseract 바이너리 호출
   - recognize():
     a. 이미지 버퍼를 임시 파일에 저장
     b. tesseract <input> <output> -l <lang> hocr 실행
     c. hOCR(HTML) 출력 파싱 → TextBlock[] 변환
     d. hOCR의 bbox 속성에서 좌표 추출
     e. 임시 파일 정리
   - isAvailable(): which tesseract 또는 tesseract --version 실행 → 성공이면 true
   - DPI 변환: hOCR bbox는 pixel → PDF 포인트

4. 의존성 추가: pnpm add tesseract.js

5. PdfModule 등록:
   - OcrEngineFactory 또는 useFactory로 등록:
     - 시스템 tesseract 사용 가능하면 SystemTesseractOcrService 사용
     - 아니면 TesseractJsOcrService fallback
   - { provide: OCR_ENGINE, useFactory: ... }
   - exports에 OCR_ENGINE 추가

6. CLAUDE.md 업데이트:
   - Shared Contracts에 IOcrEngine, OcrResult, OCR_ENGINE 추가

7. 유닛 테스트:
   - TesseractJsOcrService: tesseract.js worker mock → TextBlock[] 변환 확인
   - SystemTesseractOcrService: execFile mock → hOCR 파싱 → TextBlock[] 확인
   - isAvailable() 동작 확인
   - 좌표 변환 정확성

## 자동 교정 + 리뷰 루프
CLAUDE.md의 '자동 교정 + 리뷰 루프 (에이전트 공통)' 섹션을 따른다.")
```
