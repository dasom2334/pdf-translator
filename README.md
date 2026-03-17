# PDF Translator

PDF 파일의 텍스트를 추출하여 번역하고 새 PDF로 생성하는 CLI 프로그램.

## Features

- PDF 텍스트 추출 및 번역
- 다양한 번역 서비스 지원 (MyMemory, Gemini)
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
  --font assets/fonts/NotoSansKR-Regular.ttf
```

### Options

| Option | Short | Description | Required |
|--------|-------|-------------|----------|
| `--input` | `-i` | Input PDF file path | Yes |
| `--target` | `-t` | Target language code | Yes |
| `--source` | `-s` | Source language code | No |
| `--output` | `-o` | Output PDF file path | No |
| `--provider` | `-p` | Translation provider (mymemory\|gemini) | No |
| `--font` | | Path to TTF font file | No |

## Docker Usage

```bash
# Build and run with docker-compose
cd docker
docker-compose up --build

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

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment | `development` |
| `UPLOAD_DIR` | Upload directory | `./uploads` |
| `MAX_FILE_SIZE` | Max file size (bytes) | `10485760` |
| `GEMINI_API_KEY` | Gemini API key | - |

## Phase Roadmap

- **Phase 0**: Project structure and boilerplate ✅
- **Phase 1**: PDF extraction + PDF generation + MyMemory translation + CLI command
- **Phase 2**: Gemini LLM adapter, glossary, page range, config file, bilingual PDF
- **Phase 3+**: HTTP REST API
