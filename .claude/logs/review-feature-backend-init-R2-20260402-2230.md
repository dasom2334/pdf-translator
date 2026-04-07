# Code Review — feature/backend-init R2
**PR:** #23
**Branch:** feature/backend-init
**Round:** 2
**Date:** 2026-04-02
**Reviewer role:** code-reviewer

---

## R1 수정사항 반영 확인

### 1. NotImplementedException → `throw new Error('Not implemented: Phase 1')`

모든 서비스에서 완전히 반영됨.

| 파일 | 줄 | 확인 |
|------|----|------|
| `src/pdf/services/pdf-extractor.service.ts` | 7, 11 | `throw new Error('Not implemented: Phase 1')` |
| `src/pdf/services/pdf-overlay-generator.service.ts` | 11 | `throw new Error('Not implemented: Phase 1')` |
| `src/pdf/services/pdf-rebuild-generator.service.ts` | 10 | `throw new Error('Not implemented: Phase 1')` |
| `src/translation/services/mymemory-translation.service.ts` | 6, 10, 14 | `throw new Error('Not implemented: Phase 1')` |
| `src/translation/services/gemini-translation.service.ts` | 6, 10, 14 | `throw new Error('Not implemented: Phase 1')` |
| `src/translation/factories/translation-service.factory.ts` | 8 | `throw new Error('Not implemented: Phase 1')` |

`NotImplementedException` 잔재 없음. **PASS**

---

### 2. TranslateCommand 옵션 추가 (`--mode`, `--pages`, `-p/--provider`)

`src/cli/commands/translate.command.ts` 확인:

- `-p, --provider <provider>` — `@Option` 데코레이터로 선언, `parseProvider()` 파서 구현, `defaultValue: 'mymemory'` 포함 (34–37행)
- `--mode <mode>` — `@Option` 데코레이터로 선언, `parseMode()` 파서 구현, `defaultValue: 'overlay'` 포함 (39–42행)
- `--pages <range>` — `@Option` 데코레이터로 선언, `parsePages()` 파서 구현 (48–50행)
- `--font <path>` — 추가 옵션도 동시 반영 (44–47행)

`TranslateCommandOptions` 인터페이스(11–18행)에도 모든 필드 반영됨.

nest-commander `@Option` 데코레이터 형식이 올바르게 사용됨. **PASS**

---

### 3. spec 파일 추가 및 DI resolve 테스트

**`src/cli/cli.module.spec.ts`**
- `Test.createTestingModule({ imports: [CliModule] }).compile()` 로 DI 컴파일 검증
- `expect(module).toBeDefined()` 로 모듈 resolve 확인
- **PASS**

**`src/cli/commands/translate.command.spec.ts`**
- `CliModule` import 후 `module.get(TranslateCommand)` 으로 실제 DI resolve 확인
- `expect(command).toBeDefined()` 로 provider 등록 검증
- **PASS**

두 spec 모두 단순 instantiation 이 아닌 NestJS DI 컨테이너 resolve 를 테스트하고 있어 요구사항 충족.

---

### 4. package.json engines pnpm 버전

`package.json` 7행:
```json
"pnpm": ">=9.0.0"
```
`>=8.0.0` → `>=9.0.0` 정상 수정됨. **PASS**

---

## 추가 관찰 사항 (정보성)

- `TranslationServiceFactory.create()` 도 동일하게 `throw new Error('Not implemented: Phase 1')` 처리됨 — 일관성 유지.
- `CliModule` 이 `PdfModule`, `TranslationModule` 을 import하고 `TranslateCommand` 를 provider로 등록하고 있어 spec 테스트가 전체 모듈 트리를 컴파일한다. `ConfigModule.forRoot({ isGlobal: true })` 포함으로 환경변수 의존성도 처리됨.
- `translate.command.ts`의 `run()` 메서드도 `throw new Error('Not implemented: Phase 1')`로 일관되게 처리됨.

---

## 체크리스트 결과

- [x] R1 수정사항 모두 반영 확인
- [x] NotImplementedException 완전히 제거됨
- [x] TranslateCommand 옵션이 nest-commander `@Option` 데코레이터로 올바르게 선언됨
- [x] 새 spec 파일이 DI resolve를 실제로 테스트함
- [x] package.json engines pnpm `>=9.0.0` 으로 수정됨

---

## 판정: APPROVE

R1에서 요청한 모든 수정사항이 정확하게 반영됨. 코드 품질 및 구조도 Phase 0 보일러플레이트 목적에 부합함.
