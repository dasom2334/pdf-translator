# 검수 로그

## 대상
- 브랜치: main
- PR: 없음 (main 브랜치 직접 검수)
- 라운드: R1
- 범위: Phase 1 전체 (E-1, T-1, T-2, G-1+G-2, C-1+C-2)

---

## 체크리스트 결과

| 항목 | 통과/실패 | 근거 (파일:줄) |
|------|-----------|---------------|
| 스펙 준수 | **실패** | G-1/G-2/C-1+C-2 미구현 (아래 상세) |
| 엣지케이스 | 부분 통과 | MyMemory `translateBatch`가 병렬이 아닌 순차 처리 (스펙: 병렬 청크 처리) |
| 에러 핸들링 | 통과 | 각 서비스 BadRequestException / TranslationException / InternalServerErrorException 구분 적절 |
| 보안 | 통과 | API 키 환경변수 처리 정상, 외부 입력 직접 노출 없음 |
| 가독성 | 통과 | 전반적으로 명확하나 일부 문제 있음 (아래 상세) |

---

## 상세 검수

### E-1: PdfExtractorService (pdf-extractor.service.ts)

**스펙 준수**
- extractBlocks(Buffer) / extractBlocksByPages(Buffer, pageRange?) 모두 구현: 통과
- PDF magic bytes 검증 (0x25 0x50 0x44 0x46): 통과 (10번 줄)
- BadRequestException(빈 파일/비PDF): 통과 (15-30번 줄)
- InternalServerErrorException(파싱 실패): 통과 (140-143번 줄)
- DI 토큰 PDF_EXTRACTOR: 통과 (pdf.module.ts 14번 줄)

**문제점**
- pdf-extractor.service.ts:165-169 — `extractBlocks`에서 텍스트 블록이 없으면 `BadRequestException`을 던지지만, `extractBlocksByPages`에는 동일한 빈 결과 검증이 없음. 페이지 범위 결과가 전부 빈 배열(TextBlock[][])인 경우에도 조용히 반환됨.
- pdf-extractor.service.ts:36-58 — `parsePageRange`가 잘못된 형식(예: "abc", "5-3" 역순, "0" 등 경계 밖 값)을 자동으로 무시하고 빈 배열을 반환. 이 경우 `extractBlocksByPages`는 빈 `TextBlock[][]`를 반환하며 오류 없이 종료. 호출부(CLI)가 이를 처리해야 하지만 CLI도 미구현 상태.

**테스트**
- 테스트 커버리지 적절. pageRange 잘못된 형식에 대한 테스트 케이스 없음.

---

### T-1: MyMemoryTranslationService (mymemory-translation.service.ts)

