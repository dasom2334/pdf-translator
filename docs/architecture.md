# Architecture

## Module Dependency Graph

```mermaid
graph TD
    AppModule --> ConfigModule
    AppModule --> PdfModule
    AppModule --> TranslationModule

    CliModule --> ConfigModule
    CliModule --> PdfModule
    CliModule --> TranslationModule
    CliModule --> TranslateCommand

    PdfModule --> PdfExtractorService
    PdfModule --> PdfGeneratorService

    TranslationModule --> MyMemoryTranslationService
    TranslationModule --> GeminiTranslationService
    TranslationModule --> TranslationServiceFactory
```

## Request Flow (CLI)

```mermaid
sequenceDiagram
    participant User
    participant CLI as TranslateCommand
    participant Factory as TranslationServiceFactory
    participant Extractor as PdfExtractorService
    participant Translator as ITranslationService
    participant Generator as PdfGeneratorService

    User->>CLI: pnpm run cli -- translate -i input.pdf -t ko
    CLI->>Extractor: extractTextByPages(buffer)
    Extractor-->>CLI: pages: string[]
    CLI->>Factory: create(provider)
    Factory-->>CLI: ITranslationService
    loop for each page
        CLI->>Translator: translate(page, sourceLang, targetLang)
        Translator-->>CLI: translatedPage
    end
    CLI->>Generator: generateFromPages(translatedPages, outputPath)
    Generator-->>CLI: void
    CLI-->>User: Translation complete!
```

## Adapter Pattern

번역 서비스는 어댑터 패턴으로 구현되어 있어 쉽게 교체 가능합니다.

```mermaid
classDiagram
    class ITranslationService {
        <<interface>>
        +translate(text, sourceLang, targetLang) Promise~string~
        +translateBatch(texts, sourceLang, targetLang) Promise~string[]~
        +getSupportedLanguages() Promise~string[]~
    }

    class MyMemoryTranslationService {
        +translate(text, sourceLang, targetLang) Promise~string~
        +translateBatch(texts, sourceLang, targetLang) Promise~string[]~
        +getSupportedLanguages() Promise~string[]~
    }

    class GeminiTranslationService {
        +translate(text, sourceLang, targetLang) Promise~string~
        +translateBatch(texts, sourceLang, targetLang) Promise~string[]~
        +getSupportedLanguages() Promise~string[]~
    }

    class TranslationServiceFactory {
        +create(provider) ITranslationService
    }

    ITranslationService <|.. MyMemoryTranslationService
    ITranslationService <|.. GeminiTranslationService
    TranslationServiceFactory --> ITranslationService
```

## Environment Variables Reference

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `NODE_ENV` | Runtime environment | No | `development` |
| `UPLOAD_DIR` | Directory for uploaded files | No | `./uploads` |
| `MAX_FILE_SIZE` | Maximum upload file size in bytes | No | `10485760` (10MB) |
| `GEMINI_API_KEY` | Google Gemini API key (Phase 2+) | Phase 2+ | - |
| `PORT` | HTTP server port (Phase 3+) | Phase 3+ | `3000` |
