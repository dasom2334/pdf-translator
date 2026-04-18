import { Module } from '@nestjs/common';
import { MyMemoryTranslationService } from './services/mymemory-translation.service';
import { GeminiTranslationService } from './services/gemini-translation.service';
import { LocalLlmTranslationService } from './services/local-llm-translation.service';
import { GlossaryService } from './services/glossary.service';
import { TranslationServiceFactory } from './factories/translation-service.factory';

@Module({
  providers: [
    GlossaryService,
    MyMemoryTranslationService,
    GeminiTranslationService,
    LocalLlmTranslationService,
    TranslationServiceFactory,
  ],
  exports: [TranslationServiceFactory],
})
export class TranslationModule {}
