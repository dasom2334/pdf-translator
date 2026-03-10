import { Module } from '@nestjs/common';
import { DeepLTranslationService } from './services/deepl-translation.service';
import { GoogleTranslationService } from './services/google-translation.service';
import { LlmTranslationService } from './services/llm-translation.service';
import { TranslationServiceFactory } from './factories/translation-service.factory';

@Module({
  providers: [
    DeepLTranslationService,
    GoogleTranslationService,
    LlmTranslationService,
    TranslationServiceFactory,
  ],
  exports: [TranslationServiceFactory],
})
export class TranslationModule {}
