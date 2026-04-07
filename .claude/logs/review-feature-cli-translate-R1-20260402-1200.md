# 검수 로그

## 대상
- 브랜치: feature/cli-translate
- PR: #35
- 라운드: R1

## 체크리스트 결과
| 항목 | 통과/실패 | 근거 (파일:줄) |
|------|-----------|---------------|
| 스펙 준수 | 실패 | translate.command.ts:59-61 — `run()` 메서드가 `throw new Error('Not implemented: Phase 1')`로 전체 로직 미구현. fs.readFile, extractBlocksByPages, translateBatch, 1:1 매핑, overlay/rebuild 분기, rebuild 미구현 시 에러 메시지+process.exit(1) 모두 없음. |
| 엣지케이스 | 실패 | run() 미구현으로 null/빈 값/경계값 처리 자체가 없음. -i 옵션 파서(translate.command.ts:19-22)에서 파일 경로 유효성 검증 없음. --provider 옵션(줄 39)에서 mymemory/gemini 외 값 입력 시 검증 없음. --mode 옵션(줄 44)도 동일. |
| 에러 핸들링 | 실패 | 스펙 요구: try/catch로 유저 친화적 메시지 + process.exit(1). translate.command.ts:59 — 구현 자체가 없어 에러 핸들링 전무. |
| 보안 | 해당없음 | run()이 미구현이므로 실제 파일 접근이 없어 평가 불가. |
| 가독성 | 통과 | translate.command.ts 전체 — 옵션 정의 구조는 명확하고 각 @Option 데코레이터에 description이 있음. TranslateCommandOptions 인터페이스(줄 3-12)가 타입을 잘 문서화함. |

## 질의 사항
없음.

## 최적 개선 제안
- translate.command.ts:39 — provider 파서에서 `TranslationProvider` enum 값으로 즉시 검증하여 존재하지 않는 provider로 실행되지 않도록 방어할 것. 이는 run() 진입 전에 실패를 빨리 잡는 fail-fast 패턴에 부합함.
- translate.command.ts:44 — mode 파서에서 `OutputMode` enum 값으로 즉시 검증 권장.
- translate.command.spec.ts:6-13 — 현재 테스트가 단순히 `TranslateCommand`가 DI 컨테이너에서 resolve되는지만 확인함. run() 구현 후에는 실제 동작(성공 케이스, 에러 케이스, rebuild 분기 등)을 커버하는 단위 테스트가 반드시 추가되어야 함.
- test/app.e2e-spec.ts — 파일 자체가 존재하지 않음. E2E 테스트 파일이 스펙에 요구되었으나 생성되지 않음.

## 판정
REQUEST_CHANGES

## 수정 요청
1. `src/cli/commands/translate.command.ts`:59-61 — `run()` 메서드 내부를 스펙대로 구현할 것: (1) `fs.readFile`로 입력 파일 읽기, (2) `IPdfExtractor.extractBlocksByPages(buffer, options.pages)`로 페이지별 블록 추출, (3) 모든 블록을 flat하게 합쳐 `ITranslationService.translateBatch(texts, source, target)` 호출, (4) 결과를 1:1로 `block.translatedText`에 매핑, (5) `options.mode === 'overlay'`이면 `IPdfOverlayGenerator.overlay()`, `'rebuild'`이면 에러 메시지 출력 후 `process.exit(1)`, (6) 전체를 try/catch로 감싸 에러 발생 시 유저 친화적 메시지 출력 후 `process.exit(1)`.
2. `src/cli/commands/translate.command.ts`:59 — `run()` 시그니처를 `async run(_passedParams: string[], options?: TranslateCommandOptions): Promise<void>`에서 options를 non-optional로 변경하거나, options가 undefined일 때 early return + 에러 처리를 추가할 것. 현재 options가 optional이라 내부에서 options.input 접근 시 TS strict 모드에서 컴파일 오류가 발생할 수 있음.
3. `src/cli/commands/translate.command.ts`:전체 — `IPdfExtractor`, `IPdfOverlayGenerator`, `TranslationServiceFactory` 등 필요한 의존성을 생성자 주입으로 추가할 것. 현재 생성자가 없어 DI가 불가능한 상태임.
4. `src/cli/commands/translate.command.spec.ts`:전체 — run() 구현 후 실제 동작을 검증하는 단위 테스트를 추가할 것: 성공 케이스(overlay 모드), rebuild 모드 호출 시 process.exit(1) 호출 여부, 파일 읽기 실패 시 process.exit(1) 호출 여부 등.
5. `test/app.e2e-spec.ts` — 스펙에 E2E 테스트가 요구되었으나 파일이 존재하지 않음. CLI translate 커맨드의 E2E 테스트 파일을 생성할 것.

## 검수 완료 시각
2026-04-02 12:00
