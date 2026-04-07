# 검수 로그

## 대상
- 브랜치: feature/backend-init
- PR: #23
- 라운드: R1

## 체크리스트 결과
| 항목 | 통과/실패 | 근거 (파일:줄) |
|------|-----------|---------------|
| **스펙 준수: TextBlock 인터페이스** | 통과 | `src/pdf/interfaces/text-block.interface.ts:1-11` — text, translatedText?, page, x, y, width, height, fontSize, fontName 모두 정의됨 |
| **스펙 준수: DI 토큰 3개 (Symbol)** | 통과 | `pdf-extractor.interface.ts:3`, `pdf-overlay-generator.interface.ts:3`, `pdf-rebuild-generator.interface.ts:3` — 각각 Symbol로 선언 |
| **스펙 준수: useExisting 바인딩** | 통과 | `src/pdf/pdf.module.ts:13-15` — `{ provide: PDF_EXTRACTOR, useExisting: PdfExtractorService }` 등 3개 모두 정확히 사용 |
| **스펙 준수: IPdfExtractor** | 통과 | `src/pdf/interfaces/pdf-extractor.interface.ts:5-8` — extractBlocks(fileBuffer: Buffer), extractBlocksByPages(fileBuffer, pageRange?) 정확히 선언 |
| **스펙 준수: IPdfOverlayGenerator** | 통과 | `src/pdf/interfaces/pdf-overlay-generator.interface.ts:9-15` — overlay(originalBuffer, blocks, outputPath, options?) 정확히 선언 |
| **스펙 준수: IPdfRebuildGenerator** | 통과 | `src/pdf/interfaces/pdf-rebuild-generator.interface.ts:6-8` — rebuild(blocks, outputPath, options?) 정확히 선언 |
| **스펙 준수: ITranslationService** | 통과 | `src/translation/interfaces/translation-service.interface.ts:1-5` — translate(), translateBatch(), getSupportedLanguages() 모두 선언 |
| **스펙 준수: TranslationProvider enum** | 통과 | `src/common/enums/translation-provider.enum.ts:1-4` — MYMEMORY='mymemory', GEMINI='gemini' |
| **스펙 준수: OutputMode enum** | 통과 | `src/common/enums/output-mode.enum.ts:1-4` — OVERLAY='overlay', REBUILD='rebuild' |
| **스펙 준수: TranslationException (BAD_GATEWAY)** | 통과 | `src/common/exceptions/translation.exception.ts:1-7` — HttpStatus.BAD_GATEWAY 사용 |
| **스펙 준수: stub 메서드 throw** | 실패 | 스펙은 `throw new Error('Not implemented: Phase 1')` 요구. 실제 구현은 `throw new NotImplementedException('Phase 1')` 사용 (`pdf-extractor.service.ts:7,11`, `translate.command.ts:50`, `translation-service.factory.ts:8` 등 전체). NotImplementedException은 NestJS HttpException 계열 (HTTP 501)이므로 CLI 환경에서는 불필요한 HTTP 스택이 포함됨. 메시지도 `'Not implemented: Phase 1'`이 아닌 `'Phase 1'`만 전달 |
| **스펙 준수: AppModule** | 통과 | `src/app.module.ts:6-12` — ConfigModule.forRoot({ isGlobal: true }), PdfModule, TranslationModule 모두 포함 |
| **스펙 준수: CliModule** | 통과 | `src/cli/cli.module.ts:7-14` — ConfigModule.forRoot({ isGlobal: true }), PdfModule, TranslationModule, TranslateCommand providers 포함 |
| **스펙 준수: PdfModule exports** | 통과 | `src/pdf/pdf.module.ts:17` — PDF_EXTRACTOR, PDF_OVERLAY_GENERATOR, PDF_REBUILD_GENERATOR export |
| **스펙 준수: TranslationModule** | 통과 | `src/translation/translation.module.ts:6-9` — 세 서비스 provide, TranslationServiceFactory export |
| **스펙 준수: cli.ts CommandFactory.run** | 통과 | `src/cli.ts:4-6` — CommandFactory.run(CliModule) 정확히 호출 |
| **스펙 준수: main.ts ValidationPipe** | 통과 | `src/main.ts:7` — new ValidationPipe({ transform: true }) 사용 |
| **스펙 준수: spec 파일 존재** | 실패 | `cli.module.spec.ts` 와 `translate.command.spec.ts` 미존재. 스펙에서 "모든 모듈/서비스에 .spec.ts"를 요구하나 CliModule 및 TranslateCommand에 대한 spec이 없음. app.module.spec.ts는 존재하나 TranslationServiceFactory spec도 없음(translation.module.spec.ts로 간접 확인은 되나 서비스 단위 미작성). |
| **스펙 준수: TranslateCommand 옵션 (--mode, --pages)** | 실패 | `src/cli/commands/translate.command.ts` — 스펙 CLI 사용법에 명시된 `--mode overlay\|rebuild`와 `--pages 1-5,10` 옵션이 Phase 0 보일러플레이트임에도 인터페이스 선언조차 없음. TranslateCommandOptions에도 `mode`, `pages` 필드 누락. Phase 1이 이 옵션들을 기반으로 구현해야 하므로 최소한 옵션 파서(stub)는 있어야 함 |
| **에러 핸들링** | 조건부 통과 | stub 메서드는 예외를 throw하므로 미구현 상태가 명확히 드러남. 다만 NotImplementedException(HTTP 501) 사용이 CLI 컨텍스트에서 혼란을 일으킬 수 있음 (`translate.command.ts:50`) |
| **보안** | 통과 | Phase 0 보일러플레이트 수준으로 외부 입력 처리 없음. .env는 코드에 포함되지 않음 |
| **가독성** | 통과 | 디렉토리 구조가 CLAUDE.md 설계와 일치하고, 주석(`// Phase 3+: HTTP API endpoints`)으로 의도가 명시됨. 5분 이내 파악 가능 |
| **tsconfig strict 모드** | 통과 | `tsconfig.json:19` — `"strict": true` 설정 (strictNullChecks, noImplicitAny도 중복 명시) |
| **package.json 엔진 버전** | 경미한 지적 | `package.json:7` — `"pnpm": ">=8.0.0"` 이나 CLAUDE.md/mise.toml은 pnpm 9를 지정. `>=9.0.0`으로 정렬 필요 |

