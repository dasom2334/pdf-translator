---
description: "현재 브랜치의 변경사항을 코드리뷰"
---

1. `git diff main...HEAD`로 전체 변경사항 확인
2. 다음 관점에서 리뷰:
   - CLAUDE.md의 코딩 규칙 준수 여부
   - Exception Handling Rules 준수 (BadRequest, Internal, Translation, Error 분류)
   - 파일 소유권 침범 여부 (에이전트별 Off-Limits 확인)
   - 테스트 커버리지 (happy path + 에러 케이스)
   - 불필요한 코드/중복
   - 보안 이슈 (하드코딩된 시크릿, 민감 정보 노출)
3. 발견된 이슈를 심각도별로 분류하여 리포트 (🔴 높음 / 🟡 중간 / 🟢 낮음)
