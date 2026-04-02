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
    PdfModule --> PdfOverlayGeneratorService
    PdfModule --> PdfRebuildGeneratorService

    TranslationModule --> MyMemoryTranslationService
    TranslationModule --> GeminiTranslationService
    TranslationModule --> TranslationServiceFactory
```

## TextBlock Data Flow

```mermaid
sequenceDiagram
    participant User
    participant CLI as TranslateCommand
    participant Factory as TranslationServiceFactory
    participant Extractor as PdfExtractorService
    participant Translator as ITranslationService
    participant Overlay as PdfOverlayGeneratorService
    participant Rebuild as PdfRebuildGeneratorService

    User->>CLI: pnpm run cli -- translate -i input.pdf -t ko --mode overlay
    CLI->>Extractor: extractBlocksByPages(buffer, pageRange?)
    Extractor-->>CLI: blocks: TextBlock[][]
    CLI->>Factory: create(provider)
    Factory-->>CLI: ITranslationService
    loop for each TextBlock
        CLI->>Translator: translateBatch(texts, sourceLang, targetLang)
        Translator-->>CLI: translatedTexts: string[]
        Note over CLI: block.translatedText = translatedText
    end
    alt mode = overlay
        CLI->>Overlay: overlay(originalBuffer, blocks, outputPath, options?)
        Overlay-->>CLI: void
    else mode = rebuild
        CLI->>Rebuild: rebuild(blocks, outputPath, options?)
        Rebuild-->>CLI: void
    end
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

## PDF Generation Strategy

```mermaid
graph TD
    CLI[TranslateCommand] -->|--mode overlay| Overlay[PdfOverlayGeneratorService]
    CLI -->|--mode rebuild| Rebuild[PdfRebuildGeneratorService]
    Overlay -->|overlay originalBuffer + blocks| OutPDF[output.pdf]
    Rebuild -->|rebuild from blocks| OutPDF
```

## Environment Variables Reference

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `NODE_ENV` | Runtime environment | No | `development` |
| `UPLOAD_DIR` | Directory for uploaded files | No | `./uploads` |
| `MAX_FILE_SIZE` | Maximum upload file size in bytes | No | `10485760` (10MB) |
| `GEMINI_API_KEY` | Google Gemini API key | T-2+ | - |
| `PORT` | HTTP server port (Phase 3+) | Phase 3+ | `3000` |