**스펙 준수**
- MyMemory API (https://api.mymemory.translated.net/get) HTTP GET: 통과 (5, 78-82번 줄)
- 빈 텍스트 BadRequestException: 통과 (128-130번 줄)
- API 오류 TranslationException(BAD_GATEWAY): 통과 (88-95, 98-101번 줄)

**문제점 — 스펙 불일치**
- mymemory-translation.service.ts:140-151 — 스펙은 `translateBatch`가 "병렬 청크 처리"를 해야 한다고 명시. 그러나 구현은 `for...of` 루프로 **순차** 처리. 각 텍스트를 `await this.translate()`로 직렬 호출함. 테스트(mymemory-translation.service.spec.ts:106)도 "sequentially"로 순차 처리를 검증하고 있어 스펙과 불일치.
- mymemory-translation.service.ts:28-71 — `splitIntoChunks`에서 단일 문장이 500자를 초과하는 경우 `sentence.slice(0, MAX_CHUNK_SIZE)`로 잘라내지만 이는 단어 중간을 자를 수 있음 (기능적 문제이나 스펙 범위 외).

---

### T-2: GeminiTranslationService (gemini-translation.service.ts)

**스펙 준수**
- @google/generative-ai SDK 사용: 통과 (2번 줄)
- GEMINI_API_KEY 미설정 시 onModuleInit에서 throw new Error(...): 통과 (27-31번 줄)
- translateBatch 순차 호출: 통과 (155-165번 줄)
- 청크 최대 4000자: 통과 (6번 줄 `MAX_CHUNK_SIZE = 4000`)
- 지수 백오프 재시도: 통과 (122번 줄 `BASE_RETRY_DELAY_MS * Math.pow(2, attempt)`)
- BadRequestException(빈 텍스트): 통과 (140-142번 줄)
- TranslationException(BAD_GATEWAY): 통과 (134-136번 줄)

**이상 없음**

---

### TranslationServiceFactory (translation-service.factory.ts)

**스펙 준수**
- getService(provider): ITranslationService: 통과 (14번 줄)
- 잘못된 provider BadRequestException: 통과 (21번 줄)

**이상 없음**

---

### G-1+G-2: PdfOverlayGeneratorService (pdf-overlay-generator.service.ts)

**스펙 준수: 실패**
- pdf-overlay-generator.service.ts:12 — `throw new Error('Not implemented: Phase 1')`
- 스펙(G-1): pdf-lib로 원본 PDF 로드, 화이트박스 처리, translatedText 동일 좌표 삽입, CJK 폰트 임베딩 — **전혀 구현되지 않음**
- 스펙(G-2): 텍스트 오버플로 시 fontSize 자동 축소, 말줄임 처리 — **전혀 구현되지 않음**
- Phase 1-2 태스크(G-1+G-2)가 머지되었다고 했으나 실제로는 스텁(stub) 상태

**테스트**
- pdf-overlay-generator.service.spec.ts:17 — `should be defined` 단 1개 테스트. 실제 동작을 검증하는 테스트 없음.

---

### C-1+C-2: TranslateCommand (translate.command.ts)

**스펙 준수: 실패**
- translate.command.ts:59-61 — `throw new Error('Not implemented: Phase 1')`
- 스펙(C-1+C-2): fs.readFile → extractBlocksByPages → translateBatch → 1:1 매핑 → overlay/rebuild 분기, rebuild 모드 에러 처리, try/catch → console.error + process.exit(1), provider/mode 파서 enum 검증 — **전혀 구현되지 않음**

**테스트**
- translate.command.spec.ts:7-13 — `should resolve TranslateCommand` 단 1개 테스트. DI 해결만 확인하고 실제 동작 테스트 없음.

---

### 모듈 Wiring 검수

**PdfModule (pdf.module.ts)**
- PDF_EXTRACTOR, PDF_OVERLAY_GENERATOR, PDF_REBUILD_GENERATOR DI 토큰 등록: 통과 (14-16번 줄)
- exports에 DI 토큰 포함: 통과 (18번 줄)
- PdfController 등록 (Phase 3+ 예정): 통과 (9번 줄, 스펙과 일치)

**TranslationModule (translation.module.ts)**
- MyMemoryTranslationService, GeminiTranslationService, TranslationServiceFactory 등록: 통과
- TranslationServiceFactory exports: 통과 (9번 줄)

**CliModule (cli.module.ts)**
- ConfigModule, PdfModule, TranslationModule import: 통과 (8-12번 줄)
- TranslateCommand provider 등록: 통과 (13번 줄)
- TranslateCommand가 PdfModule의 DI 토큰을 inject하지 않음 — 현재는 미구현 상태라 문제 없으나, C-1+C-2 구현 시 CliModule이 DI 토큰을 직접 inject할 수 있는지 확인 필요 (exports 통해 접근 가능하므로 구조상 문제 없음)

**인터페이스 계약 일치 확인**
- TextBlock 인터페이스: CLAUDE.md 계약과 일치 (text-block.interface.ts:1-11)
- IPdfExtractor: 계약과 일치 (pdf-extractor.interface.ts:5-8)
- IPdfOverlayGenerator / IPdfRebuildGenerator: 계약과 일치
- ITranslationService: 계약과 일치
- DI 토큰(PDF_EXTRACTOR, PDF_OVERLAY_GENERATOR, PDF_REBUILD_GENERATOR): 계약과 일치
- TranslationProvider enum: 계약과 일치
- OutputMode enum: 계약과 일치
- TranslationException(BAD_GATEWAY): 계약과 일치 (translation.exception.ts:5)

---

## 질의 사항

- Q1: translate.command.ts:59, pdf-overlay-generator.service.ts:12 — Phase 1-2(G-1+G-2)와 Phase 1-3(C-1+C-2)가 "Phase 1 완료"로 보고되었으나 실제로는 `throw new Error('Not implemented: Phase 1')` 스텁 상태입니다. 의도적으로 인터페이스/모듈 배선만 완료하고 로직 구현을 Phase 2에 남긴 것인지, 아니면 구현이 누락된 것인지 확인 필요합니다.

---

## 최적 개선 제안

1. mymemory-translation.service.ts:140-151 — `translateBatch`를 `Promise.all`로 병렬 처리로 전환 권장. 스펙에 명시된 "병렬 청크 처리" 의도와 일치하며, 다수 블록 번역 시 성능 차이가 크게 남. 단, MyMemory의 rate limit(일 5000자)을 고려해 동시성 상한(concurrency limit)을 두는 방식도 고려할 것.
2. pdf-extractor.service.ts:126-172 — `extractBlocks`와 `extractBlocksByPages`가 PDF 로드 코드를 중복(두 함수 모두 pdfjsLib.getDocument 호출). 내부 `loadPdf(buffer)` 헬퍼로 추출하면 중복 제거 및 유지보수성 향상.
3. translate.command.spec.ts:7-13 — `TranslateCommand`의 `run()` 메서드가 구현되면 provider 파서(enum 검증), mode 파서, rebuild 모드 분기, process.exit 호출 등에 대한 단위 테스트를 함께 추가할 것.
4. pdf-extractor.service.ts:36-58 — `parsePageRange`가 빈 결과를 반환할 경우 `extractBlocksByPages` 호출부에서 이를 감지하지 못함. 빈 페이지 목록 파싱 시 `BadRequestException`을 던지거나, 최소 1개 이상의 유효 페이지를 검증하는 로직 추가 권장.

---

## 판정

**REQUEST_CHANGES**

---

## 수정 요청

1. `src/pdf/services/pdf-overlay-generator.service.ts:12` — G-1+G-2 스펙(pdf-lib 기반 overlay, 화이트박스 처리, translatedText 삽입, CJK 폰트 임베딩, 오버플로 fontSize 축소 및 말줄임) 구현 필요. 현재 `throw new Error('Not implemented: Phase 1')`으로 Phase 1 완료 조건 미충족.

2. `src/cli/commands/translate.command.ts:59-61` — C-1+C-2 스펙(fs.readFile → extractBlocksByPages → translateBatch → 1:1 매핑 → overlay/rebuild 분기, rebuild 모드 에러 메시지 + process.exit(1), try/catch → console.error + process.exit(1), provider/mode enum 검증) 구현 필요. 현재 `throw new Error('Not implemented: Phase 1')`으로 Phase 1 완료 조건 미충족.

3. `src/translation/services/mymemory-translation.service.ts:140-151` — 스펙에 "병렬 청크 처리"로 명시되어 있으나 현재 for...of 순차 처리. `Promise.all` 기반 병렬 처리로 변경 필요. (단, Q1 확인 결과에 따라 순차가 의도된 경우 스펙 문서 업데이트 필요)

---

## 검수 완료 시각
2026-04-04 00:45
