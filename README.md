# PDF Translator

PDF 파일을 업로드하면 번역된 결과를 반환하는 CLI 백엔드 서비스.

프론트엔드 없이 curl/Postman으로 사용하며, 어댑터 패턴으로 번역 서비스(DeepL, Google, LLM)를 교체할 수 있습니다.

## 기술 스택

| 항목 | 내용 |
|------|------|
| Runtime | Node.js 18.18.0 |
| Framework | NestJS |
| Language | TypeScript |
| 아키텍처 | 어댑터 패턴 (ITranslationService) |
| 번역 서비스 | DeepL / Google Translate / LLM (교체 가능) |

## 아키텍처 개요

```
AppModule
├── PdfModule       — PDF 업로드, 텍스트 추출
└── TranslationModule — 번역 서비스 팩토리 + 어댑터
```

어댑터 패턴을 통해 `TRANSLATION_PROVIDER` 환경변수만 바꾸면 번역 서비스를 런타임에 교체할 수 있습니다.

상세 아키텍처는 [docs/architecture.md](docs/architecture.md)를 참고하세요.

## Quick Start

**사전 요구사항:** [mise](https://mise.jdx.dev/) (또는 Node 18.18.0), npm

```bash
mise install          # Node 버전 자동 설치
npm install
cp .env.example .env  # 환경변수 설정
npm run start:dev
```

**사용 예시:**

```bash
# 지원 언어 조회
curl http://localhost:3000/pdf/supported-languages

# PDF 번역 요청
curl -X POST http://localhost:3000/pdf/translate \
  -F "file=@document.pdf" \
  -F "sourceLang=en" \
  -F "targetLang=ko"
```

## Docker 실행

```bash
docker-compose -f docker/docker-compose.yml up
```

## Phase 로드맵

- **Phase 0**: 프로젝트 구조 및 보일러플레이트 ✅
- **Phase 1**: PDF 텍스트 추출 + DeepL 어댑터 구현
- **Phase 2**: PDF 재생성 + Google/LLM 어댑터
- **Phase 3**: 에러 핸들링, 배치 처리, 고도화
