# Architecture

## Module Dependency Graph

```mermaid
graph TD
    AppModule --> PdfModule
    AppModule --> TranslationModule
    PdfModule --> TranslationModule
    PdfModule --> PdfController
    PdfModule --> PdfService
    TranslationModule --> TranslationServiceFactory
    TranslationModule --> DeepLTranslationService
    TranslationModule --> GoogleTranslationService
    TranslationModule --> LlmTranslationService
```

## Request Sequence

```mermaid
sequenceDiagram
    participant Client
    participant PdfController
    participant PdfService
    participant TranslationServiceFactory
    participant TranslationAdapter

    Client->>PdfController: POST /pdf/translate
    PdfController->>PdfService: translatePdf(dto)
    PdfService->>TranslationServiceFactory: getService(provider)
    TranslationServiceFactory->>TranslationAdapter: instantiate adapter
    PdfService->>TranslationAdapter: translate(text, sourceLang, targetLang)
    TranslationAdapter-->>PdfService: translated text
    PdfService-->>PdfController: TranslationResultDto
    PdfController-->>Client: JSON response
```

## Adapter Pattern

The translation system uses the **Adapter Pattern** to support multiple translation services without changing client code.

```
ITranslationService (interface)
├── DeepLTranslationService
├── GoogleTranslationService
└── LlmTranslationService
```

`TranslationServiceFactory` selects the correct adapter based on the `provider` field in the request.

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `3000` | HTTP server port |
| `NODE_ENV` | No | `development` | Runtime environment |
| `UPLOAD_DIR` | No | `./uploads` | Directory for uploaded PDFs |
| `MAX_FILE_SIZE` | No | `10485760` | Max upload size in bytes (10MB) |
| `DEEPL_API_KEY` | Yes* | — | DeepL API key (*required for DeepL provider) |
| `GOOGLE_TRANSLATE_API_KEY` | Yes* | — | Google Translate API key (*required for Google provider) |
| `GITHUB_TOKEN` | No | — | GitHub token for optional integrations |
| `GITHUB_REPO` | No | — | GitHub repo for optional integrations |
