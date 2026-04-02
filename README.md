# PDF Translator

PDF 파일의 텍스트를 위치 정보 포함하여 추출 후 번역하고, 원본 좌표에 치환하여 새 PDF로 생성하는 CLI 프로그램.

## Features

- PDF 텍스트 추출 및 번역 (위치 정보 보존)
- 다양한 번역 서비스 지원 (MyMemory, Gemini)
- overlay / rebuild 두 가지 PDF 생성 전략
- 커스텀 폰트 지원 (한국어 등 CJK 문자)
- NestJS 어댑터 패턴으로 확장 가능

## Requirements

- Node.js 22 LTS
- pnpm 9

## Installation

```bash
pnpm install
```

## CLI Usage

```bash
# Basic usage
pnpm run cli -- translate -i input.pdf -t ko

# With all options
pnpm run cli -- translate \
  -i input.pdf \
  -t ko \
  -s en \
  -o output.pdf \
  -p mymemory \
  --mode overlay \
  --font assets/fonts/NotoSansKR-Regular.ttf \
  --pages 1-5,10
```

### Options

| Option | Short | Description | Required |
|--------|-------|-------------|----------|
| `--input` | `-i` | Input PDF file path | Yes |
| `--target` | `-t` | Target language code | Yes |
| `--source` | `-s` | Source language code | No |
| `--output` | `-o` | Output PDF file path | No |
| `--provider` | `-p` | Translation provider (`mymemory`\|`gemini`) | No |
| `--mode` | | PDF generation strategy (`overlay`\|`rebuild`) | No |
| `--font` | | Path to TTF font file | No |
| `--pages` | | Page range to translate (e.g. `1-5,10`) | No |

## Docker Usage

```bash
# Build and run with docker-compose
cd docker
docker compose up --build

# Or build manually
docker build -f docker/Dockerfile -t pdf-translator .
docker run -p 3000:3000 --env-file .env pdf-translator
```

## Development

```bash
# Install dependencies
pnpm install

# Run in development mode
pnpm run start:dev

# Run CLI
pnpm run cli -- translate --help

# Run tests
pnpm test

# Run lint
pnpm run lint

# Build
pnpm run build
```

## Environment Variables

Copy `.env.example` to `.env` and fill in values.

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment | `development` |
| `UPLOAD_DIR` | Upload directory | `./uploads` |
| `MAX_FILE_SIZE` | Max file size (bytes) | `10485760` |
| `GEMINI_API_KEY` | Gemini API key | - |

## Phase Command Execution Order

| Phase Command | Description | Prerequisite |
|---------------|-------------|--------------|
| `/phase0` | Parallel: backend-builder + infra-builder | — |
| `/phase1-1` | Parallel: pdf-builder (E-1) + translation-builder (T-1, T-2) | phase0 merged |
| `/phase1-2` | pdf-builder (G-1, G-2) | phase1-1 merged |
| `/phase1-3` | cli-builder (C-1, C-2) | phase1-2 merged |
| `/phase2-1` | Parallel: pdf-builder (E-2, G-3, G-5) + translation-builder (T-3, T-4) | phase1-3 merged |
| `/phase2-2` | cli-builder (C-3, C-4, C-5) | phase2-1 merged |

## Phase Roadmap

- **Phase 0**: Project structure and boilerplate
- **Phase 1**: PDF extraction (E-1) + overlay generation (G-1, G-2) + MyMemory/Gemini translation (T-1, T-2) + CLI command (C-1, C-2)
- **Phase 2**: Enhanced extraction (E-2) + rebuild/bilingual PDF (G-3, G-5) + translation quality (T-3, T-4) + advanced CLI (C-3, C-4, C-5)
- **Phase 3+**: HTTP REST API
