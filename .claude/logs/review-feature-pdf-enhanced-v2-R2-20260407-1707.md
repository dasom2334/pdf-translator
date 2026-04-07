# 검수 로그

## 대상
- 브랜치: feature/pdf-enhanced-v2
- PR: #42
- 라운드: R2

## 체크리스트 결과
| 항목 | 통과/실패 | 근거 (파일:줄) |
|------|-----------|---------------|
| 스펙 준수 | 통과 | G-5 `/Length` 갱신, 무한 루프 수정, E-2 `getViewport` 중복 제거 모두 반영됨 |
| 엣지케이스 | 조건부 통과 | `dataEnd <= dataStart` 가드(overlay:116), `boxWidth <= 0` 가드(overlay:246), `lengthValueStart === -1` 분기(overlay:208) 처리됨. 단, `/Length` 갱신 후 오프셋 불일치 위험(하기 질의 사항 참조) |
| 에러 핸들링 | 통과 | zlib 실패 시 raw fallback(overlay:127-129), PDF 로드 실패 시 original fallback(overlay:279-287), `writeFileSync` 실패 시 `InternalServerErrorException`(overlay:388-393) |
| 보안 | 통과 | 외부 입력을 파일 경로로 사용 시 `path.dirname` + `mkdirSync`로 처리(overlay:385-388). 인젝션·정보 노출 문제 없음 |
| 가독성 | 통과 | 함수 분리(removeTextOperatorsFromStream / removeTextFromPdfStreams)와 주석이 충분히 작성됨. `extractBlocksFromPage`가 `pageHeight`를 반환하도록 리팩터링되어 호출부가 단순해짐(extractor:250-263) |

## 질의 사항

- Q1: `pdf-overlay-generator.service.ts`:196-214 — `/Length` 값을 스트림 데이터 교체와 별도로 갱신하는 순서에 잠재적 오프셋 문제가 있습니다. 스트림 데이터(rep.start~rep.end)를 먼저 교체하면 pdf 문자열의 길이가 변해 `rep.lengthValueStart/End`(스트림보다 앞에 위치하므로 내림차순 정렬 전제)의 절대 오프셋이 그대로 유효한지 확인이 필요합니다. 내림차순(b.start - a.start) 정렬로 처리하기 때문에 각 반복에서 뒤쪽 스트림을 먼저 교체하면 앞쪽 `/Length` 오프셋은 영향을 받지 않습니다. 이 전제가 의도된 설계인지, PDF 구조상 `/Length`가 항상 자신의 스트림 데이터보다 앞에 위치한다고 가정하고 있는 건지 확인해 주세요. (PDF 스펙 상 해당 가정은 정상이지만, cross-reference stream 등 일부 엣지케이스에서 예외가 발생할 수 있습니다.)

## 최적 개선 제안

- `pdf-overlay-generator.service.ts`:98 — `streamRegex`를 매번 exec()로 순회하는데, 문자열 전체를 메모리에 올린 채 latin1 인코딩으로 처리합니다. 대용량 PDF(수십 MB)에서는 메모리 사용량이 높아질 수 있습니다. 스트림 단위로 청크 처리하는 방식이나 pdf-lib의 공개 API를 활용하면 개선할 수 있습니다. (비필수 — 현재 구현이 스펙을 충족함)
- `pdf-extractor.service.ts`:250-263 — `extractBlocksFromPage`가 `{ blocks, pageHeight }` 객체를 반환하도록 리팩터링된 점은 좋습니다. 다만 반환 타입이 인라인 객체 타입으로 암묵적으로 추론되므로, 명시적 반환 타입 선언을 추가하면 더 읽기 쉽습니다. (비필수)

## 판정
APPROVE

## 수정 요청
없음

## 검수 완료 시각
2026-04-07 17:07