## 질의 사항
없음

## 최적 개선 제안

1. **stub 예외 타입 변경**: `NotImplementedException` → `throw new Error('Not implemented: Phase 1')` 로 변경. NestJS HTTP 예외를 CLI stub에 사용하면 Phase 1 구현자가 왜 501이 발생하는지 의아하게 느낄 수 있음. 또한 스펙 문구(`'Not implemented: Phase 1'`)와도 불일치.

2. **TranslateCommand 옵션 보완**: `--mode`(overlay|rebuild) 및 `--pages` 옵션 파서 stub을 추가하고 `TranslateCommandOptions`에 `mode?: string; pages?: string` 필드를 추가해 Phase 1 구현 준비.

3. **누락 spec 파일 추가**: `src/cli/cli.module.spec.ts`, `src/cli/commands/translate.command.spec.ts` 최소한 DI resolve/인스턴스화 확인 테스트 작성.

4. **pnpm 버전 정렬**: `package.json` engines 항목 `"pnpm": ">=8.0.0"` → `"pnpm": ">=9.0.0"` (mise.toml 기준과 일치).

5. **TranslationServiceFactory 타입 안전성**: `create(_provider: TranslationProvider)` 반환 타입이 `ITranslationService`로 선언되어 있으나, throw 전에 Phase 1 구현자가 switch/if 블록 틀이라도 있으면 가이드가 됨. 필수는 아님.

## 판정
REQUEST_CHANGES

## 수정 요청

### 필수 수정 (R2 전 해결 필요)

**1. stub 예외 메시지 스펙 불일치**
- 대상 파일: `pdf-extractor.service.ts`, `pdf-overlay-generator.service.ts`, `pdf-rebuild-generator.service.ts`, `mymemory-translation.service.ts`, `gemini-translation.service.ts`, `translation-service.factory.ts`, `translate.command.ts`
- 현재: `throw new NotImplementedException('Phase 1')`
- 요구: `throw new Error('Not implemented: Phase 1')`
- 이유: 스펙 명시 문구 불일치 + CLI 컨텍스트에서 HTTP 예외 불적절

**2. TranslateCommand --mode / --pages 옵션 누락**
- 대상 파일: `src/cli/commands/translate.command.ts`
- CLAUDE.md CLI 사용법에 `--mode overlay|rebuild`, `--pages 1-5,10` 명시
- `TranslateCommandOptions` 인터페이스와 `@Option` 파서 stub 추가 필요

**3. cli.module.spec.ts, translate.command.spec.ts 미존재**
- 스펙: "모든 모듈/서비스에 .spec.ts (DI resolve 확인)"
- CLI 레이어 spec 파일 2개 추가 필요

### 권장 수정

**4. package.json pnpm 버전 정렬**
- `"pnpm": ">=8.0.0"` → `"pnpm": ">=9.0.0"`

## 검수 완료 시각
2026-04-02 22:25
