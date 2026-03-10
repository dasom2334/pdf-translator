# PDF Translator

A CLI backend service for translating PDF files using swappable translation adapters (DeepL, Google, LLM).

## Tech Stack

- **Runtime:** Node.js 22.x LTS (managed by mise)
- **Package Manager:** pnpm 9
- **Framework:** NestJS with strict TypeScript
- **Translation:** Adapter pattern supporting DeepL, Google Translate, LLM

## Quick Start

### Prerequisites

Install [mise](https://mise.jdx.dev/) for Node and pnpm version management:

```bash
mise install
```

### Local Development

```bash
# Install dependencies
pnpm install

# Copy environment variables
cp .env.example .env
# Edit .env with your API keys

# Start development server
pnpm run start:dev
```

The API will be available at `http://localhost:3000`.

### API Usage

#### Translate a PDF

```bash
curl -X POST http://localhost:3000/pdf/translate \
  -H "Content-Type: application/json" \
  -d '{
    "sourceLang": "en",
    "targetLang": "ja",
    "provider": "deepl"
  }'
```

#### Get Supported Languages

```bash
curl http://localhost:3000/pdf/supported-languages
```

## Docker

### Development with Docker Compose

```bash
cd docker
docker compose up
```

### Production Build

```bash
docker build -f docker/Dockerfile -t pdf-translator .
docker run -p 3000:3000 --env-file .env pdf-translator
```

## Phase Roadmap

| Phase | Status | Description |
|-------|--------|-------------|
| Phase 0 | Done | Project structure and boilerplate |
| Phase 1 | In Progress | PDF text extraction + DeepL adapter |
| Phase 2 | Planned | PDF regeneration + Google/LLM adapters |
| Phase 3 | Planned | Error handling, batch processing, hardening |
